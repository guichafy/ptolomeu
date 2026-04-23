import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent } from "@/shared/agent-protocol";
import {
	buildAgentEvents,
	createEventMapperContext,
	type EventMapperContext,
} from "./event-mapper";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const VERBOSE = process.env.CLAUDE_LOG_VERBOSE === "1";
const verbose = (...args: unknown[]) => {
	if (VERBOSE) console.log(...args);
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Abstraction for pushing stream events to the renderer.
 * Injected so this module stays decoupled from the RPC layer.
 */
export type StreamMessageSender = {
	sendChunk: (sessionId: string, chunk: unknown) => void;
	/**
	 * Typed agent event channel. Runs in parallel with sendChunk while the
	 * chat UI migrates to AI Elements. Defaults to no-op so older call sites
	 * that only wire sendChunk keep working.
	 */
	sendEvent?: (sessionId: string, event: AgentEvent) => void;
	sendEnd: (
		sessionId: string,
		result: {
			subtype: string;
			result?: string;
			totalCostUsd?: number;
			durationMs?: number;
			usage?: { input: number; output: number };
		},
	) => void;
	sendError: (sessionId: string, error: string) => void;
};

/** A content block for persistence (mirrors StoredMessageV2 blocks). */
export type PersistBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string; durationMs?: number }
	| {
			type: "tool_use";
			id: string;
			name: string;
			input: unknown;
			status: "running" | "done" | "error";
			elapsedSeconds?: number;
	  }
	| {
			type: "tool_result";
			toolUseId: string;
			content: string;
			isError?: boolean;
	  };

/** Metadata extracted from the SDK result message. */
export type ResultMeta = {
	totalCostUsd?: number;
	durationMs?: number;
	usage?: { input: number; output: number };
};

/**
 * Abstraction for persisting assistant messages.
 * Injected so this module stays decoupled from the storage layer.
 */
export type MessagePersister = {
	appendMessage: (
		sessionId: string,
		role: "assistant",
		blocks: PersistBlock[],
		meta?: ResultMeta,
	) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts all structured content blocks from a complete SDKAssistantMessage.
 * Returns text, thinking, and tool_use blocks for persistence.
 */
function extractBlocksFromAssistantMessage(
	msg: SDKMessage,
): PersistBlock[] | null {
	if (msg.type !== "assistant") return null;
	const assistantMsg = msg as {
		type: "assistant";
		message: {
			content: Array<{
				type: string;
				text?: string;
				thinking?: string;
				id?: string;
				name?: string;
				input?: unknown;
			}>;
		};
	};
	const blocks: PersistBlock[] = [];
	for (const block of assistantMsg.message.content) {
		switch (block.type) {
			case "text":
				if (typeof block.text === "string" && block.text) {
					blocks.push({ type: "text", text: block.text });
				}
				break;
			case "thinking":
				if (typeof block.thinking === "string" && block.thinking) {
					blocks.push({ type: "thinking", thinking: block.thinking });
				}
				break;
			case "tool_use":
				blocks.push({
					type: "tool_use",
					id: block.id ?? "",
					name: block.name ?? "",
					input: block.input ?? {},
					status: "done",
				});
				break;
		}
	}
	return blocks.length > 0 ? blocks : null;
}

/**
 * Extracts tool_result blocks from synthetic SDK user messages.
 * These carry the output of tool executions.
 */
function extractToolResultsFromUserMessage(
	msg: SDKMessage,
): PersistBlock[] | null {
	if (msg.type !== "user") return null;
	const userMsg = msg as {
		type: "user";
		message: {
			content:
				| string
				| Array<{
						type: string;
						tool_use_id?: string;
						content?: string | Array<{ type: string; text?: string }>;
						is_error?: boolean;
				  }>;
		};
	};
	if (typeof userMsg.message?.content === "string") return null;
	if (!Array.isArray(userMsg.message?.content)) return null;

	const blocks: PersistBlock[] = [];
	for (const block of userMsg.message.content) {
		if (block.type === "tool_result" && block.tool_use_id) {
			let contentStr = "";
			if (typeof block.content === "string") {
				contentStr = block.content;
			} else if (Array.isArray(block.content)) {
				contentStr = block.content
					.filter(
						(b): b is { type: string; text: string } =>
							b.type === "text" && typeof b.text === "string",
					)
					.map((b) => b.text)
					.join("");
			}
			blocks.push({
				type: "tool_result",
				toolUseId: block.tool_use_id,
				content: contentStr,
				isError: block.is_error ?? false,
			});
		}
	}
	return blocks.length > 0 ? blocks : null;
}

// ---------------------------------------------------------------------------
// Streaming loop
// ---------------------------------------------------------------------------

/**
 * Consumes the async stream from an SDK session, forwarding each message to
 * the sender and persisting the final assistant text once the result arrives.
 *
 * This function resolves when the stream ends (either by result or by the
 * generator returning). It rejects only on unexpected errors; normal SDK
 * errors (e.g. max turns) are forwarded via `sender.sendEnd`.
 */
export async function startStreamingLoop(
	session: { stream(): AsyncGenerator<SDKMessage, void> },
	sessionId: string,
	sender: StreamMessageSender,
	persister: MessagePersister,
): Promise<void> {
	const t0 = Date.now();
	console.log(`[claude:stream] loop start: sessionId=${sessionId}`);

	// Thinking blocks come from stream_event deltas (the SDK omits them
	// from the complete assistant message).
	let accumulatedBlocks: PersistBlock[] = [];
	const toolElapsed = new Map<string, number>();
	let currentThinking = "";
	let thinkingStartTime: number | null = null;
	const pendingThinkingBlocks: PersistBlock[] = [];
	let chunkCount = 0;
	let resultCount = 0;
	const mapperCtx: EventMapperContext = createEventMapperContext();

	function pushAgentEvents(msg: SDKMessage): void {
		if (!sender.sendEvent) return;
		for (const event of buildAgentEvents(msg, mapperCtx)) {
			sender.sendEvent(sessionId, event);
		}
	}

	try {
		for await (const msg of session.stream()) {
			chunkCount++;
			verbose(
				`[claude:stream] chunk #${chunkCount}: sessionId=${sessionId} type=${msg.type}`,
			);
			pushAgentEvents(msg);
			sender.sendChunk(sessionId, msg);

			// Track thinking blocks from stream_event deltas.
			// These may not appear in the complete assistant message.
			if (msg.type === "stream_event") {
				const partial = msg as {
					type: "stream_event";
					event: {
						type: string;
						index?: number;
						content_block?: { type: string };
						delta?: { type: string; thinking?: string };
					};
				};
				const evt = partial.event;

				if (
					evt.type === "content_block_start" &&
					evt.content_block?.type === "thinking"
				) {
					verbose(`[claude:stream] thinking start: sessionId=${sessionId}`);
					currentThinking = "";
					thinkingStartTime = Date.now();
				} else if (
					evt.type === "content_block_delta" &&
					evt.delta?.type === "thinking_delta" &&
					typeof evt.delta.thinking === "string"
				) {
					currentThinking += evt.delta.thinking;
				} else if (evt.type === "content_block_stop" && currentThinking) {
					const durationMs = thinkingStartTime
						? Date.now() - thinkingStartTime
						: undefined;
					verbose(
						`[claude:stream] thinking stop: sessionId=${sessionId} durationMs=${durationMs} chars=${currentThinking.length}`,
					);
					pendingThinkingBlocks.push({
						type: "thinking",
						thinking: currentThinking,
						durationMs,
					});
					currentThinking = "";
					thinkingStartTime = null;
				}
			}

			// Collect structured blocks from complete assistant messages
			const assistantBlocks = extractBlocksFromAssistantMessage(msg);
			if (assistantBlocks !== null) {
				// Check if assistant message already has thinking blocks
				const hasThinking = assistantBlocks.some((b) => b.type === "thinking");
				if (!hasThinking && pendingThinkingBlocks.length > 0) {
					// Prepend stream-accumulated thinking blocks
					accumulatedBlocks.push(...pendingThinkingBlocks);
				}
				accumulatedBlocks.push(...assistantBlocks);
				pendingThinkingBlocks.length = 0;
				verbose(
					`[claude:stream] assistant blocks extracted: sessionId=${sessionId} count=${assistantBlocks.length} types=[${assistantBlocks.map((b) => b.type).join(",")}]`,
				);
			}

			// Collect tool_result blocks from synthetic user messages
			const toolResults = extractToolResultsFromUserMessage(msg);
			if (toolResults !== null) {
				accumulatedBlocks.push(...toolResults);
				verbose(
					`[claude:stream] tool_result blocks: sessionId=${sessionId} count=${toolResults.length}`,
				);
			}

			// Track tool elapsed time from progress events
			if (msg.type === "tool_progress") {
				const progress = msg as {
					type: "tool_progress";
					tool_use_id: string;
					elapsed_time_seconds: number;
				};
				toolElapsed.set(progress.tool_use_id, progress.elapsed_time_seconds);
				verbose(
					`[claude:stream] tool_progress: id=${progress.tool_use_id} elapsed=${progress.elapsed_time_seconds}s`,
				);
			}

			if (msg.type === "result") {
				resultCount++;
				const result = msg as {
					type: "result";
					subtype: string;
					result?: string;
					total_cost_usd?: number;
					duration_ms?: number;
					usage?: { input_tokens?: number; output_tokens?: number };
				};

				const meta: ResultMeta = {};
				if (typeof result.total_cost_usd === "number") {
					meta.totalCostUsd = result.total_cost_usd;
				}
				if (typeof result.duration_ms === "number") {
					meta.durationMs = result.duration_ms;
				}
				if (result.usage) {
					const input = result.usage.input_tokens;
					const output = result.usage.output_tokens;
					if (typeof input === "number" && typeof output === "number") {
						meta.usage = { input, output };
					}
				}

				if (pendingThinkingBlocks.length > 0) {
					accumulatedBlocks.unshift(...pendingThinkingBlocks);
					pendingThinkingBlocks.length = 0;
				}

				for (const block of accumulatedBlocks) {
					if (block.type === "tool_use" && toolElapsed.has(block.id)) {
						block.elapsedSeconds = toolElapsed.get(block.id);
					}
				}

				console.log(
					`[claude:stream] result: sessionId=${sessionId} subtype=${result.subtype} blocks=${accumulatedBlocks.length} cost=${meta.totalCostUsd ?? "?"} durationMs=${meta.durationMs ?? "?"} tokens=${meta.usage ? `${meta.usage.input}/${meta.usage.output}` : "?"}`,
				);

				// Persist BEFORE sendEnd so the frontend's loadMessages sees the
				// new message if it re-reads during the onEnd handler.
				if (accumulatedBlocks.length > 0) {
					verbose(
						`[claude:stream] persisting assistant message: sessionId=${sessionId} blocks=${accumulatedBlocks.length}`,
					);
					await persister.appendMessage(
						sessionId,
						"assistant",
						accumulatedBlocks,
						meta,
					);
				} else if (result.result) {
					verbose(
						`[claude:stream] persisting fallback text result: sessionId=${sessionId}`,
					);
					await persister.appendMessage(
						sessionId,
						"assistant",
						[{ type: "text", text: result.result }],
						meta,
					);
				}

				verbose(`[claude:stream] sendEnd: sessionId=${sessionId}`);
				sender.sendEnd(sessionId, {
					subtype: result.subtype,
					result: result.result,
					totalCostUsd: meta.totalCostUsd,
					durationMs: meta.durationMs,
					usage: meta.usage,
				});

				accumulatedBlocks = [];
				toolElapsed.clear();
			}
		}

		console.log(
			`[claude:stream] loop end: sessionId=${sessionId} chunks=${chunkCount} results=${resultCount} (${Date.now() - t0}ms)`,
		);
	} catch (err) {
		const errorMessage =
			err instanceof Error ? err.message : "Unknown streaming error";

		console.error(
			`[claude:stream] loop error: sessionId=${sessionId} chunks=${chunkCount} (${Date.now() - t0}ms)`,
			err,
		);

		if (pendingThinkingBlocks.length > 0) {
			accumulatedBlocks.unshift(...pendingThinkingBlocks);
		}

		if (accumulatedBlocks.length > 0) {
			try {
				await persister.appendMessage(
					sessionId,
					"assistant",
					accumulatedBlocks,
				);
			} catch {
				// Best-effort — don't mask the original error
			}
		}

		sender.sendError(sessionId, errorMessage);
	}
}

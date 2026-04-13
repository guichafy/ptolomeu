import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Abstraction for pushing stream events to the renderer.
 * Injected so this module stays decoupled from the RPC layer.
 */
export type StreamMessageSender = {
	sendChunk: (sessionId: string, chunk: unknown) => void;
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
 * Extracts text content from an SDKAssistantMessage.
 *
 * The `message.content` array contains blocks; text blocks have
 * `{ type: "text", text: string }`.
 */
function extractTextFromAssistantMessage(msg: SDKMessage): string | null {
	if (msg.type !== "assistant") return null;
	const assistantMsg = msg as {
		type: "assistant";
		message: { content: Array<{ type: string; text?: string }> };
	};
	const parts: string[] = [];
	for (const block of assistantMsg.message.content) {
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}
	return parts.length > 0 ? parts.join("") : null;
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
	// Accumulate assistant text across potentially multiple assistant messages
	// within a single turn.
	let accumulatedText = "";

	try {
		for await (const msg of session.stream()) {
			// Forward every message as a chunk to the renderer
			sender.sendChunk(sessionId, msg);

			// Collect text from full assistant messages
			const text = extractTextFromAssistantMessage(msg);
			if (text !== null) {
				accumulatedText += text;
			}

			// Collect text from partial (streaming) assistant messages.
			// SDKPartialAssistantMessage carries a BetaRawMessageStreamEvent;
			// when the event type is content_block_delta with a text_delta we
			// can extract incremental text.
			if (msg.type === "stream_event") {
				const partial = msg as {
					type: "stream_event";
					event: { type: string; delta?: { type: string; text?: string } };
				};
				if (
					partial.event.type === "content_block_delta" &&
					partial.event.delta?.type === "text_delta" &&
					typeof partial.event.delta.text === "string"
				) {
					accumulatedText += partial.event.delta.text;
				}
			}

			// When we receive a result message the turn is over.
			if (msg.type === "result") {
				const result = msg as {
					type: "result";
					subtype: string;
					result?: string;
					total_cost_usd?: number;
					duration_ms?: number;
					usage?: { input_tokens?: number; output_tokens?: number };
				};

				// Build metadata from the SDK result
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

				sender.sendEnd(sessionId, {
					subtype: result.subtype,
					result: result.result,
					totalCostUsd: meta.totalCostUsd,
					durationMs: meta.durationMs,
					usage: meta.usage,
				});

				// Persist accumulated assistant text (or the result string as fallback)
				const textToPersist = accumulatedText || result.result || "";
				if (textToPersist) {
					const blocks: PersistBlock[] = [
						{ type: "text", text: textToPersist },
					];
					await persister.appendMessage(sessionId, "assistant", blocks, meta);
				}

				// Reset for a potential next turn (the generator may continue
				// if the caller sends follow-up messages).
				accumulatedText = "";
			}
		}
	} catch (err) {
		const errorMessage =
			err instanceof Error ? err.message : "Unknown streaming error";
		sender.sendError(sessionId, errorMessage);

		// Still try to persist whatever we collected so far
		if (accumulatedText) {
			try {
				const blocks: PersistBlock[] = [
					{ type: "text", text: accumulatedText },
				];
				await persister.appendMessage(sessionId, "assistant", blocks);
			} catch {
				// Best-effort persistence — do not mask the original error
			}
		}
	}
}

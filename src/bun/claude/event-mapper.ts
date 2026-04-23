/**
 * Pure event mapper: `SDKMessage` → `AgentEvent[]`.
 *
 * Extracted from `streaming.ts` so the translation is testable in isolation.
 * The caller owns an `EventMapperContext` that carries stream state across
 * calls (active content blocks, tool-call registry, current message id, …).
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, TokenUsage } from "@/shared/agent-protocol";

// Narrow SDK stream event variants out of the SDKMessage union for use by
// the content_block_* helpers. Extract distributes correctly when the left
// side of `extends` is a union alias.
type StreamEvent = Extract<SDKMessage, { type: "stream_event" }>["event"];
type ContentBlockStart = Extract<StreamEvent, { type: "content_block_start" }>;
type ContentBlockDelta = Extract<StreamEvent, { type: "content_block_delta" }>;
type ContentBlockStop = Extract<StreamEvent, { type: "content_block_stop" }>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ActiveBlock =
	| { kind: "text"; messageId: string }
	| { kind: "thinking"; messageId: string; startedAt: number }
	| { kind: "tool_use"; toolCallId: string; toolName: string };

export interface EventMapperContext {
	/** Last `message_start` id seen in the stream, used for text/reasoning events. */
	currentMessageId: string | null;
	/** Block index → active block. Populated on content_block_start. */
	activeBlocks: Map<number, ActiveBlock>;
	/** toolCallId → toolName, preserved across events for tool_result correlation. */
	toolCallNames: Map<string, string>;
	/** toolCallId → parentToolCallId (from the wrapping assistant message). */
	toolCallParents: Map<string, string | null>;
	/** Assistant message UUIDs whose tool_use blocks we already turned into tool-call events. */
	emittedAssistantMessages: Set<string>;
}

export function createEventMapperContext(): EventMapperContext {
	return {
		currentMessageId: null,
		activeBlocks: new Map(),
		toolCallNames: new Map(),
		toolCallParents: new Map(),
		emittedAssistantMessages: new Set(),
	};
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export function buildAgentEvents(
	msg: SDKMessage,
	ctx: EventMapperContext,
): AgentEvent[] {
	switch (msg.type) {
		case "stream_event":
			return mapStreamEvent(msg, ctx);
		case "assistant":
			return mapAssistantMessage(msg, ctx);
		case "user":
			return mapUserMessage(msg);
		case "tool_progress":
			return mapToolProgress(msg);
		case "system":
			return mapSystemMessage(msg);
		case "result":
			return mapResult(msg);
		case "prompt_suggestion":
			return [
				{
					type: "prompt-suggestions",
					suggestions: [msg.suggestion],
				},
			];
		default:
			return [];
	}
}

// ---------------------------------------------------------------------------
// stream_event (SDKPartialAssistantMessage)
// ---------------------------------------------------------------------------

function mapStreamEvent(
	msg: Extract<SDKMessage, { type: "stream_event" }>,
	ctx: EventMapperContext,
): AgentEvent[] {
	const { event } = msg;
	switch (event.type) {
		case "message_start": {
			ctx.currentMessageId = event.message.id;
			return [];
		}
		case "content_block_start":
			return onContentBlockStart(event, msg.parent_tool_use_id, ctx);
		case "content_block_delta":
			return onContentBlockDelta(event, ctx);
		case "content_block_stop":
			return onContentBlockStop(event, ctx);
		default:
			return [];
	}
}

function onContentBlockStart(
	event: ContentBlockStart,
	parentToolCallId: string | null,
	ctx: EventMapperContext,
): AgentEvent[] {
	const { index, content_block } = event;
	const messageId = ctx.currentMessageId ?? "unknown";
	switch (content_block.type) {
		case "text": {
			ctx.activeBlocks.set(index, { kind: "text", messageId });
			return [{ type: "text-start", messageId, parentToolCallId }];
		}
		case "thinking": {
			const startedAt = Date.now();
			ctx.activeBlocks.set(index, { kind: "thinking", messageId, startedAt });
			return [{ type: "reasoning-start", messageId, parentToolCallId }];
		}
		case "tool_use": {
			const toolCallId = content_block.id;
			const toolName = content_block.name;
			ctx.activeBlocks.set(index, { kind: "tool_use", toolCallId, toolName });
			ctx.toolCallNames.set(toolCallId, toolName);
			ctx.toolCallParents.set(toolCallId, parentToolCallId);
			return [
				{
					type: "tool-input-start",
					toolCallId,
					toolName,
					parentToolCallId,
				},
			];
		}
		default:
			return [];
	}
}

function onContentBlockDelta(
	event: ContentBlockDelta,
	ctx: EventMapperContext,
): AgentEvent[] {
	const block = ctx.activeBlocks.get(event.index);
	if (!block) return [];
	const { delta } = event;
	if (delta.type === "text_delta" && block.kind === "text") {
		return [
			{ type: "text-delta", messageId: block.messageId, delta: delta.text },
		];
	}
	if (delta.type === "thinking_delta" && block.kind === "thinking") {
		return [
			{
				type: "reasoning-delta",
				messageId: block.messageId,
				delta: delta.thinking,
			},
		];
	}
	if (delta.type === "input_json_delta" && block.kind === "tool_use") {
		return [
			{
				type: "tool-input-delta",
				toolCallId: block.toolCallId,
				argsDelta: delta.partial_json,
			},
		];
	}
	return [];
}

function onContentBlockStop(
	event: ContentBlockStop,
	ctx: EventMapperContext,
): AgentEvent[] {
	const block = ctx.activeBlocks.get(event.index);
	if (!block) return [];
	ctx.activeBlocks.delete(event.index);
	if (block.kind === "text") {
		return [{ type: "text-end", messageId: block.messageId }];
	}
	if (block.kind === "thinking") {
		const durationMs = Date.now() - block.startedAt;
		return [{ type: "reasoning-end", messageId: block.messageId, durationMs }];
	}
	// tool_use stop: the full tool-call event is emitted when the assistant
	// message arrives with complete args (see mapAssistantMessage).
	return [];
}

// ---------------------------------------------------------------------------
// assistant (SDKAssistantMessage)
// ---------------------------------------------------------------------------

function mapAssistantMessage(
	msg: Extract<SDKMessage, { type: "assistant" }>,
	ctx: EventMapperContext,
): AgentEvent[] {
	if (ctx.emittedAssistantMessages.has(msg.uuid)) return [];
	ctx.emittedAssistantMessages.add(msg.uuid);

	const events: AgentEvent[] = [];
	const parentToolCallId = msg.parent_tool_use_id;

	for (const block of msg.message.content) {
		if (block.type !== "tool_use") continue;
		const toolCallId = block.id;
		const toolName = block.name;
		ctx.toolCallNames.set(toolCallId, toolName);
		ctx.toolCallParents.set(toolCallId, parentToolCallId);
		events.push({
			type: "tool-call",
			toolCallId,
			toolName,
			args: block.input,
			parentToolCallId,
		});
	}
	return events;
}

// ---------------------------------------------------------------------------
// user (SDKUserMessage) — carries tool_result blocks
// ---------------------------------------------------------------------------

function mapUserMessage(
	msg: Extract<SDKMessage, { type: "user" }>,
): AgentEvent[] {
	const content = msg.message.content;
	if (typeof content === "string") return [];
	if (!Array.isArray(content)) return [];

	const events: AgentEvent[] = [];
	for (const block of content) {
		if (typeof block !== "object" || block === null) continue;
		if ((block as { type?: string }).type !== "tool_result") continue;
		const toolBlock = block as {
			type: "tool_result";
			tool_use_id: string;
			content: string | Array<{ type: string; text?: string }>;
			is_error?: boolean;
		};
		const resultText = stringifyToolResultContent(toolBlock.content);
		if (toolBlock.is_error) {
			events.push({
				type: "tool-error",
				toolCallId: toolBlock.tool_use_id,
				error: { message: resultText, raw: toolBlock.content },
			});
		} else {
			events.push({
				type: "tool-result",
				toolCallId: toolBlock.tool_use_id,
				result: toolBlock.content,
			});
		}
	}
	return events;
}

function stringifyToolResultContent(
	content: string | Array<{ type: string; text?: string }>,
): string {
	if (typeof content === "string") return content;
	return content
		.filter(
			(b): b is { type: "text"; text: string } =>
				b.type === "text" && typeof b.text === "string",
		)
		.map((b) => b.text)
		.join("");
}

// ---------------------------------------------------------------------------
// tool_progress
// ---------------------------------------------------------------------------

function mapToolProgress(
	msg: Extract<SDKMessage, { type: "tool_progress" }>,
): AgentEvent[] {
	return [
		{
			type: "tool-progress",
			toolCallId: msg.tool_use_id,
			elapsedSeconds: msg.elapsed_time_seconds,
		},
	];
}

// ---------------------------------------------------------------------------
// system messages (session_state_changed, task_*)
// ---------------------------------------------------------------------------

function mapSystemMessage(
	msg: Extract<SDKMessage, { type: "system" }>,
): AgentEvent[] {
	switch (msg.subtype) {
		case "session_state_changed":
			return [
				{
					type: "session-state-change",
					sessionId: msg.session_id,
					state: msg.state,
				},
			];
		case "task_started":
			return [
				{
					type: "task-start",
					taskId: msg.task_id,
					toolCallId: msg.tool_use_id,
					description: msg.description,
					taskType: msg.task_type,
					parentToolCallId: msg.tool_use_id ?? null,
					skipTranscript: msg.skip_transcript,
				},
			];
		case "task_progress":
			return [
				{
					type: "task-progress",
					taskId: msg.task_id,
					description: msg.description,
					lastToolName: msg.last_tool_name,
					usage: {
						totalTokens: msg.usage.total_tokens,
						toolUses: msg.usage.tool_uses,
						durationMs: msg.usage.duration_ms,
					},
				},
			];
		case "task_updated":
			return [
				{
					type: "task-update",
					taskId: msg.task_id,
					patch: {
						status: msg.patch.status,
						description: msg.patch.description,
						endTime: msg.patch.end_time,
						error: msg.patch.error,
						isBackgrounded: msg.patch.is_backgrounded,
					},
				},
			];
		case "task_notification":
			return [
				{
					type: "task-end",
					taskId: msg.task_id,
					toolCallId: msg.tool_use_id,
					status: msg.status,
					summary: msg.summary,
					outputFile: msg.output_file,
					usage: msg.usage
						? {
								totalTokens: msg.usage.total_tokens,
								toolUses: msg.usage.tool_uses,
								durationMs: msg.usage.duration_ms,
							}
						: undefined,
				},
			];
		default:
			return [];
	}
}

// ---------------------------------------------------------------------------
// result
// ---------------------------------------------------------------------------

function mapResult(msg: Extract<SDKMessage, { type: "result" }>): AgentEvent[] {
	const usage: TokenUsage = {
		inputTokens: msg.usage.input_tokens,
		outputTokens: msg.usage.output_tokens,
	};
	if (typeof msg.usage.cache_read_input_tokens === "number") {
		usage.cacheReadTokens = msg.usage.cache_read_input_tokens;
	}
	if (typeof msg.usage.cache_creation_input_tokens === "number") {
		usage.cacheCreationTokens = msg.usage.cache_creation_input_tokens;
	}
	return [
		{
			type: "finish",
			reason: msg.subtype,
			usage,
			totalCostUsd: msg.total_cost_usd,
			durationMs: msg.duration_ms,
		},
	];
}

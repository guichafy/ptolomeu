/**
 * Pure reducer: `AgentEvent` → `AgentState`. Consumed by `useAgentChat`.
 *
 * Keeps no references to React, RPC, or timers, so it can be tested with
 * simple event fixtures.
 */

import type { AgentEvent, TokenUsage } from "@/shared/agent-protocol";

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

export type AgentTextPart = {
	kind: "text";
	messageId: string;
	text: string;
	streaming: boolean;
	parentToolCallId: string | null;
};

export type AgentReasoningPart = {
	kind: "reasoning";
	messageId: string;
	text: string;
	streaming: boolean;
	durationMs?: number;
	parentToolCallId: string | null;
};

export type AgentToolPart = {
	kind: "tool";
	toolCallId: string;
	toolName: string;
	parentToolCallId: string | null;
	status: "pending" | "running" | "completed" | "error";
	/** Streaming partial JSON accumulated from input_json_delta events. */
	argsStreaming: string;
	/** Fully parsed args once the assistant message arrives. */
	args: unknown;
	result?: unknown;
	error?: { message: string; raw?: unknown };
	elapsedSeconds?: number;
};

export type AgentPart = AgentTextPart | AgentReasoningPart | AgentToolPart;

export interface AgentMessage {
	id: string;
	role: "assistant" | "user";
	parts: AgentPart[];
	createdAt: number;
}

export interface PendingPermission {
	permissionId: string;
	toolCallId: string;
	toolName: string;
	args: unknown;
	suggestions?: string[];
	blockedPath?: string;
	decisionReason?: string;
	createdAt: number;
}

export interface TaskState {
	taskId: string;
	toolCallId?: string;
	description: string;
	taskType?: string;
	parentToolCallId: string | null;
	status: "pending" | "running" | "completed" | "failed" | "killed" | "stopped";
	lastToolName?: string;
	summary?: string;
	outputFile?: string;
	usage?: { totalTokens: number; toolUses: number; durationMs: number };
}

export type SessionState = "idle" | "running" | "requires_action" | "error";

export interface AgentState {
	sessionId: string | null;
	sessionState: SessionState;
	/** Completed assistant messages from prior turns. */
	messages: AgentMessage[];
	/** In-flight assistant message being streamed. Null when no turn is active. */
	currentMessage: AgentMessage | null;
	pendingPermissions: PendingPermission[];
	tasks: Record<string, TaskState>;
	lastError: { message: string; code?: string; recoverable: boolean } | null;
	usage: TokenUsage | null;
	totalCostUsd: number | null;
	durationMs: number | null;
	suggestions: string[];
}

export function initialAgentState(): AgentState {
	return {
		sessionId: null,
		sessionState: "idle",
		messages: [],
		currentMessage: null,
		pendingPermissions: [],
		tasks: {},
		lastError: null,
		usage: null,
		totalCostUsd: null,
		durationMs: null,
		suggestions: [],
	};
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduceAgentState(
	state: AgentState,
	event: AgentEvent,
): AgentState {
	switch (event.type) {
		case "session-start":
			return {
				...initialAgentState(),
				sessionId: event.sessionId,
				sessionState: "running",
			};

		case "session-state-change":
			return { ...state, sessionState: event.state };

		case "session-end":
			return {
				...state,
				sessionState: event.reason === "error" ? "error" : "idle",
				currentMessage: null,
			};

		case "text-start":
			return upsertPart(state, event.messageId, {
				kind: "text",
				messageId: event.messageId,
				text: "",
				streaming: true,
				parentToolCallId: event.parentToolCallId,
			});

		case "text-delta":
			return updateTextPart(state, event.messageId, (part) => ({
				...part,
				text: part.text + event.delta,
			}));

		case "text-end":
			return updateTextPart(state, event.messageId, (part) => ({
				...part,
				streaming: false,
			}));

		case "reasoning-start":
			return upsertPart(state, event.messageId, {
				kind: "reasoning",
				messageId: event.messageId,
				text: "",
				streaming: true,
				parentToolCallId: event.parentToolCallId,
			});

		case "reasoning-delta":
			return updateReasoningPart(state, event.messageId, (part) => ({
				...part,
				text: part.text + event.delta,
			}));

		case "reasoning-end":
			return updateReasoningPart(state, event.messageId, (part) => ({
				...part,
				streaming: false,
				durationMs: event.durationMs,
			}));

		case "tool-input-start":
			return upsertToolPart(state, event.toolCallId, {
				kind: "tool",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				parentToolCallId: event.parentToolCallId,
				status: "running",
				argsStreaming: "",
				args: undefined,
			});

		case "tool-input-delta":
			return updateToolPart(state, event.toolCallId, (part) => ({
				...part,
				argsStreaming: part.argsStreaming + event.argsDelta,
			}));

		case "tool-call":
			return updateOrCreateToolPart(
				state,
				event.toolCallId,
				(part) => ({
					...part,
					toolName: event.toolName,
					args: event.args,
					status: part.status === "error" ? "error" : "running",
				}),
				{
					kind: "tool",
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					parentToolCallId: event.parentToolCallId,
					status: "running",
					argsStreaming: "",
					args: event.args,
				},
			);

		case "tool-progress":
			return updateToolPart(state, event.toolCallId, (part) => ({
				...part,
				elapsedSeconds: event.elapsedSeconds,
			}));

		case "tool-result":
			return updateToolPart(state, event.toolCallId, (part) => ({
				...part,
				status: "completed",
				result: event.result,
			}));

		case "tool-error":
			return updateToolPart(state, event.toolCallId, (part) => ({
				...part,
				status: "error",
				error: event.error,
			}));

		case "tool-permission-request":
			return {
				...state,
				sessionState: "requires_action",
				pendingPermissions: [
					...state.pendingPermissions,
					{
						permissionId: event.permissionId,
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						args: event.args,
						suggestions: event.suggestions,
						blockedPath: event.blockedPath,
						decisionReason: event.decisionReason,
						createdAt: Date.now(),
					},
				],
			};

		case "task-start":
			return {
				...state,
				tasks: {
					...state.tasks,
					[event.taskId]: {
						taskId: event.taskId,
						toolCallId: event.toolCallId,
						description: event.description,
						taskType: event.taskType,
						parentToolCallId: event.parentToolCallId,
						status: "running",
					},
				},
			};

		case "task-progress":
			return updateTask(state, event.taskId, (task) => ({
				...task,
				description: event.description,
				lastToolName: event.lastToolName,
				usage: event.usage,
			}));

		case "task-update":
			return updateTask(state, event.taskId, (task) => ({
				...task,
				status: event.patch.status ?? task.status,
				description: event.patch.description ?? task.description,
			}));

		case "task-end":
			return updateTask(state, event.taskId, (task) => ({
				...task,
				status: event.status,
				summary: event.summary,
				outputFile: event.outputFile,
				usage: event.usage ?? task.usage,
			}));

		case "prompt-suggestions":
			return { ...state, suggestions: [...event.suggestions] };

		case "finish":
			return finalizeMessage(
				state,
				event.usage,
				event.totalCostUsd,
				event.durationMs,
			);

		case "error":
			return {
				...state,
				lastError: event.error,
				sessionState: event.error.recoverable ? state.sessionState : "error",
			};

		default:
			return state;
	}
}

/**
 * Remove a pending permission from state. Commands are not events, so the
 * hook invokes this directly after approve/reject RPCs succeed.
 */
export function resolvePermission(
	state: AgentState,
	permissionId: string,
): AgentState {
	const remaining = state.pendingPermissions.filter(
		(p) => p.permissionId !== permissionId,
	);
	if (remaining.length === state.pendingPermissions.length) return state;
	return {
		...state,
		pendingPermissions: remaining,
		sessionState:
			remaining.length === 0 && state.sessionState === "requires_action"
				? "running"
				: state.sessionState,
	};
}

/**
 * Append an optimistic user message to state. The hook calls this when the
 * user submits from the composer, before the RPC round-trip.
 */
export function appendUserMessage(
	state: AgentState,
	id: string,
	text: string,
): AgentState {
	return {
		...state,
		messages: [
			...state.messages,
			{
				id,
				role: "user",
				parts: [
					{
						kind: "text",
						messageId: id,
						text,
						streaming: false,
						parentToolCallId: null,
					},
				],
				createdAt: Date.now(),
			},
		],
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureCurrentMessage(
	state: AgentState,
	messageId: string,
): AgentState & { currentMessage: AgentMessage } {
	if (state.currentMessage) {
		return state as AgentState & { currentMessage: AgentMessage };
	}
	const message: AgentMessage = {
		id: messageId,
		role: "assistant",
		parts: [],
		createdAt: Date.now(),
	};
	return { ...state, currentMessage: message };
}

function upsertPart(
	state: AgentState,
	messageId: string,
	part: AgentTextPart | AgentReasoningPart,
): AgentState {
	const withMessage = ensureCurrentMessage(state, messageId);
	return {
		...withMessage,
		currentMessage: {
			...withMessage.currentMessage,
			parts: [...withMessage.currentMessage.parts, part],
		},
	};
}

function updateTextPart(
	state: AgentState,
	messageId: string,
	update: (part: AgentTextPart) => AgentTextPart,
): AgentState {
	if (!state.currentMessage) return state;
	let touched = false;
	const parts = state.currentMessage.parts.map((p) => {
		if (p.kind !== "text") return p;
		if (p.messageId !== messageId) return p;
		if (!p.streaming) return p;
		touched = true;
		return update(p);
	});
	if (!touched) return state;
	return {
		...state,
		currentMessage: { ...state.currentMessage, parts },
	};
}

function updateReasoningPart(
	state: AgentState,
	messageId: string,
	update: (part: AgentReasoningPart) => AgentReasoningPart,
): AgentState {
	if (!state.currentMessage) return state;
	let touched = false;
	const parts = state.currentMessage.parts.map((p) => {
		if (p.kind !== "reasoning") return p;
		if (p.messageId !== messageId) return p;
		if (!p.streaming) return p;
		touched = true;
		return update(p);
	});
	if (!touched) return state;
	return {
		...state,
		currentMessage: { ...state.currentMessage, parts },
	};
}

function upsertToolPart(
	state: AgentState,
	toolCallId: string,
	part: AgentToolPart,
): AgentState {
	// Tools may start streaming before we've seen any text content, so the
	// current message may still be null. Synthesize one keyed off the tool
	// call id; it'll be reconciled later when text-start or tool-call fire.
	const messageId = state.currentMessage?.id ?? `pending:${toolCallId}`;
	const withMessage = ensureCurrentMessage(state, messageId);
	return {
		...withMessage,
		currentMessage: {
			...withMessage.currentMessage,
			parts: [...withMessage.currentMessage.parts, part],
		},
	};
}

function updateToolPart(
	state: AgentState,
	toolCallId: string,
	update: (part: AgentToolPart) => AgentToolPart,
): AgentState {
	if (!state.currentMessage) return state;
	let touched = false;
	const parts = state.currentMessage.parts.map((p) => {
		if (p.kind !== "tool") return p;
		if (p.toolCallId !== toolCallId) return p;
		touched = true;
		return update(p);
	});
	if (!touched) return state;
	return {
		...state,
		currentMessage: { ...state.currentMessage, parts },
	};
}

function updateOrCreateToolPart(
	state: AgentState,
	toolCallId: string,
	update: (part: AgentToolPart) => AgentToolPart,
	create: AgentToolPart,
): AgentState {
	const existing = state.currentMessage?.parts.find(
		(p): p is AgentToolPart => p.kind === "tool" && p.toolCallId === toolCallId,
	);
	if (existing) return updateToolPart(state, toolCallId, update);
	return upsertToolPart(state, toolCallId, create);
}

function updateTask(
	state: AgentState,
	taskId: string,
	update: (task: TaskState) => TaskState,
): AgentState {
	const task = state.tasks[taskId];
	if (!task) return state;
	return { ...state, tasks: { ...state.tasks, [taskId]: update(task) } };
}

function finalizeMessage(
	state: AgentState,
	usage: TokenUsage,
	totalCostUsd: number | undefined,
	durationMs: number | undefined,
): AgentState {
	const base: AgentState = {
		...state,
		sessionState: "idle",
		usage,
		totalCostUsd: totalCostUsd ?? state.totalCostUsd,
		durationMs: durationMs ?? state.durationMs,
	};
	if (!state.currentMessage) return base;
	return {
		...base,
		messages: [...state.messages, state.currentMessage],
		currentMessage: null,
	};
}

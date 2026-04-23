/**
 * Shared agent protocol. Types cross the Electrobun RPC boundary between the
 * main process (Bun) and the renderer (React chatview). Do not import anything
 * from `@anthropic-ai/claude-agent-sdk` here — the renderer bundle must not
 * pull the Node-only SDK.
 */

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

/** Mirrors SDK `PermissionMode`. Keep values in sync with @anthropic-ai/claude-agent-sdk. */
export type PermissionMode =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "plan"
	| "dontAsk"
	| "auto";

export type ThinkingConfig =
	| { type: "adaptive" }
	| { type: "enabled"; budgetTokens?: number }
	| { type: "disabled" };

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type SettingSource = "user" | "project" | "local";

export type SystemPrompt =
	| string
	| {
			type: "preset";
			preset: "claude_code";
			append?: string;
			excludeDynamicSections?: boolean;
	  };

export interface SessionConfig {
	systemPrompt?: SystemPrompt;
	allowedTools?: string[];
	disallowedTools?: string[];
	mcpServers?: string[];
	permissionMode?: PermissionMode;
	thinking?: ThinkingConfig;
	effort?: Effort;
	settingSources?: SettingSource[];
	maxBudgetUsd?: number;
	model?: string;
}

// ---------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------

export type MessagePart =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

export type MessageContent = string | MessagePart[];

// ---------------------------------------------------------------------------
// Permission HITL
// ---------------------------------------------------------------------------

/** Mirrors SDK `PermissionResult["behavior"]`. */
export type PermissionBehavior = "allow" | "deny";

export type ApproveBehavior =
	| "allow"
	| "allow-modified"
	| "always-allow-this-session";

export interface ToolDecision {
	permissionId: string;
	sessionId: string;
	toolCallId: string;
	toolName: string;
	argsHash: string;
	decision: "allow" | "allow-modified" | "deny" | "timeout";
	decidedBy: "user" | "auto-whitelist" | "auto-timeout";
	decidedAt: string;
	reason?: string;
}

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens?: number;
	cacheCreationTokens?: number;
}

// ---------------------------------------------------------------------------
// Events (main → renderer)
// ---------------------------------------------------------------------------

export type AgentEvent =
	// Session lifecycle
	| { type: "session-start"; sessionId: string; resumedFrom?: string }
	| {
			type: "session-state-change";
			sessionId: string;
			state: "idle" | "running" | "requires_action";
	  }
	| {
			type: "session-end";
			sessionId: string;
			reason: "completed" | "cancelled" | "error";
	  }

	// Text streaming
	| { type: "text-start"; messageId: string; parentToolCallId: string | null }
	| { type: "text-delta"; messageId: string; delta: string }
	| { type: "text-end"; messageId: string }

	// Reasoning (extended thinking)
	| {
			type: "reasoning-start";
			messageId: string;
			parentToolCallId: string | null;
	  }
	| { type: "reasoning-delta"; messageId: string; delta: string }
	| { type: "reasoning-end"; messageId: string; durationMs?: number }

	// Tool lifecycle
	| {
			type: "tool-input-start";
			toolCallId: string;
			toolName: string;
			parentToolCallId: string | null;
	  }
	| { type: "tool-input-delta"; toolCallId: string; argsDelta: string }
	| {
			type: "tool-call";
			toolCallId: string;
			toolName: string;
			args: unknown;
			parentToolCallId: string | null;
	  }
	| {
			type: "tool-progress";
			toolCallId: string;
			elapsedSeconds: number;
	  }
	| { type: "tool-result"; toolCallId: string; result: unknown }
	| {
			type: "tool-error";
			toolCallId: string;
			error: { message: string; raw?: unknown };
	  }

	// HITL permission
	| {
			type: "tool-permission-request";
			permissionId: string;
			toolCallId: string;
			toolName: string;
			args: unknown;
			suggestions?: string[];
			blockedPath?: string;
			decisionReason?: string;
	  }

	// Subagent tasks (maps SDKTaskStarted/Progress/Updated/Notification)
	| {
			type: "task-start";
			taskId: string;
			toolCallId?: string;
			description: string;
			taskType?: string;
			parentToolCallId: string | null;
			skipTranscript?: boolean;
	  }
	| {
			type: "task-progress";
			taskId: string;
			description: string;
			lastToolName?: string;
			usage: { totalTokens: number; toolUses: number; durationMs: number };
	  }
	| {
			type: "task-update";
			taskId: string;
			patch: {
				status?: "pending" | "running" | "completed" | "failed" | "killed";
				description?: string;
				endTime?: number;
				error?: string;
				isBackgrounded?: boolean;
			};
	  }
	| {
			type: "task-end";
			taskId: string;
			toolCallId?: string;
			status: "completed" | "failed" | "stopped";
			summary: string;
			outputFile?: string;
			usage?: { totalTokens: number; toolUses: number; durationMs: number };
	  }

	// Suggestions (pt autocomplete in composer)
	| { type: "prompt-suggestions"; suggestions: string[] }

	// Finish / error
	| {
			type: "finish";
			reason: string;
			usage: TokenUsage;
			totalCostUsd?: number;
			durationMs?: number;
	  }
	| {
			type: "error";
			error: { message: string; code?: string; recoverable: boolean };
	  };

// ---------------------------------------------------------------------------
// Commands (renderer → main)
// ---------------------------------------------------------------------------

export type AgentCommand =
	| { type: "start-session"; config: SessionConfig; initialPrompt?: string }
	| { type: "send-message"; content: MessageContent }
	| {
			type: "approve-tool";
			permissionId: string;
			behavior: ApproveBehavior;
			modifiedArgs?: unknown;
	  }
	| { type: "reject-tool"; permissionId: string; reason?: string }
	| { type: "inject-message"; content: string }
	| { type: "cancel" }
	| { type: "resume-session"; sessionId: string; messageUuid?: string };

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isAgentEvent(value: unknown): value is AgentEvent {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof (value as { type: unknown }).type === "string"
	);
}

export function isTextEvent(
	event: AgentEvent,
): event is Extract<AgentEvent, { type: `text-${string}` }> {
	return event.type.startsWith("text-");
}

export function isToolEvent(
	event: AgentEvent,
): event is Extract<AgentEvent, { type: `tool-${string}` }> {
	return event.type.startsWith("tool-");
}

export function isTaskEvent(
	event: AgentEvent,
): event is Extract<AgentEvent, { type: `task-${string}` }> {
	return event.type.startsWith("task-");
}

// ---------------------------------------------------------------------------
// Content blocks — units of display within a ChatMessage
// ---------------------------------------------------------------------------

export interface TextBlock {
	type: "text";
	text: string;
}

export interface ThinkingBlock {
	type: "thinking";
	thinking: string;
	durationMs?: number;
}

export interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
	status: "running" | "done" | "error";
	elapsedSeconds?: number;
}

export interface ToolResultBlock {
	type: "tool_result";
	toolUseId: string;
	content: string;
	isError?: boolean;
}

export type ChatBlock =
	| TextBlock
	| ThinkingBlock
	| ToolUseBlock
	| ToolResultBlock;

// ---------------------------------------------------------------------------
// ChatMessage — a single message in the conversation
// ---------------------------------------------------------------------------

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	blocks: ChatBlock[];
	timestamp: string;
	cost?: number;
	durationMs?: number;
	tokenUsage?: { input: number; output: number };
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export type SessionState = "idle" | "streaming" | "tool_running" | "error";

// ---------------------------------------------------------------------------
// Stored messages — persistence format
// ---------------------------------------------------------------------------

/** Legacy format (v1): plain text content. */
export interface StoredMessageV1 {
	role: "user" | "assistant";
	content: string;
	timestamp: string;
}

/** Current format (v2): structured content blocks. */
export interface StoredMessageV2 {
	version: 2;
	role: "user" | "assistant";
	blocks: ChatBlock[];
	timestamp: string;
	cost?: number;
	durationMs?: number;
	tokenUsage?: { input: number; output: number };
}

export type StoredMessage = StoredMessageV1 | StoredMessageV2;

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

function isV2(msg: StoredMessage): msg is StoredMessageV2 {
	return "version" in msg && (msg as StoredMessageV2).version === 2;
}

/** Promote a v1 message to v2 by wrapping content in a text block. */
export function migrateStoredMessage(msg: StoredMessage): StoredMessageV2 {
	if (isV2(msg)) return msg;
	return {
		version: 2,
		role: msg.role,
		blocks: [{ type: "text", text: msg.content }],
		timestamp: msg.timestamp,
	};
}

/** Convert a StoredMessageV2 to a ChatMessage for UI rendering. */
export function storedToChatMessage(
	msg: StoredMessageV2,
	index: number,
): ChatMessage {
	return {
		id: `stored-${index}-${msg.timestamp}`,
		role: msg.role,
		blocks: msg.blocks,
		timestamp: msg.timestamp,
		cost: msg.cost,
		durationMs: msg.durationMs,
		tokenUsage: msg.tokenUsage,
	};
}

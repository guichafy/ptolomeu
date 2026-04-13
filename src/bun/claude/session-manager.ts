import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SDKSession } from "@anthropic-ai/claude-agent-sdk";
import {
	unstable_v2_createSession,
	unstable_v2_resumeSession,
} from "@anthropic-ai/claude-agent-sdk";
import { loadSettings } from "../settings";
import type {
	MessagePersister,
	PersistBlock,
	ResultMeta,
	StreamMessageSender,
} from "./streaming";
import { startStreamingLoop } from "./streaming";

// ---------------------------------------------------------------------------
// Claude CLI path resolution
// ---------------------------------------------------------------------------

let cachedClaudePath: string | null = null;

async function findClaudeCli(): Promise<string> {
	if (cachedClaudePath) return cachedClaudePath;

	// 1. Try Bun.which (checks PATH)
	const fromPath = Bun.which("claude");
	if (fromPath) {
		cachedClaudePath = fromPath;
		return fromPath;
	}

	// 2. Check common install locations
	const home = homedir();
	const candidates = [
		join(home, ".local", "bin", "claude"),
		join(home, ".claude", "bin", "claude"),
		"/usr/local/bin/claude",
	];

	for (const candidate of candidates) {
		const file = Bun.file(candidate);
		if (await file.exists()) {
			cachedClaudePath = candidate;
			return candidate;
		}
	}

	throw new Error(
		"Claude Code CLI não encontrado. Instale com: npm install -g @anthropic-ai/claude-code",
	);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMeta {
	id: string;
	sdkSessionId: string;
	title: string;
	cwd: string | null;
	model: string;
	authMode: "anthropic" | "bedrock";
	createdAt: string;
	updatedAt: string;
	messageCount: number;
	lastMessage: string;
}

export interface SessionIndex {
	version: 1;
	sessions: SessionMeta[];
}

/** Legacy format (v1): plain text content. */
export interface StoredMessageV1 {
	role: "user" | "assistant";
	content: string;
	timestamp: string;
}

/** Block type for V2 persistence (mirrors PersistBlock from streaming). */
export type StoredBlock =
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

/** Current format (v2): structured content blocks. */
export interface StoredMessageV2 {
	version: 2;
	role: "user" | "assistant";
	blocks: StoredBlock[];
	timestamp: string;
	cost?: number;
	durationMs?: number;
	tokenUsage?: { input: number; output: number };
}

export type StoredMessage = StoredMessageV1 | StoredMessageV2;

/** Type guard for V2 messages. */
function isV2(msg: StoredMessage): msg is StoredMessageV2 {
	return "version" in msg && (msg as StoredMessageV2).version === 2;
}

/** Promote a v1 message to v2 by wrapping content in a text block. */
function migrateStoredMessage(msg: StoredMessage): StoredMessageV2 {
	if (isV2(msg)) return msg;
	return {
		version: 2,
		role: msg.role,
		blocks: [{ type: "text", text: msg.content }],
		timestamp: msg.timestamp,
	};
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SESSIONS_DIR = join(homedir(), ".ptolomeu", "sessions");
const INDEX_PATH = join(SESSIONS_DIR, "index.json");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let activeSession: SDKSession | null = null;
let activeSessionId: string | null = null;

/**
 * Injected by the RPC layer (Etapa 5) before any session is created.
 * Falls back to no-op implementations so the module works stand-alone.
 */
let sender: StreamMessageSender = {
	sendChunk: () => {},
	sendEnd: () => {},
	sendError: () => {},
};

/**
 * Configure the sender used to push stream events to the renderer.
 */
export function setSender(s: StreamMessageSender): void {
	sender = s;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function ensureSessionsDir(): Promise<void> {
	await mkdir(SESSIONS_DIR, { recursive: true });
}

async function readIndex(): Promise<SessionIndex> {
	const file = Bun.file(INDEX_PATH);
	if (!(await file.exists())) {
		return { version: 1, sessions: [] };
	}
	try {
		const parsed = JSON.parse(await file.text());
		if (
			parsed &&
			typeof parsed === "object" &&
			parsed.version === 1 &&
			Array.isArray(parsed.sessions)
		) {
			return parsed as SessionIndex;
		}
		return { version: 1, sessions: [] };
	} catch {
		return { version: 1, sessions: [] };
	}
}

async function writeIndex(index: SessionIndex): Promise<void> {
	await ensureSessionsDir();
	await Bun.write(INDEX_PATH, JSON.stringify(index, null, 2));
}

function sessionDir(sessionId: string): string {
	return join(SESSIONS_DIR, sessionId);
}

function messagesPath(sessionId: string): string {
	return join(sessionDir(sessionId), "messages.json");
}

async function readMessages(sessionId: string): Promise<StoredMessageV2[]> {
	const file = Bun.file(messagesPath(sessionId));
	if (!(await file.exists())) return [];
	try {
		const parsed = JSON.parse(await file.text());
		if (!Array.isArray(parsed)) return [];
		return parsed.map((msg: StoredMessage) => migrateStoredMessage(msg));
	} catch {
		return [];
	}
}

async function writeMessages(
	sessionId: string,
	messages: StoredMessageV2[],
): Promise<void> {
	const dir = sessionDir(sessionId);
	await mkdir(dir, { recursive: true });
	await Bun.write(messagesPath(sessionId), JSON.stringify(messages, null, 2));
}

async function appendStoredMessageV2(
	sessionId: string,
	msg: StoredMessageV2,
): Promise<void> {
	const messages = await readMessages(sessionId);
	messages.push(msg);
	await writeMessages(sessionId, messages);

	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === sessionId);
	if (meta) {
		meta.messageCount = messages.length;
		meta.updatedAt = new Date().toISOString();
		if (msg.role === "user") {
			const preview = msg.blocks
				.filter((b): b is { type: "text"; text: string } => b.type === "text")
				.map((b) => b.text)
				.join("")
				.slice(0, 100);
			meta.lastMessage = preview;
		}
		await writeIndex(index);
	}
}

/**
 * Generates a short title from the first user prompt (~50 chars).
 */
function generateTitle(prompt: string): string {
	const cleaned = prompt.replace(/\s+/g, " ").trim();
	if (cleaned.length <= 50) return cleaned;
	return `${cleaned.slice(0, 47)}...`;
}

// ---------------------------------------------------------------------------
// MessagePersister (wired into the streaming loop)
// ---------------------------------------------------------------------------

const persister: MessagePersister = {
	appendMessage: async (
		sessionId: string,
		role: "assistant",
		blocks: PersistBlock[],
		meta?: ResultMeta,
	) => {
		const msg: StoredMessageV2 = {
			version: 2,
			role,
			blocks: blocks as StoredBlock[],
			timestamp: new Date().toISOString(),
			...(meta?.totalCostUsd != null && { cost: meta.totalCostUsd }),
			...(meta?.durationMs != null && { durationMs: meta.durationMs }),
			...(meta?.usage && { tokenUsage: meta.usage }),
		};
		await appendStoredMessageV2(sessionId, msg);
	},
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns metadata for all stored sessions, sorted by most recent first.
 */
export async function listSessions(): Promise<SessionMeta[]> {
	const index = await readIndex();
	return [...index.sessions].sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

/**
 * Creates a new Claude session, sends the initial prompt, and starts the
 * streaming loop. Returns our internal session UUID.
 */
export async function createSession(
	prompt: string,
	cwd?: string,
): Promise<string> {
	const id = crypto.randomUUID();

	// Load current settings for model and permission mode
	const settings = await loadSettings();
	const { model, permissionMode, authMode } = settings.claude;

	// Resolve the Claude CLI path
	const claudePath = await findClaudeCli();

	// Create the SDK session
	const sdkSession = unstable_v2_createSession({
		model,
		permissionMode,
		pathToClaudeCodeExecutable: claudePath,
		allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "LS"],
	});
	// Send the initial prompt — the SDK session needs a user message to begin
	await sdkSession.send(prompt);

	// The sessionId becomes available after the first message is received.
	// We peek at the stream to capture it, then let the streaming loop
	// continue from there.
	let sdkSessionId = "";
	try {
		// Access sessionId — for new sessions it becomes available after send
		sdkSessionId = sdkSession.sessionId;
	} catch {
		// If not yet available, use our UUID as a fallback; we will update
		// once the stream yields a message with session_id.
		sdkSessionId = id;
	}

	// Store as active
	activeSession = sdkSession;
	activeSessionId = id;

	const now = new Date().toISOString();

	// Save metadata
	const meta: SessionMeta = {
		id,
		sdkSessionId,
		title: generateTitle(prompt),
		cwd: cwd ?? null,
		model,
		authMode,
		createdAt: now,
		updatedAt: now,
		messageCount: 1,
		lastMessage: prompt.slice(0, 100),
	};

	const index = await readIndex();
	index.sessions.push(meta);
	await writeIndex(index);

	await appendStoredMessageV2(id, {
		version: 2,
		role: "user",
		blocks: [{ type: "text", text: prompt }],
		timestamp: now,
	});

	// Start the streaming loop (fire-and-forget — it runs until the stream ends)
	startStreamingLoop(sdkSession, id, sender, persister).then(() => {
		// Try to update the sdkSessionId in case it was not available earlier
		try {
			const resolvedId = sdkSession.sessionId;
			if (resolvedId && resolvedId !== meta.sdkSessionId) {
				readIndex().then((idx) => {
					const m = idx.sessions.find((s) => s.id === id);
					if (m) {
						m.sdkSessionId = resolvedId;
						writeIndex(idx);
					}
				});
			}
		} catch {
			// sessionId not available — keep the fallback
		}
	});

	return id;
}

/**
 * Resumes a previously created session by loading its metadata and
 * re-attaching to the SDK session.
 */
export async function resumeSession(sessionId: string): Promise<boolean> {
	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === sessionId);
	if (!meta) return false;

	const settings = await loadSettings();
	const { model } = settings.claude;

	try {
		const claudePath = await findClaudeCli();
		const sdkSession = unstable_v2_resumeSession(meta.sdkSessionId, {
			model,
			pathToClaudeCodeExecutable: claudePath,
		});

		activeSession = sdkSession;
		activeSessionId = sessionId;

		// Start the streaming loop to capture any incoming messages
		startStreamingLoop(sdkSession, sessionId, sender, persister);

		return true;
	} catch {
		return false;
	}
}

/**
 * Sends a follow-up message in the active session.
 * The streaming loop must be running (or will be re-started).
 */
export async function sendMessage(message: string): Promise<void> {
	if (!activeSession || !activeSessionId) {
		throw new Error("No active session");
	}

	await appendStoredMessageV2(activeSessionId, {
		version: 2,
		role: "user",
		blocks: [{ type: "text", text: message }],
		timestamp: new Date().toISOString(),
	});

	// Send to SDK — this triggers a new assistant turn
	await activeSession.send(message);

	// The existing streaming loop (from createSession or resumeSession)
	// will pick up the new messages from session.stream().
	// If the stream ended (result received), we need to restart it.
	startStreamingLoop(activeSession, activeSessionId, sender, persister);
}

/**
 * Stops the currently running generation by closing the SDK session.
 */
export async function stopGeneration(): Promise<boolean> {
	if (!activeSession) return false;

	try {
		activeSession.close();
		activeSession = null;
		return true;
	} catch {
		return false;
	}
}

/**
 * Deletes a session's stored data and removes it from the index.
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
	const index = await readIndex();
	const idx = index.sessions.findIndex((s) => s.id === sessionId);
	if (idx === -1) return false;

	// If this is the active session, close it first
	if (activeSessionId === sessionId && activeSession) {
		try {
			activeSession.close();
		} catch {
			// Ignore close errors
		}
		activeSession = null;
		activeSessionId = null;
	}

	// Remove from index
	index.sessions.splice(idx, 1);
	await writeIndex(index);

	// Remove session directory
	const dir = sessionDir(sessionId);
	try {
		const { rm } = await import("node:fs/promises");
		await rm(dir, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup
	}

	return true;
}

/**
 * Returns all stored messages for a given session.
 */
export async function getSessionMessages(
	sessionId: string,
): Promise<StoredMessageV2[]> {
	return readMessages(sessionId);
}

/**
 * Returns the ID of the currently active session, or null.
 */
export function getActiveSessionId(): string | null {
	return activeSessionId;
}

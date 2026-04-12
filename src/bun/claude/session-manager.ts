import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SDKSession } from "@anthropic-ai/claude-agent-sdk";
import {
	unstable_v2_createSession,
	unstable_v2_resumeSession,
} from "@anthropic-ai/claude-agent-sdk";
import { loadSettings } from "../settings";
import type { MessagePersister, StreamMessageSender } from "./streaming";
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

export interface StoredMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: string;
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

async function readMessages(sessionId: string): Promise<StoredMessage[]> {
	const file = Bun.file(messagesPath(sessionId));
	if (!(await file.exists())) return [];
	try {
		const parsed = JSON.parse(await file.text());
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

async function writeMessages(
	sessionId: string,
	messages: StoredMessage[],
): Promise<void> {
	const dir = sessionDir(sessionId);
	await mkdir(dir, { recursive: true });
	await Bun.write(messagesPath(sessionId), JSON.stringify(messages, null, 2));
}

async function appendStoredMessage(
	sessionId: string,
	role: "user" | "assistant",
	content: string,
): Promise<void> {
	const messages = await readMessages(sessionId);
	messages.push({
		role,
		content,
		timestamp: new Date().toISOString(),
	});
	await writeMessages(sessionId, messages);

	// Update index metadata
	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === sessionId);
	if (meta) {
		meta.messageCount = messages.length;
		meta.updatedAt = new Date().toISOString();
		if (role === "user") {
			meta.lastMessage = content.slice(0, 100);
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
		content: string,
	) => {
		await appendStoredMessage(sessionId, role, content);
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
	console.log("[session-manager] createSession called, id:", id);

	// Load current settings for model and permission mode
	const settings = await loadSettings();
	const { model, permissionMode, authMode } = settings.claude;
	console.log("[session-manager] settings:", { model, permissionMode, authMode });

	// Resolve the Claude CLI path
	const claudePath = await findClaudeCli();
	console.log("[session-manager] Claude CLI path:", claudePath);

	// Create the SDK session
	console.log("[session-manager] calling unstable_v2_createSession...");
	const sdkSession = unstable_v2_createSession({
		model,
		permissionMode,
		pathToClaudeCodeExecutable: claudePath,
		allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "LS"],
	});
	console.log("[session-manager] SDK session created, sending prompt...");

	// Send the initial prompt — the SDK session needs a user message to begin
	await sdkSession.send(prompt);
	console.log("[session-manager] prompt sent successfully");

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

	// Persist the initial user message
	await appendStoredMessage(id, "user", prompt);

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

	// Persist the user message
	await appendStoredMessage(activeSessionId, "user", message);

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
): Promise<StoredMessage[]> {
	return readMessages(sessionId);
}

/**
 * Returns the ID of the currently active session, or null.
 */
export function getActiveSessionId(): string | null {
	return activeSessionId;
}

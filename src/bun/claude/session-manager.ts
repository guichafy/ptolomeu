import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	CanUseTool,
	PermissionResult,
	Query,
	SDKMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadSettings } from "../settings";
import { findClaudeCli } from "./claude-cli";
import { mcpLoader } from "./mcp-loader";
import { createMessageInbox, type MessageInbox } from "./message-inbox";
import { PermissionGate } from "./permission-gate";
import { type Project, ProjectStore } from "./persistence/project-store";
import { ToolDecisionStore } from "./persistence/tool-decisions";
import { buildQueryOptions } from "./session-options";
import type {
	MessagePersister,
	PersistBlock,
	ResultMeta,
	StreamMessageSender,
} from "./streaming";
import { startStreamingLoop } from "./streaming";
import { checkToolInput } from "./workspace-jail";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const VERBOSE = process.env.CLAUDE_LOG_VERBOSE === "1";
const verbose = (...args: unknown[]) => {
	if (VERBOSE) console.log(...args);
};

function previewText(text: string, max = 60): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max)}...`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMeta {
	id: string;
	sdkSessionId: string;
	title: string;
	/** Project this conversation belongs to. Many sessions can share one project. */
	projectId: string;
	/** Snapshot of the project path — agent's cwd for this session. */
	projectPath: string;
	model: string;
	authMode: "anthropic" | "bedrock";
	createdAt: string;
	updatedAt: string;
	messageCount: number;
	lastMessage: string;
}

/**
 * Version 2 introduces per-conversation project isolation: every session now
 * references a Project (projectId + projectPath). On read, an index whose
 * version is anything other than 2 is discarded — the sessions tree predates
 * the project model and is not worth migrating.
 */
export interface SessionIndex {
	version: 2;
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
	/** Set when this user message was sent with a per-turn model override. */
	modelUsed?: string;
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

const projectStore = new ProjectStore();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ActiveQuery {
	query: Query;
	inbox: MessageInbox;
	streamingLoop: Promise<void> | null;
	/**
	 * Callbacks fired when the streaming loop reports the next `result`
	 * SDKMessage. Used by `sendMessage` to restore the model after a per-turn
	 * override completes. FIFO; each turn shifts one off.
	 */
	turnCompletionQueue: Array<() => Promise<void>>;
}

let active: { sessionId: string; q: ActiveQuery } | null = null;

let pendingNew: {
	id: string;
	inbox: MessageInbox;
	authMode: SessionMeta["authMode"];
	options: ReturnType<typeof buildQueryOptions>;
} | null = null;

function buildUserMessage(text: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content: text },
		parent_tool_use_id: null,
	} as SDKUserMessage;
}

/**
 * Injected by the RPC layer (Etapa 5) before any session is created.
 * Falls back to no-op implementations so the module works stand-alone.
 */
let sender: StreamMessageSender = {
	sendEvent: () => {},
};

/**
 * Configure the sender used to push stream events to the renderer.
 */
export function setSender(s: StreamMessageSender): void {
	sender = s;
}

// ---------------------------------------------------------------------------
// HITL permission gate (phase 4)
// ---------------------------------------------------------------------------

const toolDecisionStore = new ToolDecisionStore();

const permissionGate = new PermissionGate({
	onDecision: (record) => {
		if (!active) return;
		const sessionId = active.sessionId;
		toolDecisionStore.append(sessionId, record).catch((err) => {
			console.error("[claude:permission] audit write failed:", err);
		});
	},
});

/**
 * Expose the shared permission gate so the RPC layer can forward
 * approve/reject commands from the renderer. The gate is a singleton —
 * there is only one active Claude session at a time.
 */
export function getPermissionGate(): PermissionGate {
	return permissionGate;
}

/**
 * Build the canUseTool callback that the Agent SDK invokes before executing
 * a tool. Runs the workspace jail first — any Write/Edit/Bash targeting a
 * path outside `workspace` short-circuits to a hard deny, never reaching
 * the user's permission prompt. Remaining calls go through the usual HITL
 * gate, resolved from the renderer via agentApproveTool/agentRejectTool.
 */
function buildCanUseTool(sessionId: string, workspace: string): CanUseTool {
	return async (toolName, input, options): Promise<PermissionResult> => {
		const jailed = checkToolInput(workspace, toolName, input);
		if (!jailed.allowed) {
			console.warn(`[claude:jail] tool=${toolName} blocked: ${jailed.reason}`);
			return { behavior: "deny", message: jailed.reason };
		}

		const { permissionId, request, promise } = permissionGate.request({
			toolCallId: options.toolUseID,
			toolName,
			args: input,
			decisionReason: options.decisionReason,
			blockedPath: options.blockedPath,
		});

		sender.sendEvent?.(sessionId, {
			type: "tool-permission-request",
			permissionId,
			toolCallId: options.toolUseID,
			toolName,
			args: input,
			decisionReason: request.risk.reason ?? options.decisionReason,
			blockedPath: options.blockedPath,
		});

		const decision = await promise;
		if (decision.behavior === "allow") {
			return decision.updatedInput
				? { behavior: "allow", updatedInput: decision.updatedInput }
				: { behavior: "allow", updatedInput: input };
		}
		return { behavior: "deny", message: decision.message };
	};
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
		return { version: 2, sessions: [] };
	}
	try {
		const parsed = JSON.parse(await file.text());
		if (
			parsed &&
			typeof parsed === "object" &&
			parsed.version === 2 &&
			Array.isArray(parsed.sessions)
		) {
			return parsed as SessionIndex;
		}
		// Legacy (v1 or malformed) — start fresh. Old session folders remain on
		// disk but are not listed; users can `rm -rf ~/.ptolomeu/sessions`
		// manually if they care about reclaiming the space.
		return { version: 2, sessions: [] };
	} catch {
		return { version: 2, sessions: [] };
	}
}

async function writeIndex(index: SessionIndex): Promise<void> {
	await ensureSessionsDir();
	await Bun.write(INDEX_PATH, JSON.stringify(index, null, 2));
}

function sessionDir(sessionId: string): string {
	return join(SESSIONS_DIR, sessionId);
}

/**
 * Returns the project directory for a session. Prefers the live project
 * entry (handles renames/moves later) and falls back to the denormalized
 * snapshot stored on the SessionMeta itself.
 */
async function resolveProjectPath(meta: SessionMeta): Promise<string> {
	const project = await projectStore.get(meta.projectId);
	return project?.path ?? meta.projectPath;
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

/**
 * Persist the SDK-issued session id captured from the first SDKMessage. Called
 * at most once per streaming loop (the streaming loop's own `sdkSessionIdRecorded`
 * latch enforces single-fire). Concurrent invocations would create a TOCTOU
 * between `readIndex` and `writeIndex`; the latch is the only thing preventing
 * that race today, so don't add new callers without revisiting.
 *
 * Called by the streaming loop's `onSdkSessionId` hook when the SDK reveals
 * its own session id on the first message. Updates the index only when the
 * value actually changes (the placeholder UUID is replaced exactly once).
 */
async function recordSdkSessionId(
	internalId: string,
	sdkSessionId: string,
): Promise<void> {
	if (!sdkSessionId) return;
	try {
		const idx = await readIndex();
		const m = idx.sessions.find((s) => s.id === internalId);
		if (m && m.sdkSessionId !== sdkSessionId) {
			verbose(
				`[claude:session] recordSdkSessionId: id=${internalId} old=${m.sdkSessionId} new=${sdkSessionId}`,
			);
			m.sdkSessionId = sdkSessionId;
			await writeIndex(idx);
		}
	} catch (err) {
		console.error("[claude:session] recordSdkSessionId failed:", err);
	}
}

// ---------------------------------------------------------------------------
// Models cache helpers (lazy — module lands in Task 6)
// ---------------------------------------------------------------------------

type ModelsCacheModule = {
	peekModels: (
		authMode: SessionMeta["authMode"],
	) => import("@anthropic-ai/claude-agent-sdk").ModelInfo[] | null;
	putModelsFromInit: (
		models: import("@anthropic-ai/claude-agent-sdk").ModelInfo[],
		authMode: SessionMeta["authMode"],
	) => void;
};

// Indirect specifier so TypeScript doesn't statically resolve the module
// before Task 6 lands. The `import()` call still works at runtime once the
// real `models-cache.ts` exists; until then it throws and the catch handles it.
const MODELS_CACHE_SPECIFIER = "./models-cache";

async function loadModelsCache(): Promise<ModelsCacheModule | null> {
	try {
		const mod = (await import(MODELS_CACHE_SPECIFIER)) as ModelsCacheModule;
		return mod;
	} catch {
		return null;
	}
}

async function tryGetCachedModels(
	authMode: SessionMeta["authMode"],
): Promise<import("@anthropic-ai/claude-agent-sdk").ModelInfo[] | null> {
	const mod = await loadModelsCache();
	if (!mod) return null;
	try {
		return mod.peekModels(authMode);
	} catch {
		return null;
	}
}

function notifySessionModelChanged(sessionId: string, model: string): void {
	// AgentEvent type extension lands in Task 7. Type-assert until then.
	sender.sendEvent?.(sessionId, {
		type: "session-model-changed",
		sessionId,
		model,
	} as never);
}

async function primeModelsCacheFromQuery(
	q: Query,
	authMode: SessionMeta["authMode"],
): Promise<void> {
	try {
		const mod = await loadModelsCache();
		if (!mod) return;
		const init = await q.initializationResult();
		mod.putModelsFromInit(init.models, authMode);
	} catch (err) {
		// init result not yet available or other transient failure; ignore.
		verbose(`[claude:session] primeModelsCacheFromQuery skipped: ${err}`);
	}
}

// ---------------------------------------------------------------------------
// Streaming-loop launcher
// ---------------------------------------------------------------------------

function startLoopForActive(sessionId: string): boolean {
	if (!active || active.sessionId !== sessionId) return false;
	const q = active.q.query;
	active.q.streamingLoop = startStreamingLoop(
		q as AsyncIterable<SDKMessage>,
		sessionId,
		sender,
		persister,
		{
			onTurnComplete: () => {
				if (!active || active.sessionId !== sessionId) return;
				const cb = active.q.turnCompletionQueue.shift();
				if (cb) {
					cb().catch((err) => {
						console.error(
							"[claude:session] turn completion callback failed:",
							err,
						);
					});
				}
			},
			onSdkSessionId: (sdkSessionId) => {
				void recordSdkSessionId(sessionId, sdkSessionId);
			},
		},
	).finally(() => {
		if (active && active.sessionId === sessionId) {
			active.q.streamingLoop = null;
		}
	});
	return true;
}

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
 *
 * Each conversation is isolated inside its own project directory. Callers
 * can pass an existing `projectId` to group multiple conversations under the
 * same project (shared files/memory across sessions); otherwise a fresh
 * project is auto-provisioned from the prompt title.
 */
export async function createSession(
	prompt: string,
	opts: { projectId?: string } = {},
): Promise<string> {
	const t0 = Date.now();
	const id = crypto.randomUUID();

	// Resolve (or create) the project this conversation belongs to. The
	// project directory becomes the agent's cwd — every Write/Edit/Bash is
	// scoped to it, guaranteeing isolation between conversations.
	let project: Project;
	if (opts.projectId) {
		const existing = await projectStore.get(opts.projectId);
		if (!existing) {
			throw new Error(`Project not found: ${opts.projectId}`);
		}
		project = existing;
	} else {
		project = await projectStore.create({ title: generateTitle(prompt) });
	}

	console.log(
		`[claude:session] createSession start: id=${id} projectId=${project.id} path=${project.path} promptLength=${prompt.length}`,
	);
	verbose(
		`[claude:session] createSession prompt preview: id=${id} prompt="${previewText(prompt)}"`,
	);

	const settings = await loadSettings();
	const { model, permissionMode, authMode } = settings.claude;
	verbose(
		`[claude:session] createSession settings: model=${model} permissionMode=${permissionMode} authMode=${authMode}`,
	);

	const claudePath = await findClaudeCli();
	const mcpServers = await mcpLoader.resolve();
	const mcpNames = Object.keys(mcpServers);
	if (mcpNames.length > 0) {
		verbose(
			`[claude:session] MCP servers enabled: id=${id} servers=[${mcpNames.join(",")}]`,
		);
	}

	// Build the inbox and the first user message; do NOT start query() yet.
	// Deferred-start (existing invariant): the chat window must be mounted
	// before the streaming loop emits its first chunk, otherwise
	// chatRpc.send.* drops.
	const inbox = createMessageInbox();
	inbox.push(buildUserMessage(prompt));

	const now = new Date().toISOString();
	const meta: SessionMeta = {
		id,
		sdkSessionId: id, // placeholder; gets corrected by sdk-session-id capture in the streaming loop
		title: generateTitle(prompt),
		projectId: project.id,
		projectPath: project.path,
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
	verbose(
		`[claude:session] metadata persisted: id=${id} title="${meta.title}"`,
	);

	if (pendingNew) {
		console.warn(
			`[claude:session] createSession: replacing unrealized pendingNew id=${pendingNew.id} (chat never opened?)`,
		);
		try {
			pendingNew.inbox.close();
		} catch {
			// best-effort cleanup
		}
	}
	pendingNew = {
		id,
		inbox,
		authMode,
		options: buildQueryOptions({
			model,
			permissionMode,
			claudePath,
			canUseTool: buildCanUseTool(id, project.path),
			mcpServers,
			cwd: project.path,
		}),
	};

	console.log(
		`[claude:session] createSession done: id=${id} (${Date.now() - t0}ms) — query() deferred until resumeSession`,
	);
	return id;
}

/**
 * Resumes a previously created session by loading its metadata and
 * re-attaching to the SDK session.
 *
 * Doubles as the deferred-start entrypoint for freshly created sessions:
 * `createSession` leaves the prompt + options primed but does not call
 * `query()`, because early events would race the chat window's RPC transport
 * and vanish. The first `resumeSession` from the newly opened window
 * triggers `query()` + `startStreamingLoop` — by then the renderer is
 * subscribed.
 */
export async function resumeSession(sessionId: string): Promise<boolean> {
	console.log(`[claude:session] resumeSession start: id=${sessionId}`);

	// Case 1: same session already active (deferred-start has already fired)
	if (active && active.sessionId === sessionId) {
		if (active.q.streamingLoop) {
			console.log(
				`[claude:session] resumeSession: id=${sessionId} stream already running`,
			);
			return true;
		}
		// Stream finished but query is still alive — start a fresh one.
		// Practically rare with the long-lived stable Query; defensive guard only.
		return startLoopForActive(sessionId);
	}

	// Case 2: deferred new session — first resume from chat window after createSession
	if (pendingNew && pendingNew.id === sessionId) {
		const pendingAuthMode = pendingNew.authMode;
		const q = query({
			prompt: pendingNew.inbox.iterable,
			options: pendingNew.options,
		});
		active = {
			sessionId,
			q: {
				query: q,
				inbox: pendingNew.inbox,
				streamingLoop: null,
				turnCompletionQueue: [],
			},
		};
		pendingNew = null;
		void primeModelsCacheFromQuery(q, pendingAuthMode);
		return startLoopForActive(sessionId);
	}

	// Case 3: cold resume of a previously persisted session
	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === sessionId);
	if (!meta) {
		console.error(
			`[claude:session] resumeSession: metadata not found for id=${sessionId}`,
		);
		return false;
	}

	const settings = await loadSettings();
	const { permissionMode } = settings.claude;
	let model = meta.model;

	try {
		if (active && active.sessionId !== sessionId) {
			console.log(
				`[claude:session] resumeSession: tearing down prior active session ${active.sessionId} before cold resume of ${sessionId}`,
			);
			try {
				active.q.inbox.close();
				active.q.query.close();
			} catch {
				// best-effort cleanup
			}
			if (active.q.streamingLoop) {
				await active.q.streamingLoop.catch(() => {});
			}
			active = null;
		}

		const claudePath = await findClaudeCli();
		const mcpServers = await mcpLoader.resolve();
		const cwd = await resolveProjectPath(meta);

		// Downgrade silently when meta.model has been retired.
		const cached = await tryGetCachedModels(meta.authMode);
		if (cached && cached.length > 0 && !cached.some((m) => m.value === model)) {
			console.warn(
				`[claude:session] meta.model="${model}" not in cache — downgrading to "${cached[0].value}"`,
			);
			model = cached[0].value;
			meta.model = model;
			await writeIndex(index);
			notifySessionModelChanged(sessionId, model);
		}

		const inbox = createMessageInbox();
		const q = query({
			prompt: inbox.iterable,
			options: buildQueryOptions({
				model,
				permissionMode,
				claudePath,
				canUseTool: buildCanUseTool(sessionId, cwd),
				mcpServers,
				cwd,
				resumeSdkSessionId: meta.sdkSessionId,
			}),
		});
		active = {
			sessionId,
			q: { query: q, inbox, streamingLoop: null, turnCompletionQueue: [] },
		};
		void primeModelsCacheFromQuery(q, meta.authMode);

		console.log(
			`[claude:session] resumeSession ready: id=${sessionId} sdkSessionId=${meta.sdkSessionId} model=${model}`,
		);
		return startLoopForActive(sessionId);
	} catch (err) {
		console.error("[claude:session] resumeSession failed:", err);
		return false;
	}
}

/**
 * Sends a follow-up message in the active session.
 *
 * With the stable `query()` API the SDK session is long-lived and accepts
 * additional user messages via the prompt async-iterable. We just push the
 * new message on the inbox; the running streaming loop continues to drain
 * the resulting SDK messages.
 *
 * `opts.modelOverride` switches the model for just this turn. The previous
 * model is restored via the `turnCompletionQueue`, fired when the streaming
 * loop reports the next `result`.
 */
export async function sendMessage(
	message: string,
	opts: { modelOverride?: string } = {},
): Promise<void> {
	if (!active) {
		console.error("[claude:session] sendMessage: no active session");
		throw new Error("No active session");
	}
	const snap = active; // captured BEFORE any await
	const internalId = snap.sessionId;

	console.log(
		`[claude:session] sendMessage start: sessionId=${internalId} length=${message.length} override=${opts.modelOverride ?? "(none)"}`,
	);
	verbose(
		`[claude:session] sendMessage preview: sessionId=${internalId} message="${previewText(message)}"`,
	);

	await appendStoredMessageV2(internalId, {
		version: 2,
		role: "user",
		blocks: [{ type: "text", text: message }],
		timestamp: new Date().toISOString(),
		...(opts.modelOverride && { modelUsed: opts.modelOverride }),
	});

	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === internalId);
	if (!meta) {
		throw new Error(`Session metadata not found: ${internalId}`);
	}

	let restore: string | null = null;
	if (opts.modelOverride && opts.modelOverride !== meta.model) {
		const cached = await tryGetCachedModels(meta.authMode);
		// If we have a cache and the override isn't in it, ignore.
		// If we have no cache, allow it (best-effort).
		if (!cached || cached.some((m) => m.value === opts.modelOverride)) {
			restore = meta.model;
			try {
				await snap.q.query.setModel(opts.modelOverride);
			} catch (err) {
				console.warn("[claude:session] setModel(override) failed:", err);
				restore = null;
			}
		} else {
			console.warn(
				`[claude:session] modelOverride="${opts.modelOverride}" not in cache — ignoring`,
			);
		}
	}

	if (restore !== null) {
		const restoreModel = restore;
		snap.q.turnCompletionQueue.push(async () => {
			// Identity-guard: only restore if this exact slot is still active.
			if (active !== snap) return;
			try {
				await snap.q.query.setModel(restoreModel);
			} catch (err) {
				console.warn("[claude:session] setModel(restore) failed:", err);
				sender.sendEvent?.(internalId, {
					type: "error",
					error: {
						message: "Falha ao restaurar modelo da sessão",
						recoverable: true,
					},
				});
			}
		});
	}

	snap.q.inbox.push(buildUserMessage(message));
}

/**
 * Stops the currently running generation by interrupting the active query.
 * The Query is kept alive so follow-up messages remain possible.
 */
export async function stopGeneration(): Promise<boolean> {
	console.log(
		`[claude:session] stopGeneration: activeId=${active?.sessionId ?? "null"}`,
	);
	if (!active) return false;

	// Release any tool-permission promises the SDK is awaiting. The interrupt
	// below races them; cancelling explicitly avoids leaking deny timers.
	const cancelled = permissionGate.cancelAll("generation stopped");
	if (cancelled > 0) {
		console.log(
			`[claude:session] stopGeneration: cancelled ${cancelled} pending permissions`,
		);
	}

	try {
		await active.q.query.interrupt();
		console.log("[claude:session] stopGeneration: interrupted");
		return true;
	} catch (err) {
		console.error("[claude:session] stopGeneration failed:", err);
		return false;
	}
}

/**
 * Deletes a session's stored data and removes it from the index. If the
 * session's project has no other sessions attached, the project folder is
 * also removed — for today's 1:1 project-per-conversation mapping that
 * means deleting a conversation wipes its workspace too. The lookup keeps
 * working once multiple sessions share a project.
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
	console.log(`[claude:session] deleteSession start: id=${sessionId}`);
	const index = await readIndex();
	const idx = index.sessions.findIndex((s) => s.id === sessionId);
	if (idx === -1) {
		console.log(
			`[claude:session] deleteSession: id=${sessionId} not found in index`,
		);
		return false;
	}

	const meta = index.sessions[idx];
	const { projectId } = meta;

	// If this is the active session, close it and drain its streaming loop
	// BEFORE touching files — otherwise the loop's final writes can land
	// after rm and either recreate the dir or error out mid-flush.
	if (active && active.sessionId === sessionId) {
		try {
			active.q.inbox.close();
			active.q.query.close();
		} catch {
			// Ignore close errors
		}
		if (active.q.streamingLoop) {
			await active.q.streamingLoop.catch(() => {});
		}
		active = null;
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

	// Delete the project folder only when no other session — persisted OR
	// currently active in memory — still needs it. The in-memory check
	// matters once multiple sessions share a project: a sibling session
	// might be mid-flight and not yet persisted.
	const activeSessionIdSnap = active?.sessionId ?? null;
	const activeOnProject =
		activeSessionIdSnap !== null
			? index.sessions.find((s) => s.id === activeSessionIdSnap)?.projectId ===
				projectId
			: false;
	const stillReferenced =
		activeOnProject || index.sessions.some((s) => s.projectId === projectId);
	if (!stillReferenced) {
		await projectStore.delete(projectId).catch((err) => {
			console.error(
				"[claude:session] deleteSession: project cleanup failed:",
				err,
			);
		});
	}

	console.log(`[claude:session] deleteSession done: id=${sessionId}`);
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
	return active?.sessionId ?? null;
}

/** Lists all known projects. Exposed for future project-picker UI. */
export async function listProjects(): Promise<Project[]> {
	return projectStore.list();
}

/**
 * Persists a new model on a session's metadata, switching the live runtime
 * model when that session is currently active. Refuses while a streaming
 * loop is in flight (the SDK can't safely change models mid-turn).
 */
export async function setSessionModel(
	sessionId: string,
	model: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === sessionId);
	if (!meta) return { ok: false, reason: "session-not-found" };

	if (active && active.sessionId === sessionId) {
		if (active.q.streamingLoop) {
			return { ok: false, reason: "session-busy" };
		}
		try {
			await active.q.query.setModel(model);
		} catch (err) {
			console.error("[claude:session] setSessionModel runtime failed:", err);
			return { ok: false, reason: "sdk-error" };
		}
	}

	meta.model = model;
	await writeIndex(index);
	notifySessionModelChanged(sessionId, model);
	return { ok: true };
}

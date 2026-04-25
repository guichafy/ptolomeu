# Chat Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ao usuário escolher o modelo do Claude **dentro da conversa**, com escopo de sessão (B) e override por turno (C); a lista vem da SDK estável (Anthropic e Bedrock) sem hardcode.

**Architecture:** Migrar `session-manager.ts` da API `unstable_v2_*` para a função estável `query()` (que expõe `setModel`, `supportedModels`, `initializationResult`); adicionar um módulo de cache de modelos por `authMode` alimentado pela SDK; expor RPCs para listagem/seleção; e dois pontos de UI (`ChatHeader` para sessão, `PromptInputToolbar` para override de turno) usando o componente `model-selector` do AI Elements via shadcn registry.

**Tech Stack:** Bun · TypeScript · React 19 · `@anthropic-ai/claude-agent-sdk` (stable `query()`) · Electrobun RPC · Vitest (node + jsdom) · Tailwind 4 · shadcn/ui · AI Elements (`model-selector`).

**Spec source:** `docs/specs/2026-04-25-chat-model-selector-design.md`.

---

## Pré-condições

- Rodar a partir da raiz do repo `sample-electronbun`. Branch atual: `feature/design`. Recomenda-se trabalhar em worktree isolada.
- `bun install` executado, `lefthook` instalado (já é parte do `prepare`).
- Testes: `bun run test` deve estar verde antes de começar.

---

## File map

**Criados:**
- `src/bun/claude/message-inbox.ts` — push-able `AsyncIterable<SDKUserMessage>`.
- `src/bun/claude/message-inbox.test.ts` — testes unitários.
- `src/bun/claude/models-cache.ts` — cache de `ModelInfo[]` por `ClaudeAuthMode` + discovery via stable `query()`.
- `src/bun/claude/models-cache.test.ts` — testes unitários.
- `src/components/claude/model-picker.tsx` — wrapper do `model-selector` do AI Elements; serve aos três call-sites (settings, header, toolbar).
- `src/components/claude/model-picker.test.tsx` — teste de componente (jsdom).
- `src/components/ai-elements/model-selector.tsx` — instalado via shadcn MCP (registro AI Elements).
- `src/chatview/components/chat-header.test.tsx` — testes do header com seletor.
- `tests/e2e/chat-model-selector.test.ts` — screenshot E2E.

**Modificados:**
- `src/bun/claude/session-manager.ts` — migração total para `query()` estável; mudanças no `resumeSession`/`sendMessage` para ler `meta.model` e aceitar `modelOverride`; novo `setSessionModel`.
- `src/bun/claude/session-options.ts` — opções para `query()` em vez de `unstable_v2_*`.
- `src/bun/claude/streaming.ts` — `startStreamingLoop` recebe um `Query` (AsyncGenerator) em vez de `SDKSession`.
- `src/shared/agent-protocol.ts` — novos `AgentEvent`: `session-model-changed`, `models-cache-invalidated`.
- `src/bun/rpc.ts` — RPCs novos (`claudeListSupportedModels`, `claudeSetSessionModel`); modifica `claudeSendMessage` (parâmetro `modelOverride`); invalidação automática em `claudeSetBedrock` / `claudeLoginSSO` / `claudeLogoutSSO` / `saveSettings` (quando `claude.authMode` muda).
- `src/bun/claude/auth.ts` — emitir invalidate quando login/logout/bedrock-config mudar (callback injetado pelo rpc).
- `src/bun/settings.ts` — comparar `authMode` antigo/novo no `saveSettings` para disparar invalidate.
- `src/chatview/hooks/agent-state.ts` — campo `sessionModel: string | null` em `AgentState`; reducer trata `session-model-changed`.
- `src/chatview/hooks/use-agent-chat.ts` — `sendMessage(text, opts?: { modelOverride? })`.
- `src/chatview/components/chat-header.tsx` — substitui badge hardcoded por `ModelPicker`.
- `src/chatview/components/v2/chat-pane.tsx` — toolbar ganha `ModelPicker variant="turn-override"`; `handleSubmit` passa `modelOverride`; reset após envio.
- `src/chatview/components/v2/message-parts.tsx` ou `chat-pane.tsx` — badge "Modelo: X" quando o turno usou override.
- `src/chatview/lib/agent-event-buffer.ts` (apenas teste, sem mudança de código): garantir cobertura dos novos eventos.
- `src/chatview/lib/agent-event-buffer.test.ts` — casos novos.
- `src/mainview/settings/claude-section.tsx` — substitui `<Select>` hardcoded por `ModelPicker`.
- `src/mainview/rpc.ts` (renderer-side) — novo RPC pull no mainview também.
- `src/chatview/rpc.ts` (renderer-side) — novo RPC pull no chatview.

---

## Task 1: Message Inbox helper (TDD)

**Files:**
- Create: `src/bun/claude/message-inbox.ts`
- Create: `src/bun/claude/message-inbox.test.ts`

**Goal:** `AsyncIterable<SDKUserMessage>` empurrável (queue + Promise/resolver pair). `push(msg)` libera o `next()` pendente; `close()` finaliza o iterator.

- [ ] **Step 1.1: Write failing tests**

```ts
// src/bun/claude/message-inbox.test.ts
import { describe, expect, test } from "vitest";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { createMessageInbox } from "./message-inbox";

function userMsg(text: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content: text },
		parent_tool_use_id: null,
	};
}

describe("createMessageInbox", () => {
	test("delivers messages in push order", async () => {
		const inbox = createMessageInbox();
		inbox.push(userMsg("first"));
		inbox.push(userMsg("second"));
		inbox.close();

		const received: string[] = [];
		for await (const msg of inbox.iterable) {
			received.push(typeof msg.message.content === "string" ? msg.message.content : "");
		}
		expect(received).toEqual(["first", "second"]);
	});

	test("yields a pushed message even when consumer awaits first", async () => {
		const inbox = createMessageInbox();
		const it = inbox.iterable[Symbol.asyncIterator]();
		const pending = it.next();
		inbox.push(userMsg("late"));
		const value = await pending;
		expect(value.done).toBe(false);
		expect(value.value?.message.content).toBe("late");
		inbox.close();
	});

	test("close() ends the iterator after draining queued messages", async () => {
		const inbox = createMessageInbox();
		inbox.push(userMsg("one"));
		inbox.close();
		const it = inbox.iterable[Symbol.asyncIterator]();
		const a = await it.next();
		const b = await it.next();
		expect(a.done).toBe(false);
		expect(b.done).toBe(true);
	});

	test("push after close throws", () => {
		const inbox = createMessageInbox();
		inbox.close();
		expect(() => inbox.push(userMsg("x"))).toThrow(/closed/i);
	});
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
bunx vitest run src/bun/claude/message-inbox.test.ts
```
Expected: FAIL — module `./message-inbox` not found.

- [ ] **Step 1.3: Implement the inbox**

```ts
// src/bun/claude/message-inbox.ts
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export interface MessageInbox {
	push(msg: SDKUserMessage): void;
	close(): void;
	readonly iterable: AsyncIterable<SDKUserMessage>;
}

/**
 * Push-able async iterable used as the prompt stream for stable `query()`.
 * Messages enqueued before a consumer attaches are buffered; consumers awaiting
 * a `next()` while the queue is empty receive the next pushed message.
 */
export function createMessageInbox(): MessageInbox {
	const queue: SDKUserMessage[] = [];
	const waiters: Array<(result: IteratorResult<SDKUserMessage>) => void> = [];
	let closed = false;

	function push(msg: SDKUserMessage): void {
		if (closed) throw new Error("Inbox is closed");
		const waiter = waiters.shift();
		if (waiter) {
			waiter({ value: msg, done: false });
		} else {
			queue.push(msg);
		}
	}

	function close(): void {
		closed = true;
		while (waiters.length > 0) {
			const w = waiters.shift();
			w?.({ value: undefined as never, done: true });
		}
	}

	const iterable: AsyncIterable<SDKUserMessage> = {
		[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
			return {
				next() {
					if (queue.length > 0) {
						const value = queue.shift()!;
						return Promise.resolve({ value, done: false });
					}
					if (closed) {
						return Promise.resolve({ value: undefined as never, done: true });
					}
					return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
						waiters.push(resolve);
					});
				},
				return() {
					close();
					return Promise.resolve({ value: undefined as never, done: true });
				},
			};
		},
	};

	return { push, close, iterable };
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
bunx vitest run src/bun/claude/message-inbox.test.ts
```
Expected: PASS — 4 tests passed.

- [ ] **Step 1.5: Commit**

```bash
git add src/bun/claude/message-inbox.ts src/bun/claude/message-inbox.test.ts
git commit -m "feat(claude): add push-able message inbox helper for stable query()"
```

---

## Task 2: Refactor session-options for stable query()

**Files:**
- Modify: `src/bun/claude/session-options.ts`
- Modify: `src/bun/claude/session-options.test.ts` (existing)

**Goal:** trocar `SDKSessionOptions` por `Options` (do `query()`); unificar `buildCreateSessionOptions` / `buildResumeSessionOptions` em uma única função `buildQueryOptions` que aceita `resumeSdkSessionId?: string`.

- [ ] **Step 2.1: Read current options + test**

```bash
cat src/bun/claude/session-options.ts src/bun/claude/session-options.test.ts
```

- [ ] **Step 2.2: Update tests to target the new API (failing)**

Substitua `src/bun/claude/session-options.test.ts` por:

```ts
import { describe, expect, test } from "vitest";
import { buildQueryOptions } from "./session-options";

const baseArgs = {
	model: "claude-sonnet-4-6",
	permissionMode: "acceptEdits" as const,
	claudePath: "/usr/local/bin/claude",
	canUseTool: async () => ({ behavior: "allow" as const, updatedInput: {} }),
	mcpServers: {},
	cwd: "/tmp/proj",
};

describe("buildQueryOptions", () => {
	test("includes model, cwd, permissionMode, allowed read-only tools", () => {
		const opts = buildQueryOptions(baseArgs);
		expect(opts.model).toBe("claude-sonnet-4-6");
		expect(opts.cwd).toBe("/tmp/proj");
		expect(opts.permissionMode).toBe("acceptEdits");
		expect(opts.allowedTools).toEqual(["Read", "Glob", "Grep", "LS"]);
		expect(opts.includePartialMessages).toBe(true);
		expect(opts.pathToClaudeCodeExecutable).toBe("/usr/local/bin/claude");
	});

	test("attaches mcpServers only when non-empty", () => {
		const empty = buildQueryOptions(baseArgs);
		expect(empty.mcpServers).toBeUndefined();
		const withMcp = buildQueryOptions({
			...baseArgs,
			mcpServers: { foo: { type: "stdio", command: "foo" } as never },
		});
		expect(withMcp.mcpServers).toBeDefined();
	});

	test("attaches resume sessionId when provided", () => {
		const opts = buildQueryOptions({ ...baseArgs, resumeSdkSessionId: "abc-123" });
		expect(opts.resume).toBe("abc-123");
	});

	test("omits resume when not provided", () => {
		const opts = buildQueryOptions(baseArgs);
		expect("resume" in opts).toBe(false);
	});
});
```

Run: `bunx vitest run src/bun/claude/session-options.test.ts`
Expected: FAIL — `buildQueryOptions` not exported.

- [ ] **Step 2.3: Rewrite session-options.ts**

```ts
// src/bun/claude/session-options.ts
import type {
	CanUseTool,
	McpServerConfig,
	Options,
	PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "LS"];

export interface BuildQueryArgs {
	model: string;
	permissionMode?: PermissionMode;
	claudePath: string;
	canUseTool: CanUseTool;
	mcpServers: Record<string, McpServerConfig>;
	cwd: string;
	/** Pass to resume an existing SDK session (CLI `--resume` semantics). */
	resumeSdkSessionId?: string;
}

/**
 * Build `Options` for the stable `query({ prompt, options })`.
 * `permissionMode` is omitted on resume to honour the SDK transcript's prior mode.
 * `mcpServers` is only attached when non-empty so we don't override the file-based config with `{}`.
 */
export function buildQueryOptions(args: BuildQueryArgs): Options {
	const opts: Options = {
		model: args.model,
		pathToClaudeCodeExecutable: args.claudePath,
		allowedTools: ALLOWED_TOOLS,
		canUseTool: args.canUseTool,
		includePartialMessages: true,
		cwd: args.cwd,
	};
	if (args.permissionMode) {
		opts.permissionMode = args.permissionMode;
	}
	if (Object.keys(args.mcpServers).length > 0) {
		opts.mcpServers = args.mcpServers;
	}
	if (args.resumeSdkSessionId) {
		opts.resume = args.resumeSdkSessionId;
	}
	return opts;
}
```

- [ ] **Step 2.4: Run tests**

```bash
bunx vitest run src/bun/claude/session-options.test.ts
```
Expected: PASS — 4 tests passed.

- [ ] **Step 2.5: Commit**

```bash
git add src/bun/claude/session-options.ts src/bun/claude/session-options.test.ts
git commit -m "refactor(claude): unify session options around stable query() Options"
```

---

## Task 3: Refactor `streaming.ts` to consume a `Query` (AsyncGenerator) directly

**Files:**
- Modify: `src/bun/claude/streaming.ts`

**Goal:** `startStreamingLoop` hoje aceita um `{ stream(): AsyncGenerator<SDKMessage, void> }`. A função estável `query()` retorna um `Query` que **é** ele próprio um `AsyncGenerator<SDKMessage, void>`. Vamos aceitar um `AsyncIterable<SDKMessage>` direto e adicionar um hook `onTurnComplete` que dispara quando uma `result` SDKMessage é processada — necessário porque o `Query` estável é long-lived (não termina ao fim do turno como o legado `SDKSession`).

- [ ] **Step 3.1: Update the type and add onTurnComplete**

Em `src/bun/claude/streaming.ts`, modifique a assinatura, o `for await`, e adicione o hook:

```ts
// Before:
export async function startStreamingLoop(
	session: { stream(): AsyncGenerator<SDKMessage, void> },
	sessionId: string,
	sender: StreamMessageSender,
	persister: MessagePersister,
): Promise<void> { /* ... */
	for await (const msg of session.stream()) { /* ... */ }
}

// After:
export interface StreamingHooks {
	/** Fires once a `result` SDKMessage has been fully processed and persisted. */
	onTurnComplete?: () => void;
}

export async function startStreamingLoop(
	stream: AsyncIterable<SDKMessage>,
	sessionId: string,
	sender: StreamMessageSender,
	persister: MessagePersister,
	hooks: StreamingHooks = {},
): Promise<void> { /* ... */
	for await (const msg of stream) { /* ... */ }
}
```

Inside the existing `if (msg.type === "result") { ... }` branch, AFTER `accumulatedBlocks = []; toolElapsed.clear();`, append:

```ts
hooks.onTurnComplete?.();
```

**Apply with Edit tool** — change the parameter name from `session` to `stream`, the type, the `for await` line, add `hooks` parameter, and add the hook call after each result.

- [ ] **Step 3.2: Run streaming-related tests**

```bash
bunx vitest run src/bun/claude/event-mapper.test.ts
```
Expected: PASS (event-mapper is independent — sanity check that we didn't break the import graph).

Note: there's no dedicated streaming.test.ts — we'll cover end-to-end in Task 5.

- [ ] **Step 3.3: Commit**

```bash
git add src/bun/claude/streaming.ts
git commit -m "refactor(claude): startStreamingLoop accepts AsyncIterable directly"
```

---

## Task 4: Migrate `session-manager.ts` to stable `query()`

**Files:**
- Modify: `src/bun/claude/session-manager.ts`

**Goal:** Substituir todas as chamadas `unstable_v2_createSession` / `unstable_v2_resumeSession` por uma única `query()` por sessão, alimentada por um `MessageInbox`. Manter a interface pública (`createSession`, `resumeSession`, `sendMessage`, `stopGeneration`, `deleteSession`, `getSessionMessages`, `setSender`, `getPermissionGate`, `listSessions`, `getActiveSessionId`, `listProjects`).

Esta é a maior tarefa. Vou subdividir em passos.

### Subtarefa 4.A: Imports, tipos e estado

- [ ] **Step 4.A.1: Replace imports**

```ts
// src/bun/claude/session-manager.ts (top)
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	CanUseTool,
	PermissionResult,
	Query,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadSettings } from "../settings";
import { findClaudeCli } from "./claude-cli"; // extracted in Task 6.A below — write the file as part of this step
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
```

Create `src/bun/claude/claude-cli.ts` now (small extraction so models-cache and session-manager share it):

```ts
// src/bun/claude/claude-cli.ts
import { homedir } from "node:os";
import { join } from "node:path";

let cachedClaudePath: string | null = null;

export async function findClaudeCli(): Promise<string> {
	if (cachedClaudePath) return cachedClaudePath;
	const fromPath = Bun.which("claude");
	if (fromPath) {
		cachedClaudePath = fromPath;
		return fromPath;
	}
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
```

Delete the inline `findClaudeCli` (and its `cachedClaudePath` module variable) from `session-manager.ts`.

- [ ] **Step 4.A.2: Add `modelUsed` to StoredMessageV2**

In `session-manager.ts`, extend the `StoredMessageV2` interface:

```ts
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
```

- [ ] **Step 4.A.3: Replace module-level state and add per-turn callback queue**

```ts
// Substitute the existing `activeSession` / `activeSessionId` / `activeStreamingLoop` block with:

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
```

Adapt the rest of the file (functions below) to read/write from `active` instead.

### Subtarefa 4.B: `createSession`

- [ ] **Step 4.B.1: Rewrite createSession**

Substitua o corpo da função `createSession` (a partir de `// Resolve the Claude CLI path`):

```ts
const claudePath = await findClaudeCli();
const mcpServers = await mcpLoader.resolve();
const mcpNames = Object.keys(mcpServers);
if (mcpNames.length > 0) {
	verbose(
		`[claude:session] MCP servers enabled: id=${id} servers=[${mcpNames.join(",")}]`,
	);
}

// Build the inbox and the first user message; do NOT start query() yet.
// Deferred-start (existing invariant): the chat window must be mounted before
// the streaming loop emits its first chunk, otherwise chatRpc.send.* drops.
const inbox = createMessageInbox();
inbox.push(buildUserMessage(prompt));

const now = new Date().toISOString();
const meta: SessionMeta = {
	id,
	sdkSessionId: id, // placeholder — overwritten by syncSdkSessionId after first message
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

// Stash the inbox + options on a pending slot. Actual `query()` is built on
// the first resumeSession from the chat window (see resumeSession below).
pendingNew = {
	id,
	inbox,
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
```

Add at module scope:

```ts
let pendingNew: {
	id: string;
	inbox: MessageInbox;
	options: ReturnType<typeof buildQueryOptions>;
} | null = null;

function buildUserMessage(text: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content: text },
		parent_tool_use_id: null,
	};
}
```

### Subtarefa 4.C: `resumeSession`

- [ ] **Step 4.C.1: Rewrite resumeSession**

```ts
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
		// Stream finished but query is still alive — start a fresh one for follow-ups.
		// (Practically rare; the loop persists until close().)
		return startLoopForActive(sessionId);
	}

	// Case 2: deferred new session — first resume from chat window after createSession
	if (pendingNew && pendingNew.id === sessionId) {
		const q = query({ prompt: pendingNew.inbox.iterable, options: pendingNew.options });
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
		// Capture supportedModels opportunistically (warm cache without cost).
		void primeModelsCacheFromQuery(q);
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

	// Read model from meta.model (FIX: was reading settings.claude.model).
	const settings = await loadSettings();
	const { permissionMode } = settings.claude;
	let model = meta.model;

	try {
		const claudePath = await findClaudeCli();
		const mcpServers = await mcpLoader.resolve();
		const cwd = await resolveProjectPath(meta);

		// Downgrade silently when meta.model has been retired and is no longer in cache.
		const cached = await tryGetCachedModels(meta.authMode);
		if (cached && !cached.some((m) => m.value === model) && cached.length > 0) {
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
		void primeModelsCacheFromQuery(q);

		console.log(
			`[claude:session] resumeSession ready: id=${sessionId} sdkSessionId=${meta.sdkSessionId} model=${model}`,
		);
		return startLoopForActive(sessionId);
	} catch (err) {
		console.error("[claude:session] resumeSession failed:", err);
		return false;
	}
}

function startLoopForActive(sessionId: string): boolean {
	if (!active || active.sessionId !== sessionId) return false;
	const q = active.q.query;
	active.q.streamingLoop = startStreamingLoop(q, sessionId, sender, persister, {
		onTurnComplete: () => {
			if (!active || active.sessionId !== sessionId) return;
			const cb = active.q.turnCompletionQueue.shift();
			if (cb) {
				cb().catch((err) => {
					console.error("[claude:session] turn completion callback failed:", err);
				});
			}
		},
	})
		.then(() => syncSdkSessionId(sessionId, q))
		.finally(() => {
			if (active && active.sessionId === sessionId) {
				active.q.streamingLoop = null;
			}
		});
	return true;
}

async function tryGetCachedModels(
	authMode: ClaudeAuthMode,
): Promise<ModelInfo[] | null> {
	// Lazy import to avoid circular deps; models-cache lives in the same dir.
	const { peekModels } = await import("./models-cache");
	return peekModels(authMode);
}

function notifySessionModelChanged(sessionId: string, model: string): void {
	sender.sendEvent?.(sessionId, {
		type: "session-model-changed",
		sessionId,
		model,
	});
}

async function primeModelsCacheFromQuery(q: Query): Promise<void> {
	try {
		const { putModelsFromInit } = await import("./models-cache");
		const init = await q.initializationResult();
		await putModelsFromInit(init.models);
	} catch (err) {
		// Init result not yet available, or cache already filled — ignore.
		verbose(`[claude:session] primeModelsCacheFromQuery skipped: ${err}`);
	}
}
```

Update `syncSdkSessionId` to accept a `Query`:

```ts
async function syncSdkSessionId(
	internalId: string,
	q: Pick<Query, "interrupt"> & { sessionId?: string },
): Promise<void> {
	try {
		// Stable Query exposes `sessionId` after first message — see SDK's Query interface
		// (the property is on SDKSession-like objects). For Query, read via initializationResult.
		const init = await (q as unknown as Query).initializationResult();
		const resolvedId = (init as unknown as { session_id?: string }).session_id;
		if (!resolvedId) return;
		const idx = await readIndex();
		const m = idx.sessions.find((s) => s.id === internalId);
		if (m && m.sdkSessionId !== resolvedId) {
			verbose(
				`[claude:session] syncSdkSessionId: id=${internalId} old=${m.sdkSessionId} new=${resolvedId}`,
			);
			m.sdkSessionId = resolvedId;
			await writeIndex(idx);
		}
	} catch {
		// session id not yet available — ignore
	}
}
```

> **Note on `session_id`:** `SDKControlInitializeResponse` doesn't currently document `session_id`. If the runtime shape is different, fall back to capturing the first SDKMessage's `session_id` field inside the streaming loop (existing pattern). Update if the smoke test in Task 5 reveals the field is missing — see step 5.6.

### Subtarefa 4.D: `sendMessage` with optional override

- [ ] **Step 4.D.1: Rewrite sendMessage**

```ts
export async function sendMessage(
	message: string,
	opts: { modelOverride?: string } = {},
): Promise<void> {
	if (!active) {
		console.error("[claude:session] sendMessage: no active session");
		throw new Error("No active session");
	}
	const internalId = active.sessionId;

	console.log(
		`[claude:session] sendMessage start: sessionId=${internalId} length=${message.length} override=${opts.modelOverride ?? "(none)"}`,
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
		// Validate against cached list — silently ignore an override that vanished.
		const cached = await tryGetCachedModels(meta.authMode);
		if (!cached || cached.some((m) => m.value === opts.modelOverride)) {
			restore = meta.model;
			try {
				await active.q.query.setModel(opts.modelOverride);
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
		// Enqueue the restore so it runs when the streaming loop reports the
		// next `result` SDKMessage. The Query is long-lived (does not terminate
		// at the end of a turn), so we cannot chain off `streamingLoop` itself.
		const restoreModel = restore;
		active.q.turnCompletionQueue.push(async () => {
			try {
				if (active && active.sessionId === internalId) {
					await active.q.query.setModel(restoreModel);
				}
			} catch (err) {
				console.warn("[claude:session] setModel(restore) failed:", err);
				sender.sendEvent?.(internalId, {
					type: "error",
					error: { message: "Falha ao restaurar modelo da sessão", recoverable: true },
				});
			}
		});
	}

	active.q.inbox.push(buildUserMessage(message));
}
```

> **Important:** unlike the legacy implementation, we do NOT recreate the SDK session on each `send`. The single long-lived `query()` accepts further user messages via the inbox. The streaming loop continues iterating the same `Query` AsyncGenerator — `result` messages don't terminate it; only `inbox.close()` or `query.close()` do.

### Subtarefa 4.E: `stopGeneration` and `deleteSession`

- [ ] **Step 4.E.1: Rewrite stopGeneration**

```ts
export async function stopGeneration(): Promise<boolean> {
	if (!active) return false;

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
```

- [ ] **Step 4.E.2: Adapt deleteSession**

In `deleteSession`, replace the active-session teardown:

```ts
// Before:
if (activeSessionId === sessionId && activeSession) {
	try { activeSession.close(); } catch {}
	if (activeStreamingLoop) {
		await activeStreamingLoop.catch(() => {});
		activeStreamingLoop = null;
	}
	activeSession = null;
	activeSessionId = null;
}

// After:
if (active && active.sessionId === sessionId) {
	try {
		active.q.inbox.close();
		active.q.query.close();
	} catch {}
	if (active.q.streamingLoop) {
		await active.q.streamingLoop.catch(() => {});
	}
	active = null;
}
```

Also update the `activeSessionId` reference further down in `deleteSession` (the `activeOnProject` calculation) to use `active?.sessionId`.

- [ ] **Step 4.E.3: Update getActiveSessionId**

```ts
export function getActiveSessionId(): string | null {
	return active?.sessionId ?? null;
}
```

### Subtarefa 4.F: New `setSessionModel` API

- [ ] **Step 4.F.1: Add setSessionModel**

```ts
export async function setSessionModel(
	sessionId: string,
	model: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const index = await readIndex();
	const meta = index.sessions.find((s) => s.id === sessionId);
	if (!meta) return { ok: false, reason: "session-not-found" };

	// If session is active and a query exists, apply at runtime first; only
	// persist after success so a failed setModel doesn't lie on disk.
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
```

- [ ] **Step 4.F.2: Run typecheck + existing tests**

```bash
bunx tsc --noEmit -p tsconfig.json
bunx vitest run src/bun/claude/
```
Expected: PASS or only failures clearly traceable to follow-up tasks (none expected for `bun/claude/` files yet).

- [ ] **Step 4.F.3: Commit**

```bash
git add src/bun/claude/session-manager.ts src/bun/claude/session-options.ts src/bun/claude/streaming.ts
git commit -m "refactor(claude): migrate session-manager from unstable_v2_* to stable query()"
```

---

## Task 5: Smoke verification of the migration

**Goal:** confirm the chat still works end-to-end before adding new UI surfaces.

- [ ] **Step 5.1: Run all unit tests**

```bash
bun run test
```
Expected: PASS — no regressions.

- [ ] **Step 5.2: Run the dev bundle**

```bash
bun run dev:hmr
```

- [ ] **Step 5.3: Manual smoke**

In the running app:
1. Open palette (⌘+Shift+Space) → Claude → "Nova conversa".
2. Send "olá" — assistant should stream a reply.
3. Send a follow-up — should stream too without recreating the conversation.
4. Hit "Parar" mid-stream — interrupt should work.
5. Close + reopen the chat for the same session — `resumeSession` should reattach.

If anything breaks, investigate before proceeding. Common gotchas:
- `inbox.push` after the `Query` has closed — close the inbox in the same teardown.
- `query.setModel` not yet called by anyone — that's fine for the smoke test.

- [ ] **Step 5.4: Verify the SDK session id capture path**

If `syncSdkSessionId` couldn't read `session_id` from `initializationResult()` (see warning in 4.C), fall back: in `streaming.ts`, capture the first `SDKMessage`'s `session_id` field and call back to a setter the session-manager exposes:

```ts
// session-manager.ts
export function recordSdkSessionId(internalId: string, sdkSessionId: string): void {
	if (!sdkSessionId) return;
	void readIndex().then(async (idx) => {
		const m = idx.sessions.find((s) => s.id === internalId);
		if (m && m.sdkSessionId !== sdkSessionId) {
			m.sdkSessionId = sdkSessionId;
			await writeIndex(idx);
		}
	});
}

// streaming.ts: at the start of for-await, when msg has session_id:
if ("session_id" in msg && typeof msg.session_id === "string" && !sdkIdRecorded) {
	recordSdkSessionId(sessionId, msg.session_id);
	sdkIdRecorded = true;
}
```

This is only required if step 5.3 reveals the persisted `meta.sdkSessionId` is still our placeholder UUID (visible in `~/.ptolomeu/sessions/index.json` after a successful turn).

- [ ] **Step 5.5: Stop dev server, commit any 5.4 fixes**

```bash
git add src/bun/claude/streaming.ts src/bun/claude/session-manager.ts
git commit -m "fix(claude): capture SDK session id from first message in streaming loop"
```
(Skip if 5.4 was unnecessary.)

---

## Task 6: Models cache module (TDD)

**Files:**
- Create: `src/bun/claude/models-cache.ts`
- Create: `src/bun/claude/models-cache.test.ts`

**Goal:** Singleton with `getModels(authMode)` (cache-aware, single-flight discovery via stable `query()`), `peekModels(authMode)` (sync read), `putModelsFromInit(models)` (oportunístico), `invalidate(authMode?)`.

- [ ] **Step 6.1: Write failing tests**

```ts
// src/bun/claude/models-cache.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import {
	__resetModelsCache,
	getModels,
	invalidate,
	peekModels,
	putModelsFromInit,
} from "./models-cache";

const SAMPLE: ModelInfo[] = [
	{ value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", description: "" },
	{ value: "claude-opus-4-6", displayName: "Opus 4.6", description: "" },
];

afterEach(() => __resetModelsCache());

describe("models-cache", () => {
	test("peekModels returns null on cold cache", () => {
		expect(peekModels("anthropic")).toBeNull();
	});

	test("putModelsFromInit fills cache for current authMode (defaults to anthropic)", async () => {
		await putModelsFromInit(SAMPLE);
		expect(peekModels("anthropic")).toEqual(SAMPLE);
	});

	test("invalidate clears the entry for one authMode", async () => {
		await putModelsFromInit(SAMPLE);
		invalidate("anthropic");
		expect(peekModels("anthropic")).toBeNull();
	});

	test("invalidate() with no args clears all", async () => {
		await putModelsFromInit(SAMPLE);
		invalidate();
		expect(peekModels("anthropic")).toBeNull();
	});

	test("getModels uses discovery when cache empty", async () => {
		const discover = vi.fn().mockResolvedValue(SAMPLE);
		const models = await getModels("anthropic", { discover });
		expect(models).toEqual(SAMPLE);
		expect(discover).toHaveBeenCalledOnce();
	});

	test("getModels is single-flight under concurrent calls", async () => {
		const discover = vi
			.fn()
			.mockImplementation(
				() =>
					new Promise<ModelInfo[]>((r) => setTimeout(() => r(SAMPLE), 10)),
			);
		const [a, b] = await Promise.all([
			getModels("anthropic", { discover }),
			getModels("anthropic", { discover }),
		]);
		expect(a).toEqual(SAMPLE);
		expect(b).toEqual(SAMPLE);
		expect(discover).toHaveBeenCalledOnce();
	});

	test("discovery failure does not poison the cache", async () => {
		const discover = vi.fn().mockRejectedValue(new Error("offline"));
		await expect(
			getModels("anthropic", { discover }),
		).rejects.toThrow(/offline/);
		expect(peekModels("anthropic")).toBeNull();
	});
});
```

Run:

```bash
bunx vitest run src/bun/claude/models-cache.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 6.2: Implement models-cache**

```ts
// src/bun/claude/models-cache.ts
import type { ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadSettings } from "../settings";
import { findClaudeCli } from "./claude-cli";
import { mcpLoader } from "./mcp-loader";
import { createMessageInbox } from "./message-inbox";
import { buildQueryOptions } from "./session-options";

export type ClaudeAuthMode = "anthropic" | "bedrock";

const cache = new Map<ClaudeAuthMode, ModelInfo[]>();
const inFlight = new Map<ClaudeAuthMode, Promise<ModelInfo[]>>();

export function peekModels(authMode: ClaudeAuthMode): ModelInfo[] | null {
	return cache.get(authMode) ?? null;
}

export async function putModelsFromInit(models: ModelInfo[]): Promise<void> {
	const settings = await loadSettings();
	const mode: ClaudeAuthMode = settings.claude.authMode;
	cache.set(mode, models);
}

export function invalidate(authMode?: ClaudeAuthMode): void {
	if (!authMode) {
		cache.clear();
		inFlight.clear();
		return;
	}
	cache.delete(authMode);
	inFlight.delete(authMode);
}

export interface GetModelsOpts {
	/** Override the discovery function (testing). */
	discover?: () => Promise<ModelInfo[]>;
}

export async function getModels(
	authMode: ClaudeAuthMode,
	opts: GetModelsOpts = {},
): Promise<ModelInfo[]> {
	const cached = cache.get(authMode);
	if (cached) return cached;
	const inflight = inFlight.get(authMode);
	if (inflight) return inflight;

	const discoverFn = opts.discover ?? (() => discoverModels(authMode));
	const promise = discoverFn()
		.then((models) => {
			cache.set(authMode, models);
			return models;
		})
		.finally(() => {
			inFlight.delete(authMode);
		});
	inFlight.set(authMode, promise);
	return promise;
}

/** Default discovery: spin up an empty `query()`, read `initializationResult`, close. */
async function discoverModels(authMode: ClaudeAuthMode): Promise<ModelInfo[]> {
	const settings = await loadSettings();
	const claudePath = await findClaudeCli();
	const mcpServers = await mcpLoader.resolve();
	const inbox = createMessageInbox();
	const q: Query = query({
		prompt: inbox.iterable,
		options: buildQueryOptions({
			model: settings.claude.model,
			claudePath,
			canUseTool: async () => ({ behavior: "deny", message: "discovery-only" }),
			mcpServers,
			cwd: process.cwd(),
		}),
	});
	try {
		const init = await q.initializationResult();
		void authMode; // authMode is implicit via settings; cache key uses settings.claude.authMode
		return init.models ?? [];
	} finally {
		try {
			inbox.close();
		} catch {}
		try {
			q.close();
		} catch {}
	}
}

/** Test-only reset. */
export function __resetModelsCache(): void {
	cache.clear();
	inFlight.clear();
}
```

> Note: `findClaudeCli` was already extracted to `./claude-cli` in Task 4.A.1, so this import resolves cleanly.

- [ ] **Step 6.3: Run tests**

```bash
bunx vitest run src/bun/claude/models-cache.test.ts
```
Expected: PASS — 7 tests.

- [ ] **Step 6.4: Commit**

```bash
git add src/bun/claude/models-cache.ts src/bun/claude/models-cache.test.ts src/bun/claude/claude-cli.ts src/bun/claude/session-manager.ts
git commit -m "feat(claude): models cache with stable query() discovery and single-flight"
```

---

## Task 7: AgentEvent types + RPC schema

**Files:**
- Modify: `src/shared/agent-protocol.ts`
- Modify: `src/bun/rpc.ts`

- [ ] **Step 7.1: Add events to the protocol**

In `src/shared/agent-protocol.ts`, add `ModelInfo` shape (mirror — do not import from SDK in shared) and extend the `AgentEvent` union:

```ts
// Add near the top, after PermissionMode:
export type ClaudeAuthMode = "anthropic" | "bedrock";

export interface ProtocolModelInfo {
	value: string;
	displayName: string;
	description: string;
	supportsEffort?: boolean;
	supportedEffortLevels?: ("low" | "medium" | "high" | "xhigh" | "max")[];
	supportsAdaptiveThinking?: boolean;
	supportsFastMode?: boolean;
	supportsAutoMode?: boolean;
}

// Extend AgentEvent (append before the closing `;` of the union):
| { type: "session-model-changed"; sessionId: string; model: string }
| { type: "models-cache-invalidated"; authMode: ClaudeAuthMode }
```

- [ ] **Step 7.2: Add RPC entries**

In `src/bun/rpc.ts`, inside `requests:`:

```ts
claudeListSupportedModels: {
	params: void;
	response: { models: ProtocolModelInfo[]; authMode: ClaudeAuthMode };
};
claudeSetSessionModel: {
	params: { sessionId: string; model: string };
	response: { ok: boolean; reason?: "session-not-found" | "session-busy" | "sdk-error" };
};
```

Modify `claudeSendMessage`:

```ts
claudeSendMessage: {
	params: { message: string; modelOverride?: string };
	response: void;
};
```

Add the imports of `ProtocolModelInfo` / `ClaudeAuthMode` from `@/shared/agent-protocol`.

- [ ] **Step 7.3: Wire handlers**

```ts
// in requestHandlers (rpc.ts):
claudeListSupportedModels: async () => {
	const { authMode } = (await loadSettingsFromDisk()).claude;
	const { getModels } = await import("./claude/models-cache");
	const models = await getModels(authMode);
	return { models, authMode };
},
claudeSetSessionModel: async ({ sessionId, model }) => {
	const { setSessionModel } = await import("./claude/session-manager");
	const result = await setSessionModel(sessionId, model);
	return result;
},
claudeSendMessage: async ({ message, modelOverride }) => {
	await claudeSendMessage(message, modelOverride ? { modelOverride } : undefined);
},
```

- [ ] **Step 7.4: Auto-invalidation hooks**

In `requestHandlers.claudeSetBedrock` / `claudeLoginSSO` / `claudeLogoutSSO`, after the existing logic, append:

```ts
const { invalidate } = await import("./claude/models-cache");
invalidate();
mainRpc.send.agentEvent({ sessionId: "", event: { type: "models-cache-invalidated", authMode: "anthropic" } });
chatRpc.send.agentEvent({ sessionId: "", event: { type: "models-cache-invalidated", authMode: "bedrock" } });
```

(Two events because we don't know which mode the user is in; the receiver can compare against its current mode.)

In `requestHandlers.saveSettings`, before writing, compare with current settings:

```ts
saveSettings: async (next) => {
	const current = await loadSettingsFromDisk();
	const ok = await saveSettingsToDisk(next);
	if (ok && current.claude.authMode !== next.claude.authMode) {
		const { invalidate } = await import("./claude/models-cache");
		invalidate();
		mainRpc.send.agentEvent({ sessionId: "", event: { type: "models-cache-invalidated", authMode: next.claude.authMode } });
		chatRpc.send.agentEvent({ sessionId: "", event: { type: "models-cache-invalidated", authMode: next.claude.authMode } });
	}
	return ok;
},
```

- [ ] **Step 7.5: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json
```
Expected: clean.

- [ ] **Step 7.6: Commit**

```bash
git add src/shared/agent-protocol.ts src/bun/rpc.ts
git commit -m "feat(rpc): claudeListSupportedModels + claudeSetSessionModel + modelOverride"
```

---

## Task 8: Install AI Elements model-selector via shadcn MCP

- [ ] **Step 8.1: List items**

Use the `mcp__shadcn` tool:

- Tool: `mcp__shadcn__list_items_in_registries` with `registries: ["ai-elements"]` to confirm the slug for the `model-selector` component.

- [ ] **Step 8.2: View example**

- Tool: `mcp__shadcn__get_item_examples_from_registries` for `ai-elements/model-selector` to confirm props and CSS.

- [ ] **Step 8.3: Install**

- Tool: `mcp__shadcn__get_add_command_for_items` with `items: ["ai-elements/model-selector"]`.
- Run the returned command (will be of the form `bunx shadcn@latest add <url>`).

- [ ] **Step 8.4: Verify file**

```bash
ls src/components/ai-elements/model-selector.tsx
```
Expected: file exists. Inspect imports — keep style consistent with sibling files.

- [ ] **Step 8.5: Commit**

```bash
git add src/components/ai-elements/model-selector.tsx components.json
git commit -m "chore(ui): add ai-elements model-selector via shadcn registry"
```

---

## Task 9: ModelPicker wrapper component (TDD)

**Files:**
- Create: `src/components/claude/model-picker.tsx`
- Create: `src/components/claude/model-picker.test.tsx`

- [ ] **Step 9.1: Write failing test**

```tsx
// src/components/claude/model-picker.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ProtocolModelInfo } from "@/shared/agent-protocol";
import { ModelPicker } from "./model-picker";

const MODELS: ProtocolModelInfo[] = [
	{ value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", description: "Balanced" },
	{ value: "claude-opus-4-6", displayName: "Opus 4.6", description: "Most capable" },
];

describe("<ModelPicker>", () => {
	test("renders the current value's displayName", () => {
		render(
			<ModelPicker variant="session" value="claude-opus-4-6" models={MODELS} onChange={() => {}} />,
		);
		expect(screen.getByText("Opus 4.6")).toBeInTheDocument();
	});

	test("calls onChange when an item is selected", () => {
		const onChange = vi.fn();
		render(
			<ModelPicker variant="session" value="claude-sonnet-4-6" models={MODELS} onChange={onChange} />,
		);
		fireEvent.click(screen.getByRole("button"));
		fireEvent.click(screen.getByText("Opus 4.6"));
		expect(onChange).toHaveBeenCalledWith("claude-opus-4-6");
	});

	test("disabled hides the popover trigger interaction", () => {
		render(
			<ModelPicker variant="session" value="claude-sonnet-4-6" models={MODELS} onChange={() => {}} disabled />,
		);
		expect(screen.getByRole("button")).toBeDisabled();
	});

	test("shows placeholder when value is null and models is empty (loading)", () => {
		render(<ModelPicker variant="session" value={null} models={[]} onChange={() => {}} />);
		expect(screen.getByText(/carregando modelos/i)).toBeInTheDocument();
	});
});
```

Run: `bunx vitest run src/components/claude/model-picker.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 9.2: Implement**

```tsx
// src/components/claude/model-picker.tsx
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorItem,
	ModelSelectorTrigger,
	ModelSelectorValue,
} from "@/components/ai-elements/model-selector";
import type { ProtocolModelInfo } from "@/shared/agent-protocol";
import { cn } from "@/lib/utils";

export type ModelPickerVariant = "session" | "turn-override" | "default";

export interface ModelPickerProps {
	variant: ModelPickerVariant;
	value: string | null;
	models: ProtocolModelInfo[];
	onChange: (value: string) => void;
	disabled?: boolean;
	placeholder?: string;
	/** When set on `turn-override`, shows a "fallback to session default" affordance. */
	sessionDefault?: string | null;
}

export function ModelPicker({
	variant,
	value,
	models,
	onChange,
	disabled,
	placeholder,
	sessionDefault,
}: ModelPickerProps) {
	if (models.length === 0) {
		return (
			<span className={cn("text-xs text-muted-foreground", variant === "session" && "px-2")}>
				Carregando modelos...
			</span>
		);
	}
	const current = models.find((m) => m.value === value) ?? null;
	const showClear = variant === "turn-override" && value && value !== sessionDefault;

	return (
		<div className="flex items-center gap-1">
			<ModelSelector value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
				<ModelSelectorTrigger
					className={cn(
						"text-xs",
						variant === "session" && "h-6 px-2 py-0",
						variant === "turn-override" && "h-7 px-2 py-0",
						variant === "default" && "h-8 px-3",
					)}
					aria-label={placeholder ?? "Selecionar modelo"}
				>
					<ModelSelectorValue placeholder={placeholder ?? "Modelo"}>
						{current?.displayName ?? value}
					</ModelSelectorValue>
				</ModelSelectorTrigger>
				<ModelSelectorContent>
					{models.map((m) => (
						<ModelSelectorItem key={m.value} value={m.value}>
							<div className="flex flex-col">
								<span className="font-medium">{m.displayName}</span>
								{m.description && (
									<span className="text-[10px] text-muted-foreground">{m.description}</span>
								)}
							</div>
						</ModelSelectorItem>
					))}
				</ModelSelectorContent>
			</ModelSelector>
			{showClear && (
				<button
					type="button"
					onClick={() => onChange(sessionDefault ?? "")}
					className="text-muted-foreground hover:text-foreground text-xs"
					aria-label="Voltar ao modelo da sessão"
				>
					✕
				</button>
			)}
		</div>
	);
}
```

> The exact prop names (`ModelSelectorTrigger` vs `ModelSelector.Trigger`) come from the file installed in Task 8. Adjust to match.

- [ ] **Step 9.3: Run tests**

```bash
bunx vitest run src/components/claude/model-picker.test.tsx
```
Expected: PASS — 4 tests.

- [ ] **Step 9.4: Commit**

```bash
git add src/components/claude/model-picker.tsx src/components/claude/model-picker.test.tsx
git commit -m "feat(ui): ModelPicker wrapper around ai-elements/model-selector"
```

---

## Task 10: Settings UI uses ModelPicker

**Files:**
- Modify: `src/mainview/settings/claude-section.tsx`

- [ ] **Step 10.1: Replace the hardcoded Select**

In `claude-section.tsx`, replace lines 356-367 (the `<Select>` block):

```tsx
// imports
import { ModelPicker } from "@/components/claude/model-picker";
import { useEffect, useState } from "react";
import { rpc } from "../rpc"; // or the correct relative path
import type { ProtocolModelInfo } from "@/shared/agent-protocol";

// inside the component, near the top of state:
const [models, setModels] = useState<ProtocolModelInfo[]>([]);
const [loadingModels, setLoadingModels] = useState(true);

useEffect(() => {
	let cancelled = false;
	const refresh = async () => {
		setLoadingModels(true);
		try {
			const res = await rpc.request.claudeListSupportedModels();
			if (!cancelled) setModels(res.models);
		} catch (err) {
			console.warn("[settings] claudeListSupportedModels failed:", err);
			if (!cancelled) setModels([]);
		} finally {
			if (!cancelled) setLoadingModels(false);
		}
	};
	refresh();
	const unsubscribe = onAgentEvent((args) => {
		if (args.event.type === "models-cache-invalidated") refresh();
	});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}, []);

// markup replacing the <Select>:
<ModelPicker
	variant="default"
	value={model}
	models={models}
	onChange={handleModelChange}
	disabled={loadingModels && models.length === 0}
	placeholder="Modelo padrão"
/>
```

> `onAgentEvent` doesn't exist on the mainview side yet — see Task 11 for the bridge. Until then, just call `refresh()` once on mount and accept that authMode changes require a window reload.

- [ ] **Step 10.2: Manual smoke**

```bash
bun run dev:hmr
```
Open Configurações → Plugins → Claude. Confirm the dropdown lists models from the SDK (no longer the hardcoded three).

- [ ] **Step 10.3: Commit**

```bash
git add src/mainview/settings/claude-section.tsx
git commit -m "feat(settings): drive Claude model dropdown from SDK-supplied list"
```

---

## Task 11: Wire `agentEvent` into the mainview RPC

**Goal:** the mainview window also needs to receive `models-cache-invalidated` so settings can refresh.

- [ ] **Step 11.1: Add agentEvent push to mainRpc**

In `src/bun/rpc.ts`, the `webview.messages.agentEvent` schema entry already exists; just ensure both `mainRpc.send.agentEvent` and `chatRpc.send.agentEvent` are reachable. They are, because both use the same schema.

- [ ] **Step 11.2: Add a renderer-side subscription helper**

In `src/mainview/rpc.ts` (or wherever the mainview wires the RPC), add an `onAgentEvent` similar to chatview's:

```ts
// src/mainview/rpc.ts
import type { AgentEvent } from "@/shared/agent-protocol";

const listeners = new Set<(args: { sessionId: string; event: AgentEvent }) => void>();

export function onAgentEvent(cb: (args: { sessionId: string; event: AgentEvent }) => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

// In the `messages.agentEvent` handler set during rpc creation:
agentEvent: (args) => {
	for (const cb of listeners) cb(args);
},
```

(If the mainview's webview-message handler bag isn't currently wired for `agentEvent`, add it — small additive change.)

- [ ] **Step 11.3: Test by toggling authMode**

Manual: change `claude.authMode` in settings (Anthropic ↔ Bedrock). The model dropdown should refetch and reflect the new list.

- [ ] **Step 11.4: Commit**

```bash
git add src/bun/rpc.ts src/mainview/rpc.ts
git commit -m "feat(rpc): mainview subscribes to agentEvent for cache invalidation"
```

---

## Task 12: ChatHeader — session-level ModelPicker

**Files:**
- Modify: `src/chatview/components/chat-header.tsx`
- Modify: `src/chatview/hooks/agent-state.ts` — add `sessionModel` field
- Modify: `src/chatview/hooks/use-agent-chat.ts` — propagate `sessionModel`
- Create: `src/chatview/components/chat-header.test.tsx`

- [ ] **Step 12.1: Extend AgentState with sessionModel**

In `src/chatview/hooks/agent-state.ts`:

```ts
// In AgentState interface, add:
sessionModel: string | null;

// In initialAgentState:
sessionModel: null,

// In reduceAgentState, handle session-model-changed:
case "session-model-changed":
	return { ...state, sessionModel: event.model };
```

- [ ] **Step 12.2: Hydrate sessionModel on session open**

In `use-agent-chat.ts`, extend the hydrate flow. The persisted session list (`SessionMeta.model`) is the source. Add an RPC call at hydrate time:

```ts
// Inside hydrate(sid):
const sessions = await rpc.request.claudeListSessions();
const meta = sessions.find((s) => s.id === sid);
if (meta) dispatch({ type: "set-session-model", model: meta.model });
```

Add the new action to the reducer:

```ts
| { type: "set-session-model"; model: string }

// reducer:
case "set-session-model":
	return { ...state, sessionModel: action.model };
```

- [ ] **Step 12.3: Write the chat-header test (failing)**

```tsx
// src/chatview/components/chat-header.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ChatHeader } from "./chat-header";

vi.mock("../rpc", () => ({
	rpc: { request: { claudeSetSessionModel: vi.fn().mockResolvedValue({ ok: true }) } },
}));

describe("<ChatHeader>", () => {
	test("disables the picker while streaming", () => {
		render(
			<ChatHeader
				sessionId="abc"
				sessionState="streaming"
				sessionModel="claude-sonnet-4-6"
				models={[{ value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", description: "" }]}
			/>,
		);
		expect(screen.getByRole("button", { name: /selecionar modelo/i })).toBeDisabled();
	});

	test("enables the picker when idle and dispatches RPC on change", async () => {
		const { rpc } = await import("../rpc");
		render(
			<ChatHeader
				sessionId="abc"
				sessionState="idle"
				sessionModel="claude-sonnet-4-6"
				models={[
					{ value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", description: "" },
					{ value: "claude-opus-4-6", displayName: "Opus 4.6", description: "" },
				]}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /selecionar modelo/i }));
		fireEvent.click(screen.getByText("Opus 4.6"));
		expect(rpc.request.claudeSetSessionModel).toHaveBeenCalledWith({
			sessionId: "abc",
			model: "claude-opus-4-6",
		});
	});
});
```

Run: `bunx vitest run src/chatview/components/chat-header.test.tsx`
Expected: FAIL — `ChatHeader` doesn't accept `sessionModel`/`models`.

- [ ] **Step 12.4: Update ChatHeader**

```tsx
// src/chatview/components/chat-header.tsx
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "@/components/claude/model-picker";
import type { ProtocolModelInfo } from "@/shared/agent-protocol";
import { rpc } from "../rpc";

type SessionState = "idle" | "streaming" | "tool_running" | "error";

interface ChatHeaderProps {
	sessionId: string | null;
	sessionState: SessionState;
	sessionModel: string | null;
	models: ProtocolModelInfo[];
}

const stateConfig: Record<SessionState, { color: string; pulse: boolean }> = {
	idle: { color: "bg-green-500", pulse: false },
	streaming: { color: "bg-green-500", pulse: true },
	tool_running: { color: "bg-yellow-500", pulse: true },
	error: { color: "bg-red-500", pulse: false },
};

export function ChatHeader({ sessionId, sessionState, sessionModel, models }: ChatHeaderProps) {
	const { color, pulse } = stateConfig[sessionState];
	const handleChange = async (model: string) => {
		if (!sessionId) return;
		try {
			await rpc.request.claudeSetSessionModel({ sessionId, model });
		} catch (err) {
			console.error("[chat-header] setSessionModel failed:", err);
		}
	};

	return (
		<div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
			<Bot className="h-4 w-4 text-muted-foreground" />
			<h1 className="text-sm font-semibold">Claude Code</h1>
			<span className={cn("inline-block h-2 w-2 rounded-full", color, pulse && "animate-pulse")} />
			<ModelPicker
				variant="session"
				value={sessionModel}
				models={models}
				onChange={handleChange}
				disabled={sessionState !== "idle"}
				placeholder="Selecionar modelo"
			/>
			{sessionId && (
				<span className="ml-auto text-xs text-muted-foreground/60 truncate">
					{sessionId.slice(0, 8)}
				</span>
			)}
		</div>
	);
}
```

- [ ] **Step 12.5: Wire models into the chat-pane**

In `src/chatview/components/v2/chat-pane.tsx`, fetch models on mount:

```tsx
const [models, setModels] = useState<ProtocolModelInfo[]>([]);
useEffect(() => {
	let cancelled = false;
	rpc.request
		.claudeListSupportedModels()
		.then((res) => {
			if (!cancelled) setModels(res.models);
		})
		.catch((err) => console.warn("[chat-pane] list models failed:", err));
	const unsubscribe = onAgentEvent((args) => {
		if (args.event.type === "models-cache-invalidated") {
			rpc.request.claudeListSupportedModels().then((res) => {
				if (!cancelled) setModels(res.models);
			});
		}
	});
	return () => {
		cancelled = true;
		unsubscribe();
	};
}, []);
```

Pass to header:

```tsx
<ChatHeader
	sessionId={sessionId}
	sessionState={toLegacySessionState(state.sessionState)}
	sessionModel={state.sessionModel}
	models={models}
/>
```

- [ ] **Step 12.6: Run tests**

```bash
bunx vitest run src/chatview/components/chat-header.test.tsx
bun run test
```
Expected: PASS.

- [ ] **Step 12.7: Commit**

```bash
git add src/chatview/components/chat-header.tsx src/chatview/components/chat-header.test.tsx \
        src/chatview/components/v2/chat-pane.tsx \
        src/chatview/hooks/agent-state.ts src/chatview/hooks/use-agent-chat.ts
git commit -m "feat(chat): session-level model picker in ChatHeader"
```

---

## Task 13: Per-turn override in PromptInputToolbar

**Files:**
- Modify: `src/chatview/components/v2/chat-pane.tsx`
- Modify: `src/chatview/hooks/use-agent-chat.ts`

- [ ] **Step 13.1: Extend sendMessage signature**

In `use-agent-chat.ts`:

```ts
const sendMessage = useCallback(
	async (text: string, opts: { modelOverride?: string } = {}) => {
		if (!text.trim()) return;
		const id = `user-${Date.now()}`;
		dispatch({ type: "optimistic-user", id, text });
		try {
			await rpc.request.claudeSendMessage({
				message: text,
				modelOverride: opts.modelOverride,
			});
		} catch (err) {
			console.error("[agent-chat] sendMessage RPC failed:", err);
		}
	},
	[],
);
```

Update the `UseAgentChatResult` type accordingly.

- [ ] **Step 13.2: Add the override picker to the toolbar**

In `chat-pane.tsx`:

```tsx
const [overrideModel, setOverrideModel] = useState<string | null>(null);

// inside <PromptInputToolbar>, before the Paperclip button:
<ModelPicker
	variant="turn-override"
	value={overrideModel ?? state.sessionModel}
	sessionDefault={state.sessionModel}
	models={models}
	onChange={(v) => setOverrideModel(v === state.sessionModel ? null : v)}
	disabled={state.sessionState !== "idle"}
	placeholder="Override do turno"
/>
```

In `handleSubmit`, pass override and reset:

```tsx
const overrideForTurn = overrideModel ?? undefined;
await sendMessage(`${prefix}${text}`, { modelOverride: overrideForTurn });
setOverrideModel(null);
```

- [ ] **Step 13.3: Manual smoke**

```bash
bun run dev:hmr
```
- Pick a non-default model in the toolbar; send a message → assistant responds; toolbar resets to session default.
- Send another message without touching the picker → uses session default.

- [ ] **Step 13.4: Commit**

```bash
git add src/chatview/components/v2/chat-pane.tsx src/chatview/hooks/use-agent-chat.ts
git commit -m "feat(chat): per-turn model override in prompt toolbar"
```

---

## Task 14: Persist `modelUsed` per user message + render badge

**Files:**
- Modify: `src/bun/claude/session-manager.ts` — already accepts `modelUsed` in Step 4.D.1; verify it flows to disk.
- Modify: `src/chatview/hooks/agent-state.ts` — `AgentMessage` for `user` role gets `modelUsed?: string`.
- Modify: `src/chatview/components/v2/message-parts.tsx` (or `chat-pane.tsx`) — render the badge.

- [ ] **Step 14.1: Verify `modelUsed` was added in Task 4.A.2**

The `StoredMessageV2.modelUsed` field was added in Step 4.A.2; `sendMessage` already persists it (Step 4.D.1). Confirm by reading `session-manager.ts`:

```bash
grep -n "modelUsed" src/bun/claude/session-manager.ts
```
Expected: matches in both the interface definition and `sendMessage`. If missing, add per Step 4.A.2 / 4.D.1.

- [ ] **Step 14.2: Carry through to AgentMessage**

In `agent-state.ts`, extend `AgentMessage`:

```ts
export interface AgentMessage {
	id: string;
	role: "user" | "assistant";
	parts: AgentMessagePart[];
	modelUsed?: string;
}
```

In `storedToAgentMessage`, copy `modelUsed` from the stored message.

In `appendUserMessage`, accept an optional `modelUsed`.

In `use-agent-chat.ts`, propagate `modelUsed` into the optimistic dispatch:

```ts
dispatch({ type: "optimistic-user", id, text, modelUsed: opts.modelOverride });
```

Update the action and reducer to carry it.

- [ ] **Step 14.3: Render the badge**

In whichever component renders user messages (likely `MessagePart` for the `text` part of a user message, or directly in `<AgentMessageView>` in `chat-pane.tsx`):

```tsx
function AgentMessageView({ message, models }: { message: AgentMessageType; models: ProtocolModelInfo[] }) {
	const modelLabel = message.modelUsed
		? models.find((m) => m.value === message.modelUsed)?.displayName ?? message.modelUsed
		: null;
	return (
		<Message from={message.role}>
			<MessageContent role={message.role}>
				{message.parts.map((part) => (
					<MessagePartRenderer key={partKey(message, part)} part={part} />
				))}
				{modelLabel && (
					<span className="mt-1 inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
						Modelo: {modelLabel}
					</span>
				)}
			</MessageContent>
		</Message>
	);
}
```

- [ ] **Step 14.4: Manual smoke**

```bash
bun run dev:hmr
```
- Send one normal message — no badge.
- Send one with override — badge appears under the user bubble with the override's `displayName`.

- [ ] **Step 14.5: Commit**

```bash
git add src/bun/claude/session-manager.ts \
        src/chatview/hooks/agent-state.ts src/chatview/hooks/use-agent-chat.ts \
        src/chatview/components/v2/chat-pane.tsx
git commit -m "feat(chat): persist and surface per-turn model override on user messages"
```

---

## Task 15: agent-event-buffer test coverage for new events

**Files:**
- Modify: `src/chatview/lib/agent-event-buffer.test.ts`

- [ ] **Step 15.1: Add tests for the new event types**

Append to the file:

```ts
describe("agent-event-buffer with model events", () => {
	test("session-model-changed events are buffered until a subscriber attaches", async () => {
		const buffer = createAgentEventBuffer();
		buffer.push({ sessionId: "s1", event: { type: "session-model-changed", sessionId: "s1", model: "claude-opus-4-6" } });
		const seen: AgentEvent[] = [];
		buffer.subscribe((args) => seen.push(args.event));
		expect(seen).toEqual([{ type: "session-model-changed", sessionId: "s1", model: "claude-opus-4-6" }]);
	});

	test("models-cache-invalidated is broadcast to subscribers", async () => {
		const buffer = createAgentEventBuffer();
		const seen: AgentEvent[] = [];
		buffer.subscribe((args) => seen.push(args.event));
		buffer.push({ sessionId: "", event: { type: "models-cache-invalidated", authMode: "anthropic" } });
		expect(seen).toEqual([{ type: "models-cache-invalidated", authMode: "anthropic" }]);
	});
});
```

(If the existing API differs slightly, mirror the pattern of existing tests in the same file.)

- [ ] **Step 15.2: Run tests**

```bash
bunx vitest run src/chatview/lib/agent-event-buffer.test.ts
```
Expected: PASS — all green.

- [ ] **Step 15.3: Commit**

```bash
git add src/chatview/lib/agent-event-buffer.test.ts
git commit -m "test(buffer): cover session-model-changed and models-cache-invalidated"
```

---

## Task 16: E2E screenshot of the model selector

**Files:**
- Create: `tests/e2e/chat-model-selector.test.ts`

- [ ] **Step 16.1: Write the e2e test**

```ts
// tests/e2e/chat-model-selector.test.ts
import { describe, it } from "vitest";
import { snapshot, openChatWithSession } from "./helpers"; // existing helper file

describe("Chat — Model selector", () => {
	it("shows the session model in the header and lists models in the popover", async () => {
		const session = await openChatWithSession({ prompt: "Olá" });
		await snapshot(session.window, "chat-model-selector-header");
		await session.click('[aria-label="Selecionar modelo"]');
		await snapshot(session.window, "chat-model-selector-popover");
	});
});
```

> If the helpers file (`tests/e2e/helpers.ts` or equivalent) doesn't exist yet with these exact functions, mirror the patterns in the closest sibling e2e test (look in `tests/e2e/`) — selectors should match the `aria-label` we set on `ModelSelectorTrigger` in Task 9.

- [ ] **Step 16.2: Build dev bundle and run**

```bash
bun run build:dev-bundle
bun run test:e2e -- --grep "Model selector"
```

> If the e2e infra is currently blocked (per memory: Xcode install dependency), document this as a follow-up rather than blocking the PR.

- [ ] **Step 16.3: Regenerate screenshots and commit**

```bash
bun run screenshots
git add tests/e2e/chat-model-selector.test.ts docs/screenshots/
git commit -m "test(e2e): screenshot test for chat model selector"
```

---

## Final verification

- [ ] **Step F.1: All tests**

```bash
bun run test && bun run lint
```
Expected: PASS.

- [ ] **Step F.2: Manual full path**

```bash
bun run dev:hmr
```

Walkthrough:
1. Open settings → Modelo Padrão pulls from SDK list.
2. New chat → header shows session model from `meta.model`.
3. Switch model in header while idle → applies; persists; reopen chat for same session shows updated model.
4. Pick override in toolbar → send → user message bubble shows `Modelo: <override>` badge; assistant responds via override; toolbar resets.
5. Toggle authMode in settings → model lists across windows refresh.

- [ ] **Step F.3: Open PR**

```bash
git push -u origin feature/design
gh pr create --title "feat(chat): in-conversation model selector" --body "$(cat <<'EOF'
## Summary
- Adds session-level and per-turn model selection in the Claude chat plugin
- Lists models dynamically from the stable Claude Agent SDK (`Query.initializationResult().models`) — works for Anthropic and Bedrock
- Migrates `session-manager.ts` from `unstable_v2_*` to stable `query()` (prerequisite for runtime `setModel`)

## Test plan
- [ ] `bun run test` passes (unit + component, node + jsdom)
- [ ] `bun run lint` passes
- [ ] Manual: settings dropdown reflects SDK list
- [ ] Manual: header selector changes session model and persists
- [ ] Manual: toolbar override applies for one turn and clears
- [ ] Manual: badge "Modelo: X" shows on overridden user message
- [ ] E2E screenshots regenerated (or follow-up tracked)
EOF
)"
```

---

## Spec coverage cross-check

- **Section 1 (cache + discovery):** Tasks 6, 7, 11.
- **Section 2 (migration to stable query):** Tasks 1, 2, 3, 4, 5.
- **Section 3.B (session model):** Tasks 4.F, 7, 12.
- **Section 3.C (turn override):** Tasks 4.D, 13, 14.
- **Section 4 (UI):** Tasks 8, 9, 10, 12, 13, 14.
- **Section 5 (RPC contract):** Tasks 7, 11, 13.
- **Section 6 (persistence + downgrade):** Tasks 4.C, 14.
- **Section 7 (edge cases):** Tasks 4.D (override validation/restore), 4.F (busy guard), 4.C (downgrade), 7.4 (auth invalidation), 6 (single-flight).
- **Section 8 (testing):** Tasks 1, 6, 9, 12, 15, 16.

If any section feels under-served when reading the plan as a whole, raise during review and add a step inline.

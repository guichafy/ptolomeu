# Claude Auth via CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken in-app Anthropic login stub with a status panel that detects Claude Code installation and credential presence, delegating install and login flows to Terminal.app.

**Architecture:** Backend (`src/bun/claude/auth.ts`) gains two detection helpers — `detectClaudeCli` (login shell `command -v` + path fallbacks) and `detectClaudeCodeKeychain` (`security` metadata read, no unlock). `getClaudeAuthStatus` returns a new `cliStatus` enum that the UI maps to three exclusive panels (`not-installed`, `not-authenticated`, `authenticated`). Two new actions — `claudeInstallCli` and `claudeOpenLogin` — open Terminal.app via `osascript` to run the install script and `claude /login` respectively. The settings panel re-fetches status on dialog open and polls after action clicks.

**Tech Stack:** Bun runtime, `Bun.spawn` for shell/`security`/`osascript` invocations, React 19 + Vitest for the panel UI, Electrobun typed RPC.

**Spec:** `docs/2026-04-25-claude-auth-via-cli-design.md`

---

## File Structure

**Modify:**
- `src/bun/claude/auth.ts` — new detection helpers, new `installClaudeCli`/`openClaudeLogin`, updated `getClaudeAuthStatus`, removal of `loginAnthropicSSO`/`logoutAnthropicSSO`/`saveAnthropicToken`, updated `ClaudeAuthStatus` type.
- `src/bun/rpc.ts` — schema (lines 138–145), imports (lines 16–24), handlers (lines 630–643): rename `claudeLoginSSO` → `claudeOpenLogin`, remove `claudeLogoutSSO`, add `claudeInstallCli`.
- `src/mainview/providers/rpc.ts` — schema mirror (lines 269–276).
- `src/chatview/rpc.ts` — schema mirror (lines 241–248).
- `src/bun/rpc.test.ts` — mock vars (lines 23–27, 76–79), smoke handler list (line 174 area).
- `src/mainview/settings/claude-section.tsx` — replace anthropic auth panel with three-state rendering, polling, dialog-open refresh.

**Create:**
- `src/bun/claude/auth.test.ts` — unit tests for detection helpers and `getClaudeAuthStatus`.
- `src/mainview/settings/claude-section.test.tsx` — three-state rendering, button wiring, polling.

---

## Task 1: Detection helpers in `auth.ts`

**Files:**
- Modify: `src/bun/claude/auth.ts`
- Test: `src/bun/claude/auth.test.ts` (create)

- [ ] **Step 1: Create the test file with `detectClaudeCli` test for the login-shell hit case**

Create `src/bun/claude/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectClaudeCli, detectClaudeCodeKeychain } from "./auth";

const originalSpawn = (Bun as unknown as { spawn: typeof Bun.spawn }).spawn;

interface SpawnCall {
	cmd: string[];
	exit: number;
	stdout?: string;
}

function mockSpawn(handler: (cmd: string[]) => { exit: number; stdout?: string }) {
	const calls: SpawnCall[] = [];
	(Bun as unknown as { spawn: unknown }).spawn = ((...args: unknown[]) => {
		const cmd = args[0] as string[];
		const result = handler(cmd);
		calls.push({ cmd, ...result });
		return {
			stdout: new Response(result.stdout ?? "").body,
			stderr: new Response("").body,
			exited: Promise.resolve(result.exit),
			exitCode: result.exit,
			kill: () => {},
		};
	}) as typeof Bun.spawn;
	return calls;
}

afterEach(() => {
	(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
	vi.restoreAllMocks();
});

describe("detectClaudeCli", () => {
	it("returns installed when login shell command -v finds claude", async () => {
		const calls = mockSpawn((cmd) => {
			if (cmd[0] === "/bin/zsh") {
				return { exit: 0, stdout: "/Users/u/.local/bin/claude\n" };
			}
			return { exit: 1 };
		});
		const result = await detectClaudeCli();
		expect(result.installed).toBe(true);
		expect(result.path).toBe("/Users/u/.local/bin/claude");
		expect(calls[0].cmd).toEqual(["/bin/zsh", "-lc", "command -v claude"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: FAIL — `detectClaudeCli` is not exported from `./auth`.

- [ ] **Step 3: Add `detectClaudeCli` and `detectClaudeCodeKeychain` to `auth.ts`**

In `src/bun/claude/auth.ts`, change the existing import on line 2 from:

```ts
import { homedir } from "node:os";
```

to:

```ts
import { homedir, userInfo } from "node:os";
```

Then append, after the existing helper section (after line 77) and before the public API section:

```ts
export interface ClaudeCliInfo {
	installed: boolean;
	path?: string;
}

const FALLBACK_CLI_PATHS = [
	join(homedir(), ".local/bin/claude"),
	"/usr/local/bin/claude",
	"/opt/homebrew/bin/claude",
];

export async function detectClaudeCli(): Promise<ClaudeCliInfo> {
	try {
		const proc = Bun.spawn(["/bin/zsh", "-lc", "command -v claude"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const code = await proc.exited;
		if (code === 0) {
			const out = (await new Response(proc.stdout).text()).trim();
			if (out) return { installed: true, path: out };
		}
	} catch {
		// fall through to path probe
	}
	for (const p of FALLBACK_CLI_PATHS) {
		if (await Bun.file(p).exists()) return { installed: true, path: p };
	}
	return { installed: false };
}

export async function detectClaudeCodeKeychain(): Promise<boolean> {
	try {
		const proc = Bun.spawn(
			[
				"security",
				"find-generic-password",
				"-s",
				"Claude Code-credentials",
				"-a",
				userInfo().username,
			],
			{ stdout: "ignore", stderr: "ignore" },
		);
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Add remaining tests for `detectClaudeCli` (fallback path) and `detectClaudeCodeKeychain` (both branches)**

Append to `auth.test.ts`:

```ts
describe("detectClaudeCli — fallback paths", () => {
	it("checks known paths when login shell fails", async () => {
		mockSpawn(() => ({ exit: 1 }));
		const fileSpy = vi.spyOn(Bun, "file").mockImplementation(((p: string) => ({
			exists: async () => p === "/opt/homebrew/bin/claude",
		})) as typeof Bun.file);
		const result = await detectClaudeCli();
		expect(result.installed).toBe(true);
		expect(result.path).toBe("/opt/homebrew/bin/claude");
		fileSpy.mockRestore();
	});

	it("returns installed=false when nothing is found", async () => {
		mockSpawn(() => ({ exit: 1 }));
		const fileSpy = vi.spyOn(Bun, "file").mockImplementation(((_p: string) => ({
			exists: async () => false,
		})) as typeof Bun.file);
		const result = await detectClaudeCli();
		expect(result.installed).toBe(false);
		expect(result.path).toBeUndefined();
		fileSpy.mockRestore();
	});
});

describe("detectClaudeCodeKeychain", () => {
	it("returns true when security exits 0", async () => {
		const calls = mockSpawn(() => ({ exit: 0 }));
		const result = await detectClaudeCodeKeychain();
		expect(result).toBe(true);
		expect(calls[0].cmd[0]).toBe("security");
		expect(calls[0].cmd).toContain("Claude Code-credentials");
	});

	it("returns false when security exits non-zero", async () => {
		mockSpawn(() => ({ exit: 44 }));
		expect(await detectClaudeCodeKeychain()).toBe(false);
	});
});
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 7: Commit**

```bash
git add src/bun/claude/auth.ts src/bun/claude/auth.test.ts
git commit -m "feat(claude/auth): add Claude CLI and Keychain detection helpers"
```

---

## Task 2: Update `ClaudeAuthStatus` and `getClaudeAuthStatus`

**Files:**
- Modify: `src/bun/claude/auth.ts`
- Test: `src/bun/claude/auth.test.ts`

- [ ] **Step 1: Write failing tests for the new `getClaudeAuthStatus` shape**

Append to `auth.test.ts`:

```ts
import { getClaudeAuthStatus } from "./auth";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

describe("getClaudeAuthStatus", () => {
	let bedrockDir: string;
	const origHome = process.env.HOME;

	beforeEach(() => {
		bedrockDir = mkdtempSync(joinPath(tmpdir(), "ptolomeu-test-"));
		process.env.HOME = bedrockDir;
	});

	afterEach(() => {
		rmSync(bedrockDir, { recursive: true, force: true });
		if (origHome !== undefined) process.env.HOME = origHome;
		else delete process.env.HOME;
	});

	function writeBedrock() {
		const dir = joinPath(bedrockDir, ".ptolomeu", "auth");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			joinPath(dir, "bedrock.json"),
			JSON.stringify({ endpoint: "https://e", profile: "p", region: "r" }),
		);
	}

	it("CLI absent, no bedrock → not-installed / mode=none", async () => {
		mockSpawn((cmd) => (cmd[0] === "security" ? { exit: 1 } : { exit: 1 }));
		vi.spyOn(Bun, "file").mockImplementation(((_p: string) => ({
			exists: async () => false,
		})) as typeof Bun.file);
		const status = await getClaudeAuthStatus();
		expect(status.anthropic?.cliStatus).toBe("not-installed");
		expect(status.mode).toBe("none");
		expect(status.bedrock).toBeUndefined();
	});

	it("CLI absent, bedrock present → not-installed / mode=bedrock", async () => {
		writeBedrock();
		mockSpawn(() => ({ exit: 1 }));
		vi.spyOn(Bun, "file").mockImplementation(((p: string) => ({
			exists: async () => p.endsWith("bedrock.json"),
			text: async () =>
				JSON.stringify({ endpoint: "https://e", profile: "p", region: "r" }),
		})) as typeof Bun.file);
		const status = await getClaudeAuthStatus();
		expect(status.anthropic?.cliStatus).toBe("not-installed");
		expect(status.mode).toBe("bedrock");
		expect(status.bedrock?.endpoint).toBe("https://e");
	});

	it("CLI present, keychain absent → not-authenticated", async () => {
		mockSpawn((cmd) => {
			if (cmd[0] === "/bin/zsh") return { exit: 0, stdout: "/usr/bin/claude" };
			if (cmd[0] === "security") return { exit: 1 };
			return { exit: 1 };
		});
		vi.spyOn(Bun, "file").mockImplementation(((_p: string) => ({
			exists: async () => false,
		})) as typeof Bun.file);
		const status = await getClaudeAuthStatus();
		expect(status.anthropic?.cliStatus).toBe("not-authenticated");
		expect(status.mode).toBe("none");
	});

	it("CLI present, keychain present → authenticated / mode=anthropic", async () => {
		mockSpawn((cmd) => {
			if (cmd[0] === "/bin/zsh") return { exit: 0, stdout: "/usr/bin/claude" };
			if (cmd[0] === "security") return { exit: 0 };
			return { exit: 1 };
		});
		vi.spyOn(Bun, "file").mockImplementation(((_p: string) => ({
			exists: async () => false,
		})) as typeof Bun.file);
		const status = await getClaudeAuthStatus();
		expect(status.anthropic?.cliStatus).toBe("authenticated");
		expect(status.mode).toBe("anthropic");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: FAIL — `cliStatus` does not exist on `status.anthropic`.

- [ ] **Step 3: Update the type and rewrite `getClaudeAuthStatus`**

In `src/bun/claude/auth.ts`, replace the `ClaudeAuthStatus` interface (currently lines 9–13) with:

```ts
export type ClaudeCliStatus = "not-installed" | "not-authenticated" | "authenticated";

export interface ClaudeAuthStatus {
	mode: "anthropic" | "bedrock" | "none";
	anthropic?: { cliStatus: ClaudeCliStatus };
	bedrock?: { endpoint: string; profile: string; region: string };
}
```

Replace `getClaudeAuthStatus` (currently lines 87–112) with:

```ts
export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
	const [cli, bedrockConfig] = await Promise.all([
		detectClaudeCli(),
		getBedrockConfig(),
	]);

	let cliStatus: ClaudeCliStatus;
	if (!cli.installed) cliStatus = "not-installed";
	else if (await detectClaudeCodeKeychain()) cliStatus = "authenticated";
	else cliStatus = "not-authenticated";

	let mode: ClaudeAuthStatus["mode"];
	if (cliStatus === "authenticated") mode = "anthropic";
	else if (bedrockConfig) mode = "bedrock";
	else mode = "none";

	return {
		mode,
		anthropic: { cliStatus },
		...(bedrockConfig
			? {
					bedrock: {
						endpoint: bedrockConfig.endpoint,
						profile: bedrockConfig.profile,
						region: bedrockConfig.region,
					},
				}
			: {}),
	};
}
```

Also remove the now-unused `readAnthropicToken`, `isAnthropicToken`, the `AnthropicToken` interface, and `ANTHROPIC_PATH` constant (currently lines 21–24, 31, 44–53, 68–77).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bun/claude/auth.ts src/bun/claude/auth.test.ts
git commit -m "refactor(claude/auth): replace token-file auth with CLI status detection"
```

---

## Task 3: Add `installClaudeCli` and `openClaudeLogin`, remove old SSO functions

**Files:**
- Modify: `src/bun/claude/auth.ts`
- Test: `src/bun/claude/auth.test.ts`

- [ ] **Step 1: Write failing tests for the two new functions**

Append to `auth.test.ts`:

```ts
import { installClaudeCli, openClaudeLogin } from "./auth";

describe("installClaudeCli", () => {
	it("invokes osascript with the curl install script and activates Terminal", async () => {
		const calls = mockSpawn(() => ({ exit: 0 }));
		const result = await installClaudeCli();
		expect(result.ok).toBe(true);
		expect(calls[0].cmd[0]).toBe("osascript");
		expect(calls[0].cmd.some((a) => a.includes("claude.ai/install.sh"))).toBe(
			true,
		);
		expect(calls[0].cmd.some((a) => a.includes("activate"))).toBe(true);
	});

	it("returns error when osascript fails", async () => {
		mockSpawn(() => ({ exit: 1 }));
		const result = await installClaudeCli();
		expect(result.ok).toBe(false);
		expect(result.error).toBe("Falha ao abrir o Terminal");
	});
});

describe("openClaudeLogin", () => {
	it("invokes osascript with claude /login", async () => {
		const calls = mockSpawn(() => ({ exit: 0 }));
		const result = await openClaudeLogin();
		expect(result.ok).toBe(true);
		expect(calls[0].cmd.some((a) => a.includes("claude /login"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: FAIL — exports do not exist.

- [ ] **Step 3: Replace `loginAnthropicSSO`, `saveAnthropicToken`, `logoutAnthropicSSO` with the two new functions**

In `src/bun/claude/auth.ts`, delete `loginAnthropicSSO` (currently lines 121–146), `saveAnthropicToken` (currently lines 151–172), and `logoutAnthropicSSO` (currently lines 177–189). Also delete the `ANTHROPIC_CONSOLE_URL` constant (line 34).

Add in their place:

```ts
async function runOsascriptTerminal(
	command: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const proc = Bun.spawn(
			[
				"osascript",
				"-e",
				`tell application "Terminal" to do script "${command}"`,
				"-e",
				`tell application "Terminal" to activate`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const code = await proc.exited;
		if (code !== 0) return { ok: false, error: "Falha ao abrir o Terminal" };
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Erro desconhecido",
		};
	}
}

export async function installClaudeCli(): Promise<{
	ok: boolean;
	error?: string;
}> {
	return runOsascriptTerminal("curl -fsSL https://claude.ai/install.sh | bash");
}

export async function openClaudeLogin(): Promise<{
	ok: boolean;
	error?: string;
}> {
	return runOsascriptTerminal("claude /login");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/bun/claude/auth.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Verify no callers of removed functions remain**

Run: `grep -rn "loginAnthropicSSO\|saveAnthropicToken\|logoutAnthropicSSO" src/`
Expected: only references in `src/bun/rpc.ts` (will be updated in Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/bun/claude/auth.ts src/bun/claude/auth.test.ts
git commit -m "feat(claude/auth): delegate install and login to Terminal via osascript"
```

---

## Task 4: Update RPC schema and handlers

**Files:**
- Modify: `src/bun/rpc.ts` (lines 16–24, 138–145, 630–643)
- Modify: `src/mainview/providers/rpc.ts` (lines 269–276)
- Modify: `src/chatview/rpc.ts` (lines 241–248)
- Test: `src/bun/rpc.test.ts` (existing)

- [ ] **Step 1: Update the smoke list in `rpc.test.ts` to fail**

In `src/bun/rpc.test.ts`, locate the `it.each([...])` smoke list (around line 174) and replace `"claudeLoginSSO"` and `"claudeLogoutSSO"` with `"claudeOpenLogin"` and `"claudeInstallCli"`. Final claude-related entries should read:

```ts
"claudeGetAuthStatus",
"claudeOpenLogin",
"claudeInstallCli",
"claudeSetBedrock",
"claudeGetBedrock",
```

Also update the mock declarations near the top (currently `loginAnthropicSSOMock` and `logoutAnthropicSSOMock` at lines 24–25):

```ts
const openClaudeLoginMock = vi.fn();
const installClaudeCliMock = vi.fn();
```

And the `vi.mock("./claude/auth", ...)` block (currently lines 76–79):

```ts
vi.mock("./claude/auth", () => ({
	getClaudeAuthStatus: getClaudeAuthStatusMock,
	openClaudeLogin: openClaudeLoginMock,
	installClaudeCli: installClaudeCliMock,
	setBedrockConfig: setBedrockConfigMock,
	getBedrockConfig: getBedrockConfigMock,
}));
```

- [ ] **Step 2: Run rpc test to verify it fails**

Run: `bun run test src/bun/rpc.test.ts`
Expected: FAIL — `claudeOpenLogin` handler is not a function (still named `claudeLoginSSO`).

- [ ] **Step 3: Update imports and handlers in `src/bun/rpc.ts`**

In `src/bun/rpc.ts`, replace the auth import block (lines 16–24) with:

```ts
import {
	type BedrockConfig,
	type ClaudeAuthStatus,
	getBedrockConfig,
	getClaudeAuthStatus,
	installClaudeCli,
	openClaudeLogin,
	setBedrockConfig,
} from "./claude/auth";
```

Replace the schema entries (lines 139–143):

```ts
claudeOpenLogin: {
	params: void;
	response: { ok: boolean; error?: string };
};
claudeInstallCli: {
	params: void;
	response: { ok: boolean; error?: string };
};
```

(Note: `claudeLogoutSSO` at line 143 is removed entirely. `claudeGetAuthStatus` and `claudeSetBedrock`/`claudeGetBedrock` remain unchanged.)

Replace the handler block (lines 631–643) with:

```ts
claudeOpenLogin: async () => {
	const result = await openClaudeLogin();
	if (result.ok) {
		await invalidateModelsCache("anthropic");
	}
	return result;
},
claudeInstallCli: async () => installClaudeCli(),
```

(Note: the `claudeLogoutSSO` handler is removed entirely.)

- [ ] **Step 4: Mirror the schema in `src/mainview/providers/rpc.ts`**

Replace lines 270–274 with:

```ts
claudeOpenLogin: {
	params: void;
	response: { ok: boolean; error?: string };
};
claudeInstallCli: {
	params: void;
	response: { ok: boolean; error?: string };
};
```

(Remove the `claudeLogoutSSO` line.)

- [ ] **Step 5: Mirror the schema in `src/chatview/rpc.ts`**

Replace lines 242–246 with:

```ts
claudeOpenLogin: {
	params: void;
	response: { ok: boolean; error?: string };
};
claudeInstallCli: {
	params: void;
	response: { ok: boolean; error?: string };
};
```

(Remove the `claudeLogoutSSO` line.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test src/bun/rpc.test.ts`
Expected: PASS — all smoke entries resolve to functions.

- [ ] **Step 7: Run typecheck and lint**

Run: `bun run lint && bunx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If `tsc` fails on consumers, fix in this task — see Task 5 for the UI consumer.)

- [ ] **Step 8: Commit**

```bash
git add src/bun/rpc.ts src/mainview/providers/rpc.ts src/chatview/rpc.ts src/bun/rpc.test.ts
git commit -m "feat(rpc): rename claudeLoginSSO to claudeOpenLogin and add claudeInstallCli"
```

---

## Task 5: Rewrite `ClaudeSection` auth panel — three states

**Files:**
- Modify: `src/mainview/settings/claude-section.tsx` (lines 30–322)
- Test: `src/mainview/settings/claude-section.test.tsx` (create)

- [ ] **Step 1: Create the test file with rendering tests for all three states**

Create `src/mainview/settings/claude-section.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeSection } from "./claude-section";

const claudeGetAuthStatusMock = vi.fn();
const claudeOpenLoginMock = vi.fn();
const claudeInstallCliMock = vi.fn();
const claudeListSessionsMock = vi.fn();
const claudeListSupportedModelsMock = vi.fn();
const onAgentEventMock = vi.fn(() => () => {});

vi.mock("../providers/rpc", () => ({
	rpc: {
		request: {
			claudeGetAuthStatus: claudeGetAuthStatusMock,
			claudeOpenLogin: claudeOpenLoginMock,
			claudeInstallCli: claudeInstallCliMock,
			claudeListSessions: claudeListSessionsMock,
			claudeListSupportedModels: claudeListSupportedModelsMock,
			loadSettings: vi.fn().mockResolvedValue({ claude: {} }),
			saveSettings: vi.fn().mockResolvedValue(undefined),
			claudeDeleteSession: vi.fn(),
			claudeSetBedrock: vi.fn(),
		},
	},
	onAgentEvent: onAgentEventMock,
}));

vi.mock("./settings-context", () => ({
	useSettings: () => ({
		settings: {
			claude: {
				authMode: "anthropic",
				model: "claude-sonnet-4-6",
				permissionMode: "acceptEdits",
			},
		},
		isOpen: true,
	}),
}));

vi.mock("./mcp-servers", () => ({ McpServersSection: () => null }));

beforeEach(() => {
	claudeGetAuthStatusMock.mockReset();
	claudeOpenLoginMock.mockReset();
	claudeInstallCliMock.mockReset();
	claudeListSessionsMock.mockResolvedValue([]);
	claudeListSupportedModelsMock.mockResolvedValue({ models: [] });
});

afterEach(() => {
	vi.useRealTimers();
});

describe("ClaudeSection — auth states", () => {
	it("renders Install button when CLI is not installed", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "none",
			anthropic: { cliStatus: "not-installed" },
		});
		render(<ClaudeSection />);
		expect(
			await screen.findByRole("button", { name: /Instalar Claude Code/i }),
		).toBeInTheDocument();
	});

	it("renders Connect button when CLI is installed but not authenticated", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "none",
			anthropic: { cliStatus: "not-authenticated" },
		});
		render(<ClaudeSection />);
		expect(
			await screen.findByRole("button", {
				name: /Abrir Claude Code para conectar/i,
			}),
		).toBeInTheDocument();
	});

	it("renders connected badge when authenticated", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "anthropic",
			anthropic: { cliStatus: "authenticated" },
		});
		render(<ClaudeSection />);
		expect(
			await screen.findByText(/Conectado via Claude Code/i),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Desconectar/i }),
		).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/mainview/settings/claude-section.test.tsx`
Expected: FAIL — current component still references old `connected`/`Conectar` UI shape.

- [ ] **Step 3: Update the imports and types section of `claude-section.tsx`**

In `src/mainview/settings/claude-section.tsx`, replace lines 17–24 with:

```ts
import {
	type ClaudeAuthMode,
	type ClaudeAuthStatus,
	type ClaudePermissionMode,
	onAgentEvent,
	rpc,
} from "../providers/rpc";
```

(Removes the now-unused references to old fields; `ClaudeAuthStatus` is now the new shape.)

- [ ] **Step 4: Replace the auth state declarations and handlers**

In `claude-section.tsx`, replace lines 31–34 (auth state) with:

```ts
const [authStatus, setAuthStatus] = useState<ClaudeAuthStatus | null>(null);
const [authLoading, setAuthLoading] = useState(true);
const [actionLoading, setActionLoading] = useState<
	"install" | "login" | null
>(null);
const [actionError, setActionError] = useState<string | null>(null);
const [pendingMessage, setPendingMessage] = useState<string | null>(null);
```

Replace `handleSSOLogin` and `handleSSOLogout` (lines 155–173) with:

```ts
async function handleInstallCli() {
	setActionError(null);
	setActionLoading("install");
	try {
		const result = await rpc.request.claudeInstallCli();
		if (!result.ok) {
			setActionError(result.error ?? "Falha ao abrir o Terminal");
			return;
		}
		setPendingMessage("Instalando no Terminal aberto...");
	} finally {
		setActionLoading(null);
	}
}

async function handleOpenLogin() {
	setActionError(null);
	setActionLoading("login");
	try {
		const result = await rpc.request.claudeOpenLogin();
		if (!result.ok) {
			setActionError(result.error ?? "Falha ao abrir o Terminal");
			return;
		}
		setPendingMessage("Conclua o login no Terminal aberto.");
	} finally {
		setActionLoading(null);
	}
}
```

- [ ] **Step 5: Replace the Anthropic SSO panel JSX**

Replace lines 257–322 (the entire `{authMode === "anthropic" && (...)}` block) with:

```tsx
{authMode === "anthropic" && (
	<div className="flex flex-col gap-2.5 rounded-lg border border-border/50 bg-card/50 p-3">
		{authLoading ? (
			<div className="flex items-center gap-2">
				<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
				<span className="text-xs text-muted-foreground">Verificando...</span>
			</div>
		) : authStatus?.anthropic?.cliStatus === "authenticated" ? (
			<>
				<div className="flex items-center gap-2">
					<Badge
						className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0"
						variant="outline"
					>
						Conectado via Claude Code
					</Badge>
				</div>
				<p className="text-xs text-muted-foreground">
					Usando credencial do Claude Code instalado no sistema.
				</p>
				<p className="text-[10px] text-muted-foreground/70">
					Para desconectar, rode <code>claude /logout</code> no Terminal.
				</p>
			</>
		) : authStatus?.anthropic?.cliStatus === "not-installed" ? (
			<div className="flex flex-col gap-2">
				<p className="text-xs text-muted-foreground">
					O Claude Code não está instalado. Ele será baixado de{" "}
					<code>claude.ai/install.sh</code> e instalado via Terminal.
				</p>
				<Button
					size="sm"
					className="h-7 text-xs w-fit"
					onClick={handleInstallCli}
					disabled={actionLoading !== null}
				>
					{actionLoading === "install" ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						"Instalar Claude Code"
					)}
				</Button>
				{pendingMessage && (
					<p className="text-xs text-muted-foreground">{pendingMessage}</p>
				)}
				{actionError && (
					<p className="text-xs text-destructive">{actionError}</p>
				)}
			</div>
		) : (
			<div className="flex flex-col gap-2">
				<p className="text-xs text-muted-foreground">
					Você precisa entrar na sua conta Anthropic pelo Claude Code.
				</p>
				<Button
					size="sm"
					className="h-7 text-xs w-fit"
					onClick={handleOpenLogin}
					disabled={actionLoading !== null}
				>
					{actionLoading === "login" ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						"Abrir Claude Code para conectar"
					)}
				</Button>
				{pendingMessage && (
					<p className="text-xs text-muted-foreground">{pendingMessage}</p>
				)}
				{actionError && (
					<p className="text-xs text-destructive">{actionError}</p>
				)}
			</div>
		)}
	</div>
)}
```

Also remove the now-unused `isAnthropicConnected` line (currently around line 213).

- [ ] **Step 6: Remove `ssoLoading` and `ssoError` state references**

Search the file for `ssoLoading` and `ssoError` and remove any remaining usages — they were replaced by `actionLoading`/`actionError`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun run test src/mainview/settings/claude-section.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Run lint and typecheck**

Run: `bun run lint && bunx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/mainview/settings/claude-section.tsx src/mainview/settings/claude-section.test.tsx
git commit -m "feat(settings): show three-state Claude auth panel driven by CLI status"
```

---

## Task 6: Polling and dialog-open re-fetch

**Files:**
- Modify: `src/mainview/settings/claude-section.tsx`
- Test: `src/mainview/settings/claude-section.test.tsx`

- [ ] **Step 1: Write failing test for click-triggered polling transition**

Append to `claude-section.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

describe("ClaudeSection — polling", () => {
	it("polls until cliStatus transitions to authenticated after login click", async () => {
		vi.useFakeTimers();
		claudeGetAuthStatusMock
			.mockResolvedValueOnce({
				mode: "none",
				anthropic: { cliStatus: "not-authenticated" },
			})
			.mockResolvedValueOnce({
				mode: "none",
				anthropic: { cliStatus: "not-authenticated" },
			})
			.mockResolvedValue({
				mode: "anthropic",
				anthropic: { cliStatus: "authenticated" },
			});
		claudeOpenLoginMock.mockResolvedValue({ ok: true });

		render(<ClaudeSection />);
		const btn = await screen.findByRole("button", {
			name: /Abrir Claude Code para conectar/i,
		});
		fireEvent.click(btn);
		await waitFor(() => expect(claudeOpenLoginMock).toHaveBeenCalled());

		// advance 3s — first poll
		await vi.advanceTimersByTimeAsync(3000);
		// advance 3s — second poll, should now be authenticated
		await vi.advanceTimersByTimeAsync(3000);

		await waitFor(() =>
			expect(screen.getByText(/Conectado via Claude Code/i)).toBeInTheDocument(),
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/mainview/settings/claude-section.test.tsx`
Expected: FAIL — no polling logic, status never transitions.

- [ ] **Step 3: Add polling logic to `ClaudeSection`**

In `claude-section.tsx`, near the other `useEffect` hooks, add:

```ts
useEffect(() => {
	if (!pendingMessage) return;
	const isInstall = pendingMessage.includes("Instalando");
	const intervalMs = isInstall ? 5000 : 3000;
	const timeoutMs = isInstall ? 5 * 60 * 1000 : 2 * 60 * 1000;
	const start = Date.now();

	const id = setInterval(async () => {
		if (Date.now() - start > timeoutMs) {
			setPendingMessage(null);
			clearInterval(id);
			return;
		}
		const status = await rpc.request.claudeGetAuthStatus();
		setAuthStatus(status);
		if (
			isInstall
				? status.anthropic?.cliStatus !== "not-installed"
				: status.anthropic?.cliStatus === "authenticated"
		) {
			setPendingMessage(null);
			clearInterval(id);
		}
	}, intervalMs);

	return () => clearInterval(id);
}, [pendingMessage]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/mainview/settings/claude-section.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor the `useSettings` mock to allow per-test return values, then write the dialog-open re-fetch test**

At the top of `claude-section.test.tsx`, replace the static `vi.mock("./settings-context", ...)` block with a mock helper that reads from a mutable variable:

```tsx
let useSettingsReturn: { settings: unknown; isOpen: boolean } = {
	settings: {
		claude: {
			authMode: "anthropic",
			model: "claude-sonnet-4-6",
			permissionMode: "acceptEdits",
		},
	},
	isOpen: true,
};

vi.mock("./settings-context", () => ({
	useSettings: () => useSettingsReturn,
}));
```

(Existing tests continue to work because the default `isOpen: true` matches their expectation.)

Then append the new test:

```tsx
describe("ClaudeSection — dialog open refresh", () => {
	it("re-fetches auth status when isOpen transitions to true", async () => {
		useSettingsReturn = { ...useSettingsReturn, isOpen: false };
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "none",
			anthropic: { cliStatus: "not-authenticated" },
		});

		const { rerender } = render(<ClaudeSection />);
		await waitFor(() =>
			expect(claudeGetAuthStatusMock).toHaveBeenCalledTimes(1),
		);

		useSettingsReturn = { ...useSettingsReturn, isOpen: true };
		rerender(<ClaudeSection />);

		await waitFor(() =>
			expect(claudeGetAuthStatusMock).toHaveBeenCalledTimes(2),
		);
	});
});
```

Add an `afterEach` reset (or extend the existing one) to restore `useSettingsReturn.isOpen = true` between tests so order doesn't matter.

- [ ] **Step 6: Run test to verify it fails**

Run: `bun run test src/mainview/settings/claude-section.test.tsx`
Expected: FAIL — `claudeGetAuthStatus` only called once.

- [ ] **Step 7: Wire `isOpen` from `useSettings` into a refresh `useEffect`**

In `claude-section.tsx`, update the `useSettings` destructure (currently `const { settings } = useSettings();` at line 28) to:

```ts
const { settings, isOpen } = useSettings();
```

Update the React import on line 2 from:

```ts
import { useCallback, useEffect, useState } from "react";
```

to:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

Add a `prevOpenRef` declaration alongside the other state hooks, and add a `useEffect` after the existing `refreshAuth` effect (around line 128):

```ts
const prevOpenRef = useRef(isOpen);
useEffect(() => {
	if (!prevOpenRef.current && isOpen) {
		refreshAuth();
	}
	prevOpenRef.current = isOpen;
}, [isOpen, refreshAuth]);
```

- [ ] **Step 8: Run all section tests**

Run: `bun run test src/mainview/settings/claude-section.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 9: Run full test suite to confirm nothing broke**

Run: `bun run test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/mainview/settings/claude-section.tsx src/mainview/settings/claude-section.test.tsx
git commit -m "feat(settings): poll Claude auth status after action and refresh on dialog open"
```

---

## Task 7: Manual verification and final cleanup

**Files:** none modified (manual checks).

- [ ] **Step 1: Build and run the dev bundle**

Run: `bun run dev:hmr`
Expected: app launches; press ⌘+Shift+Space to open palette, then ⌘+, to open Settings.

- [ ] **Step 2: Verify three states by hand**

- Open Settings → Plugins → Claude → Autenticação.
- With Claude Code authenticated (current state of the dev machine), the panel must show **"Conectado via Claude Code"** with no Disconnect button.
- (Optional, only if user wants to test) Run `claude /logout` in a terminal, reopen Settings → expect **"Abrir Claude Code para conectar"** button.
- (Optional) Temporarily rename the `claude` binary (e.g., `mv ~/.local/bin/claude ~/.local/bin/claude.bak`) → expect **"Instalar Claude Code"** button. **Restore the binary afterward.**

- [ ] **Step 3: Confirm lint/typecheck/tests are green**

Run: `bun run lint && bunx tsc --noEmit -p tsconfig.json && bun run test`
Expected: all pass.

- [ ] **Step 4: Final commit (if any tweaks were made during manual verification)**

```bash
git add -A
git status   # confirm only intended files
git commit -m "chore(claude/auth): manual-verification tweaks" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Mocking `Bun.spawn`**: copy the `mockSpawn` helper from `src/bun/net/proxy.test.ts` rather than reinventing — same ergonomics and reset pattern.
- **Test environment**: `auth.test.ts` runs in the `node` Vitest project (matches `src/bun/**`); `claude-section.test.tsx` runs in `jsdom` (matches `src/mainview/**`). Both are configured in `vitest.config.ts`.
- **No migration of `~/.ptolomeu/auth/anthropic.json`**: the old file is simply ignored. Don't add deletion code — out of scope per spec.
- **`AUTH_DIR` is still needed** for `bedrock.json`. Keep it.
- **`invalidateModelsCache` after `claudeOpenLogin`**: keep this call — when the user successfully logs in, the available models for the anthropic backend may change, so we invalidate the cache. Same rationale as the original `claudeLoginSSO` handler.
- **`claudeListSupportedModels` is unchanged**: it reads `authMode` from settings (user's chosen panel), not from auth status. Out of scope for this plan.

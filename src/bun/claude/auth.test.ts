import { afterEach, describe, expect, it, vi } from "vitest";
import {
	detectClaudeCli,
	detectClaudeCodeKeychain,
	getClaudeAuthStatus,
	installClaudeCli,
	openClaudeLogin,
} from "./auth";

const originalSpawn = (Bun as unknown as { spawn: typeof Bun.spawn }).spawn;

interface SpawnCall {
	cmd: string[];
	exit: number;
	stdout?: string;
}

function mockSpawn(
	handler: (cmd: string[]) => { exit: number; stdout?: string },
) {
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

describe("getClaudeAuthStatus", () => {
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
		expect(calls[0].cmd.some((a) => a.includes("activate"))).toBe(true);
	});
});

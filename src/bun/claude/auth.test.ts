import { afterEach, describe, expect, it, vi } from "vitest";
import { detectClaudeCli, detectClaudeCodeKeychain } from "./auth";

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

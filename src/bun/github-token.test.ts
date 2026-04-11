import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as githubToken from "./github-token";
import { _resetCache } from "./github-token";

const originalSpawn = (Bun as unknown as { spawn: typeof Bun.spawn }).spawn;

function mockSpawn(
	calls: Array<{
		match: (cmd: string[]) => boolean;
		stdout?: string;
		exitCode?: number;
	}>,
) {
	const seen: string[][] = [];
	(Bun as unknown as { spawn: unknown }).spawn = ((...args: unknown[]) => {
		const cmd = args[0] as string[];
		seen.push(cmd);
		const handler = calls.find((c) => c.match(cmd));
		const stdout = handler?.stdout ?? "";
		const exitCode = handler?.exitCode ?? 0;
		return {
			stdout: new Response(stdout).body,
			stderr: new Response("").body,
			exited: Promise.resolve(exitCode),
			exitCode,
		};
	}) as typeof Bun.spawn;
	return seen;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
	_resetCache();
	(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
	globalThis.fetch = originalFetch;
});

afterEach(() => {
	vi.restoreAllMocks();
	(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
	globalThis.fetch = originalFetch;
});

describe("github-token", () => {
	it("getToken retorna null quando security sai com erro", async () => {
		mockSpawn([
			{ match: (c) => c[0] === "security", exitCode: 44, stdout: "" },
		]);
		expect(await githubToken.getToken()).toBeNull();
	});

	it("getToken retorna token quando security devolve stdout", async () => {
		mockSpawn([
			{
				match: (c) =>
					c[0] === "security" && c.includes("find-generic-password"),
				stdout: "ghp_abcdef\n",
				exitCode: 0,
			},
		]);
		expect(await githubToken.getToken()).toBe("ghp_abcdef");
	});

	it("setToken chama security add-generic-password com -U e valida via GET /user", async () => {
		const calls = mockSpawn([
			{
				match: (c) => c.includes("add-generic-password"),
				exitCode: 0,
			},
		]);
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ login: "guichafy" }), { status: 200 }),
		) as unknown as typeof fetch;
		const result = await githubToken.setToken("ghp_new");
		expect(result).toEqual({ ok: true, login: "guichafy" });
		expect(
			calls.some((c) => c.includes("add-generic-password") && c.includes("-U")),
		).toBe(true);
		expect(calls.some((c) => c.includes("ghp_new"))).toBe(true);
	});

	it("setToken não persiste quando GET /user devolve 401", async () => {
		const calls = mockSpawn([]);
		globalThis.fetch = vi.fn(
			async () => new Response("", { status: 401 }),
		) as unknown as typeof fetch;
		const result = await githubToken.setToken("bad");
		expect(result.ok).toBe(false);
		expect(result.error).toBeDefined();
		expect(calls.some((c) => c.includes("add-generic-password"))).toBe(false);
	});

	it("deleteToken chama security delete-generic-password", async () => {
		const calls = mockSpawn([
			{ match: (c) => c.includes("delete-generic-password"), exitCode: 0 },
		]);
		await githubToken.deleteToken();
		expect(calls.some((c) => c.includes("delete-generic-password"))).toBe(true);
	});

	it("getStatus retorna hasToken=false quando sem token", async () => {
		mockSpawn([
			{ match: (c) => c.includes("find-generic-password"), exitCode: 44 },
		]);
		const status = await githubToken.getStatus();
		expect(status.hasToken).toBe(false);
		expect(status.login).toBeUndefined();
	});

	it("getStatus retorna login quando GET /user responde ok", async () => {
		mockSpawn([
			{
				match: (c) => c.includes("find-generic-password"),
				stdout: "ghp_ok\n",
				exitCode: 0,
			},
		]);
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ login: "guichafy" }), { status: 200 }),
		) as unknown as typeof fetch;
		const status = await githubToken.getStatus();
		expect(status).toEqual({
			hasToken: true,
			account: process.env.USER ?? "ptolomeu",
			login: "guichafy",
		});
	});
});

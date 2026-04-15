import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as keychain from "./keychain";

const originalSpawn = (Bun as unknown as { spawn: typeof Bun.spawn }).spawn;

function mockSpawn(
	calls: Array<{
		match: (cmd: string[]) => boolean;
		stdout?: string;
		stderr?: string;
		exitCode?: number;
	}>,
) {
	const seen: string[][] = [];
	(Bun as unknown as { spawn: unknown }).spawn = ((...args: unknown[]) => {
		const cmd = args[0] as string[];
		seen.push(cmd);
		const handler = calls.find((c) => c.match(cmd));
		const stdout = handler?.stdout ?? "";
		const stderr = handler?.stderr ?? "";
		const exitCode = handler?.exitCode ?? 0;
		return {
			stdout: new Response(stdout).body,
			stderr: new Response(stderr).body,
			exited: Promise.resolve(exitCode),
			exitCode,
		};
	}) as typeof Bun.spawn;
	return seen;
}

beforeEach(() => {
	(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
});

afterEach(() => {
	vi.restoreAllMocks();
	(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
});

const REF = { service: "com.example.svc", account: "acc@host" };

describe("keychain.getPassword", () => {
	it("retorna null quando security sai com erro (senha não existe)", async () => {
		mockSpawn([{ match: (c) => c[0] === "security", exitCode: 44 }]);
		expect(await keychain.getPassword(REF)).toBeNull();
	});

	it("retorna senha trim() quando security devolve stdout", async () => {
		mockSpawn([
			{
				match: (c) => c.includes("find-generic-password"),
				stdout: "hunter2\n",
				exitCode: 0,
			},
		]);
		expect(await keychain.getPassword(REF)).toBe("hunter2");
	});

	it("retorna null quando stdout vazio mesmo com exit 0", async () => {
		mockSpawn([
			{
				match: (c) => c.includes("find-generic-password"),
				stdout: "",
				exitCode: 0,
			},
		]);
		expect(await keychain.getPassword(REF)).toBeNull();
	});

	it("passa account e service corretos para security", async () => {
		const calls = mockSpawn([
			{
				match: (c) => c.includes("find-generic-password"),
				stdout: "x",
				exitCode: 0,
			},
		]);
		await keychain.getPassword(REF);
		const cmd = calls[0];
		expect(cmd).toContain("-a");
		expect(cmd).toContain(REF.account);
		expect(cmd).toContain("-s");
		expect(cmd).toContain(REF.service);
		expect(cmd).toContain("-w");
	});
});

describe("keychain.hasPassword", () => {
	it("true quando getPassword devolve valor", async () => {
		mockSpawn([
			{
				match: (c) => c.includes("find-generic-password"),
				stdout: "x",
				exitCode: 0,
			},
		]);
		expect(await keychain.hasPassword(REF)).toBe(true);
	});

	it("false quando getPassword devolve null", async () => {
		mockSpawn([{ match: () => true, exitCode: 44 }]);
		expect(await keychain.hasPassword(REF)).toBe(false);
	});
});

describe("keychain.setPassword", () => {
	it("falha imediata com senha vazia sem chamar security", async () => {
		const calls = mockSpawn([]);
		const r = await keychain.setPassword(REF, "");
		expect(r.ok).toBe(false);
		expect(r.error).toBeDefined();
		expect(calls.length).toBe(0);
	});

	it("chama add-generic-password com -U (upsert)", async () => {
		const calls = mockSpawn([
			{ match: (c) => c.includes("add-generic-password"), exitCode: 0 },
		]);
		const r = await keychain.setPassword(REF, "seg#redo!");
		expect(r.ok).toBe(true);
		const cmd = calls[0];
		expect(cmd).toContain("add-generic-password");
		expect(cmd).toContain("-U");
		expect(cmd).toContain("seg#redo!");
	});

	it("propaga stderr quando security falha", async () => {
		mockSpawn([
			{
				match: (c) => c.includes("add-generic-password"),
				stderr: "User interaction is not allowed.",
				exitCode: 36,
			},
		]);
		const r = await keychain.setPassword(REF, "x");
		expect(r.ok).toBe(false);
		expect(r.error).toContain("User interaction");
	});

	it("preserva caracteres especiais na senha", async () => {
		const calls = mockSpawn([
			{ match: (c) => c.includes("add-generic-password"), exitCode: 0 },
		]);
		await keychain.setPassword(REF, "a b$c\"d'e");
		expect(calls[0]).toContain("a b$c\"d'e");
	});
});

describe("keychain.deletePassword", () => {
	it("retorna true quando security sai ok", async () => {
		const calls = mockSpawn([
			{ match: (c) => c.includes("delete-generic-password"), exitCode: 0 },
		]);
		expect(await keychain.deletePassword(REF)).toBe(true);
		expect(calls[0]).toContain("delete-generic-password");
	});

	it("retorna false quando security falha", async () => {
		mockSpawn([
			{ match: (c) => c.includes("delete-generic-password"), exitCode: 44 },
		]);
		expect(await keychain.deletePassword(REF)).toBe(false);
	});
});

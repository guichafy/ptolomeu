import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DecisionRecord, PermissionGate } from "./permission-gate";
import type { RiskClassification } from "./risk-classifier";

const SAFE: RiskClassification = { level: "safe", bypassWhitelist: false };
const DANGEROUS: RiskClassification = {
	level: "dangerous",
	bypassWhitelist: true,
	reason: "test",
};

describe("PermissionGate", () => {
	let idCounter = 0;
	const generateId = () => `perm_${++idCounter}`;
	const now = () => 1_700_000_000_000;

	beforeEach(() => {
		idCounter = 0;
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const makeGate = (
		overrides: Partial<ConstructorParameters<typeof PermissionGate>[0]> = {},
	) =>
		new PermissionGate({
			timeoutMs: 60_000,
			generateId,
			now,
			classify: () => SAFE,
			...overrides,
		});

	const makeRequest = (gate: PermissionGate, overrides = {}) =>
		gate.request({
			toolCallId: "t1",
			toolName: "Bash",
			args: { cmd: "ls" },
			...overrides,
		});

	describe("request", () => {
		it("assigns permissionId from the injected generator and tracks createdAt", () => {
			const gate = makeGate();
			const { permissionId, request } = makeRequest(gate);
			expect(permissionId).toBe("perm_1");
			expect(request).toMatchObject({
				permissionId: "perm_1",
				createdAt: now(),
				toolCallId: "t1",
				toolName: "Bash",
				args: { cmd: "ls" },
			});
			expect(gate.size).toBe(1);
		});

		it("keeps multiple pending requests ordered by creation time", () => {
			const gate = makeGate();
			const a = makeRequest(gate, { toolCallId: "tA" });
			const b = makeRequest(gate, { toolCallId: "tB" });
			expect(gate.pendingRequests().map((r) => r.permissionId)).toEqual([
				a.permissionId,
				b.permissionId,
			]);
		});
	});

	describe("approve", () => {
		it("resolves with behavior=allow for a plain allow", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			expect(gate.approve(permissionId, "allow")).toBe(true);
			await expect(promise).resolves.toEqual({ behavior: "allow" });
			expect(gate.size).toBe(0);
		});

		it("treats always-allow-this-session as allow for the current decision", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			expect(gate.approve(permissionId, "always-allow-this-session")).toBe(
				true,
			);
			await expect(promise).resolves.toEqual({ behavior: "allow" });
		});

		it("attaches modifiedArgs when behavior is allow-modified", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			expect(
				gate.approve(permissionId, "allow-modified", { cmd: "ls -la" }),
			).toBe(true);
			await expect(promise).resolves.toEqual({
				behavior: "allow",
				updatedInput: { cmd: "ls -la" },
			});
		});

		it("returns false and is a no-op for an unknown permissionId", () => {
			const gate = makeGate();
			expect(gate.approve("nonexistent", "allow")).toBe(false);
			expect(gate.size).toBe(0);
		});

		it("returns false when approving twice (second call finds nothing pending)", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			expect(gate.approve(permissionId, "allow")).toBe(true);
			await promise;
			expect(gate.approve(permissionId, "allow")).toBe(false);
		});
	});

	describe("reject", () => {
		it("resolves with behavior=deny and the given reason", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			expect(gate.reject(permissionId, "unsafe path")).toBe(true);
			await expect(promise).resolves.toEqual({
				behavior: "deny",
				message: "unsafe path",
			});
		});

		it("uses a default message when reason is omitted", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			gate.reject(permissionId);
			await expect(promise).resolves.toEqual({
				behavior: "deny",
				message: "denied by user",
			});
		});

		it("returns false for unknown permissionId", () => {
			const gate = makeGate();
			expect(gate.reject("bogus")).toBe(false);
		});
	});

	describe("timeout", () => {
		it("auto-denies after timeoutMs with a descriptive message", async () => {
			const gate = makeGate({ timeoutMs: 30_000 });
			const { promise } = makeRequest(gate);
			vi.advanceTimersByTime(30_000);
			await expect(promise).resolves.toEqual({
				behavior: "deny",
				message: "permission timed out after 30000ms",
			});
			expect(gate.size).toBe(0);
		});

		it("does not fire once the request is approved", async () => {
			const gate = makeGate({ timeoutMs: 10_000 });
			const { permissionId, promise } = makeRequest(gate);
			vi.advanceTimersByTime(5_000);
			expect(gate.approve(permissionId, "allow")).toBe(true);
			await expect(promise).resolves.toEqual({ behavior: "allow" });
			// Advance past the original timeout — nothing should change.
			vi.advanceTimersByTime(20_000);
			expect(gate.size).toBe(0);
		});
	});

	describe("cancel / cancelAll", () => {
		it("cancel resolves a pending request as denied with a cancelled message", async () => {
			const gate = makeGate();
			const { permissionId, promise } = makeRequest(gate);
			expect(gate.cancel(permissionId, "session stopped")).toBe(true);
			await expect(promise).resolves.toEqual({
				behavior: "deny",
				message: "session stopped",
			});
		});

		it("cancelAll resolves every pending request and reports the count", async () => {
			const gate = makeGate();
			const a = makeRequest(gate, { toolCallId: "tA" });
			const b = makeRequest(gate, { toolCallId: "tB" });
			expect(gate.cancelAll("aborted")).toBe(2);
			await expect(a.promise).resolves.toEqual({
				behavior: "deny",
				message: "aborted",
			});
			await expect(b.promise).resolves.toEqual({
				behavior: "deny",
				message: "aborted",
			});
			expect(gate.size).toBe(0);
		});

		it("cancelAll returns 0 when nothing is pending", () => {
			const gate = makeGate();
			expect(gate.cancelAll()).toBe(0);
		});
	});

	describe("risk classifier on request", () => {
		it("attaches the classification to the request payload", () => {
			const gate = makeGate({ classify: () => DANGEROUS });
			const { request } = makeRequest(gate);
			expect(request.risk).toEqual(DANGEROUS);
		});

		it("defaults to the real classifyRisk when no override is provided", () => {
			const gate = new PermissionGate({
				timeoutMs: 60_000,
				generateId,
				now,
			});
			const { request } = gate.request({
				toolCallId: "t1",
				toolName: "Bash",
				args: { command: "rm -rf /tmp/foo" },
			});
			expect(request.risk.level).toBe("dangerous");
			expect(request.risk.bypassWhitelist).toBe(true);
		});
	});

	describe("session whitelist (always-allow-this-session)", () => {
		it("approve with always-allow-this-session adds the (tool, args) pair to the whitelist", async () => {
			const gate = makeGate();
			const a = makeRequest(gate);
			expect(gate.approve(a.permissionId, "always-allow-this-session")).toBe(
				true,
			);
			await a.promise;
			expect(gate.whitelistSize).toBe(1);
		});

		it("subsequent request with the same (tool, args) resolves immediately as allow without pending entry", async () => {
			const gate = makeGate();
			const a = makeRequest(gate);
			gate.approve(a.permissionId, "always-allow-this-session");
			await a.promise;

			const b = makeRequest(gate); // same toolName + args
			await expect(b.promise).resolves.toEqual({ behavior: "allow" });
			expect(gate.size).toBe(0); // never hit the pending map
		});

		it("dangerous tools bypass the whitelist — even after always-allow, next request still prompts", async () => {
			const gate = makeGate({ classify: () => DANGEROUS });
			const a = makeRequest(gate);
			gate.approve(a.permissionId, "always-allow-this-session");
			await a.promise;
			// always-allow should NOT have been added for a dangerous tool.
			expect(gate.whitelistSize).toBe(0);
			const b = makeRequest(gate);
			expect(gate.size).toBe(1);
			gate.reject(b.permissionId);
			await b.promise;
		});

		it("allow-modified does not populate the whitelist", async () => {
			const gate = makeGate();
			const a = makeRequest(gate);
			gate.approve(a.permissionId, "allow-modified", { cmd: "ls -la" });
			await a.promise;
			expect(gate.whitelistSize).toBe(0);
		});

		it("whitelist is keyed by exact args — different args still prompt", async () => {
			const gate = makeGate();
			const a = makeRequest(gate, { args: { cmd: "ls" } });
			gate.approve(a.permissionId, "always-allow-this-session");
			await a.promise;
			const b = makeRequest(gate, { args: { cmd: "pwd" } });
			expect(gate.size).toBe(1);
			gate.reject(b.permissionId);
			await b.promise;
		});

		it("clearWhitelist empties the session whitelist", () => {
			const gate = makeGate();
			const a = makeRequest(gate);
			gate.approve(a.permissionId, "always-allow-this-session");
			expect(gate.whitelistSize).toBe(1);
			gate.clearWhitelist();
			expect(gate.whitelistSize).toBe(0);
		});
	});

	describe("onDecision audit hook", () => {
		it("fires once per decision with source=user-approved on plain allow", async () => {
			const records: DecisionRecord[] = [];
			const gate = makeGate({ onDecision: (r) => records.push(r) });
			const { permissionId, promise } = makeRequest(gate);
			gate.approve(permissionId, "allow");
			await promise;
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				permissionId: "perm_1",
				toolName: "Bash",
				source: "user-approved",
				decision: { behavior: "allow" },
			});
		});

		it("source=user-modified when allow-modified", async () => {
			const records: DecisionRecord[] = [];
			const gate = makeGate({ onDecision: (r) => records.push(r) });
			const { permissionId, promise } = makeRequest(gate);
			gate.approve(permissionId, "allow-modified", { cmd: "echo 1" });
			await promise;
			expect(records[0].source).toBe("user-modified");
		});

		it("source=user-rejected for reject, with the deny message", async () => {
			const records: DecisionRecord[] = [];
			const gate = makeGate({ onDecision: (r) => records.push(r) });
			const { permissionId, promise } = makeRequest(gate);
			gate.reject(permissionId, "unsafe");
			await promise;
			expect(records[0]).toMatchObject({
				source: "user-rejected",
				decision: { behavior: "deny", message: "unsafe" },
			});
		});

		it("source=auto-whitelist on whitelist fast-path, without entering pending", async () => {
			const records: DecisionRecord[] = [];
			const gate = makeGate({ onDecision: (r) => records.push(r) });
			const first = makeRequest(gate);
			gate.approve(first.permissionId, "always-allow-this-session");
			await first.promise;
			records.length = 0;

			const second = makeRequest(gate);
			await second.promise;
			expect(records).toHaveLength(1);
			expect(records[0].source).toBe("auto-whitelist");
		});

		it("source=auto-timeout on timeout", async () => {
			const records: DecisionRecord[] = [];
			const gate = makeGate({
				timeoutMs: 5_000,
				onDecision: (r) => records.push(r),
			});
			const { promise } = makeRequest(gate);
			vi.advanceTimersByTime(5_000);
			await promise;
			expect(records[0].source).toBe("auto-timeout");
		});

		it("source=auto-cancelled on cancel", async () => {
			const records: DecisionRecord[] = [];
			const gate = makeGate({ onDecision: (r) => records.push(r) });
			const { permissionId, promise } = makeRequest(gate);
			gate.cancel(permissionId);
			await promise;
			expect(records[0].source).toBe("auto-cancelled");
		});
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionGate } from "./permission-gate";

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

	const makeGate = (timeoutMs = 60_000) =>
		new PermissionGate({ timeoutMs, generateId, now });

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
			const gate = makeGate(30_000);
			const { promise } = makeRequest(gate);
			vi.advanceTimersByTime(30_000);
			await expect(promise).resolves.toEqual({
				behavior: "deny",
				message: "permission timed out after 30000ms",
			});
			expect(gate.size).toBe(0);
		});

		it("does not fire once the request is approved", async () => {
			const gate = makeGate(10_000);
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
});

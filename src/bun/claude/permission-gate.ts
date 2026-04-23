/**
 * Pending-permission registry. Every `canUseTool` call from the Agent SDK
 * creates a request here; it stays pending until the renderer calls
 * `approve`/`reject` (via RPC) or the timeout elapses.
 *
 * Phase 1.6 ships the core promise machinery. Phase 4 wires it into
 * `unstable_v2_createSession` as the `canUseTool` callback, adds the
 * session whitelist (`always-allow-this-session`) and the risk classifier
 * that forces certain tools to always prompt.
 */

import type { ApproveBehavior } from "@/shared/agent-protocol";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PermissionDecision =
	| { behavior: "allow"; updatedInput?: Record<string, unknown> }
	| { behavior: "deny"; message: string };

export interface PermissionRequestInput {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	suggestions?: string[];
	blockedPath?: string;
	decisionReason?: string;
}

export interface PermissionRequest extends PermissionRequestInput {
	permissionId: string;
	createdAt: number;
}

export interface PermissionGateOptions {
	/** Auto-deny after this many ms. Default 5 minutes. */
	timeoutMs?: number;
	/** UUID generator — injectable for deterministic tests. */
	generateId?: () => string;
	/** Clock for createdAt — injectable for tests. */
	now?: () => number;
}

export type DeniedReason = "user-rejected" | "timeout" | "cancelled";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PendingEntry {
	request: PermissionRequest;
	resolve: (decision: PermissionDecision) => void;
	timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export class PermissionGate {
	private readonly pending = new Map<string, PendingEntry>();
	private readonly timeoutMs: number;
	private readonly generateId: () => string;
	private readonly now: () => number;

	constructor(options: PermissionGateOptions = {}) {
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.generateId = options.generateId ?? (() => crypto.randomUUID());
		this.now = options.now ?? (() => Date.now());
	}

	/**
	 * Register a new permission request. Returns the permissionId to hand to
	 * the renderer and a promise the SDK can await. Promise resolves when
	 * `approve`, `reject`, `cancel` or the timeout is hit.
	 */
	request(input: PermissionRequestInput): {
		permissionId: string;
		request: PermissionRequest;
		promise: Promise<PermissionDecision>;
	} {
		const permissionId = this.generateId();
		const request: PermissionRequest = {
			...input,
			permissionId,
			createdAt: this.now(),
		};

		const promise = new Promise<PermissionDecision>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(permissionId);
				resolve({
					behavior: "deny",
					message: `permission timed out after ${this.timeoutMs}ms`,
				});
			}, this.timeoutMs);

			// Prevent the timer from holding the process open when all other work
			// has completed. Safe because the Agent SDK keeps the event loop alive
			// independently while a session is active.
			timer.unref?.();

			this.pending.set(permissionId, { request, resolve, timer });
		});

		return { permissionId, request, promise };
	}

	/**
	 * Resolve a pending request as allowed. For `allow-modified` the
	 * `modifiedArgs` replace the original input the tool receives. Returns
	 * false if the permissionId is unknown (already decided or never seen).
	 */
	approve(
		permissionId: string,
		behavior: ApproveBehavior,
		modifiedArgs?: Record<string, unknown>,
	): boolean {
		const entry = this.take(permissionId);
		if (!entry) return false;
		const decision: PermissionDecision =
			behavior === "allow-modified"
				? { behavior: "allow", updatedInput: modifiedArgs }
				: { behavior: "allow" };
		entry.resolve(decision);
		return true;
	}

	/**
	 * Resolve a pending request as denied. Returns false if the permissionId
	 * is unknown.
	 */
	reject(permissionId: string, reason?: string): boolean {
		const entry = this.take(permissionId);
		if (!entry) return false;
		entry.resolve({
			behavior: "deny",
			message: reason ?? "denied by user",
		});
		return true;
	}

	/**
	 * Cancel a pending request without a user decision (session abort).
	 */
	cancel(permissionId: string, reason?: string): boolean {
		const entry = this.take(permissionId);
		if (!entry) return false;
		entry.resolve({
			behavior: "deny",
			message: reason ?? "cancelled",
		});
		return true;
	}

	/**
	 * Cancel every pending request. Returns the number of requests cancelled.
	 */
	cancelAll(reason?: string): number {
		const ids = [...this.pending.keys()];
		for (const id of ids) this.cancel(id, reason);
		return ids.length;
	}

	/** Snapshot of currently pending requests, ordered by creation time. */
	pendingRequests(): PermissionRequest[] {
		return [...this.pending.values()]
			.map((e) => e.request)
			.sort((a, b) => a.createdAt - b.createdAt);
	}

	get size(): number {
		return this.pending.size;
	}

	private take(permissionId: string): PendingEntry | null {
		const entry = this.pending.get(permissionId);
		if (!entry) return null;
		clearTimeout(entry.timer);
		this.pending.delete(permissionId);
		return entry;
	}
}

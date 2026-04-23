/**
 * Pending-permission registry. Every `canUseTool` call from the Agent SDK
 * creates a request here; it stays pending until the renderer calls
 * `approve`/`reject` (via RPC) or the timeout elapses.
 *
 * Phase 1.6 shipped the core promise machinery; phase 4 adds the session
 * whitelist, the risk classifier integration, and the decision hook that
 * powers the audit log.
 */

import type { ApproveBehavior } from "@/shared/agent-protocol";
import { classifyRisk, type RiskClassification } from "./risk-classifier";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PermissionDecision =
	| { behavior: "allow"; updatedInput?: Record<string, unknown> }
	| { behavior: "deny"; message: string };

export type DecisionSource =
	| "user-approved"
	| "user-modified"
	| "user-rejected"
	| "auto-whitelist"
	| "auto-timeout"
	| "auto-cancelled";

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
	risk: RiskClassification;
}

export interface DecisionRecord {
	permissionId: string;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	decision: PermissionDecision;
	source: DecisionSource;
	decidedAt: number;
	risk: RiskClassification;
}

export interface PermissionGateOptions {
	/** Auto-deny after this many ms. Default 5 minutes. */
	timeoutMs?: number;
	/** UUID generator — injectable for deterministic tests. */
	generateId?: () => string;
	/** Clock for createdAt — injectable for tests. */
	now?: () => number;
	/** Override the risk classifier (defaults to {@link classifyRisk}). */
	classify?: (toolName: string, args: unknown) => RiskClassification;
	/** Hook called exactly once per decision — wired to the audit log. */
	onDecision?: (record: DecisionRecord) => void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PendingEntry {
	request: PermissionRequest;
	resolve: (decision: PermissionDecision) => void;
	timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function whitelistKey(toolName: string, args: Record<string, unknown>): string {
	// Keyed by name + canonical JSON of args: exact-match, not tool-level.
	// Stability across runs is not required — the whitelist is session-scoped.
	try {
		return `${toolName}::${JSON.stringify(args)}`;
	} catch {
		return `${toolName}::non-serializable`;
	}
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export class PermissionGate {
	private readonly pending = new Map<string, PendingEntry>();
	private readonly whitelist = new Set<string>();
	private readonly timeoutMs: number;
	private readonly generateId: () => string;
	private readonly now: () => number;
	private readonly classify: (
		toolName: string,
		args: unknown,
	) => RiskClassification;
	private readonly onDecision?: (record: DecisionRecord) => void;

	constructor(options: PermissionGateOptions = {}) {
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.generateId = options.generateId ?? (() => crypto.randomUUID());
		this.now = options.now ?? (() => Date.now());
		this.classify = options.classify ?? classifyRisk;
		this.onDecision = options.onDecision;
	}

	/**
	 * Register a new permission request. Returns the permissionId to hand to
	 * the renderer and a promise the SDK can await. Promise resolves when
	 * `approve`, `reject`, `cancel` or the timeout is hit — or immediately
	 * when the (toolName, args) pair matches a session whitelist entry and
	 * the risk classifier doesn't force a prompt.
	 */
	request(input: PermissionRequestInput): {
		permissionId: string;
		request: PermissionRequest;
		promise: Promise<PermissionDecision>;
	} {
		const permissionId = this.generateId();
		const risk = this.classify(input.toolName, input.args);
		const request: PermissionRequest = {
			...input,
			permissionId,
			createdAt: this.now(),
			risk,
		};

		// Whitelist fast-path. Dangerous tools bypass the whitelist even if the
		// user previously granted always-allow — they always prompt.
		if (
			!risk.bypassWhitelist &&
			this.whitelist.has(whitelistKey(input.toolName, input.args))
		) {
			const decision: PermissionDecision = { behavior: "allow" };
			this.emitDecision({
				request,
				decision,
				source: "auto-whitelist",
			});
			return { permissionId, request, promise: Promise.resolve(decision) };
		}

		const promise = new Promise<PermissionDecision>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(permissionId);
				const decision: PermissionDecision = {
					behavior: "deny",
					message: `permission timed out after ${this.timeoutMs}ms`,
				};
				this.emitDecision({
					request,
					decision,
					source: "auto-timeout",
				});
				resolve(decision);
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
	 * `modifiedArgs` replace the original input the tool receives. When
	 * `always-allow-this-session` is used on a non-dangerous tool, the
	 * (toolName, args) pair is added to the session whitelist.
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

		if (
			behavior === "always-allow-this-session" &&
			!entry.request.risk.bypassWhitelist
		) {
			this.whitelist.add(
				whitelistKey(entry.request.toolName, entry.request.args),
			);
		}

		this.emitDecision({
			request: entry.request,
			decision,
			source: behavior === "allow-modified" ? "user-modified" : "user-approved",
		});
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
		const decision: PermissionDecision = {
			behavior: "deny",
			message: reason ?? "denied by user",
		};
		this.emitDecision({
			request: entry.request,
			decision,
			source: "user-rejected",
		});
		entry.resolve(decision);
		return true;
	}

	/**
	 * Cancel a pending request without a user decision (session abort).
	 */
	cancel(permissionId: string, reason?: string): boolean {
		const entry = this.take(permissionId);
		if (!entry) return false;
		const decision: PermissionDecision = {
			behavior: "deny",
			message: reason ?? "cancelled",
		};
		this.emitDecision({
			request: entry.request,
			decision,
			source: "auto-cancelled",
		});
		entry.resolve(decision);
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

	/** Clear the session whitelist (e.g. on session close). */
	clearWhitelist(): void {
		this.whitelist.clear();
	}

	get size(): number {
		return this.pending.size;
	}

	get whitelistSize(): number {
		return this.whitelist.size;
	}

	private take(permissionId: string): PendingEntry | null {
		const entry = this.pending.get(permissionId);
		if (!entry) return null;
		clearTimeout(entry.timer);
		this.pending.delete(permissionId);
		return entry;
	}

	private emitDecision(params: {
		request: PermissionRequest;
		decision: PermissionDecision;
		source: DecisionSource;
	}): void {
		if (!this.onDecision) return;
		const { request, decision, source } = params;
		this.onDecision({
			permissionId: request.permissionId,
			toolCallId: request.toolCallId,
			toolName: request.toolName,
			args: request.args,
			decision,
			source,
			decidedAt: this.now(),
			risk: request.risk,
		});
	}
}

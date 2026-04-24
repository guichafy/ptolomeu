import type { AgentEvent } from "@/shared/agent-protocol";

export interface AgentEventEnvelope {
	sessionId: string;
	event: AgentEvent;
}

export type AgentEventListener = (env: AgentEventEnvelope) => void;

/**
 * Holds agent events emitted by the backend while no renderer-side listener is
 * registered yet. Needed because the streaming loop may start **before** the
 * chat window's React tree has mounted (see session-manager.createSession:
 * it kicks off startStreamingLoop synchronously, then RPC handler calls
 * openChatCallback only after `createSession` returns). Without buffering,
 * early deltas delivered before `useAgentChat` subscribes would be lost.
 *
 * **Single-subscriber semantic.** Only the *first* `subscribe` call drains the
 * buffer; subsequent subscribers see only events that arrive after they
 * register. This matches the current chat topology — one `useAgentChat` hook
 * per window — and avoids re-dispatching stale events when the same hook
 * re-subscribes after a sessionId change. If multiple independent consumers
 * ever need the history, switch to drain-on-every-subscribe and key the
 * buffer on sessionId.
 */
export class AgentEventBuffer {
	private buffer: AgentEventEnvelope[] = [];
	private readonly listeners = new Set<AgentEventListener>();

	push(env: AgentEventEnvelope): void {
		if (this.listeners.size === 0) {
			this.buffer.push(env);
			return;
		}
		for (const listener of this.listeners) listener(env);
	}

	subscribe(listener: AgentEventListener): () => void {
		const isFirst = this.listeners.size === 0;
		this.listeners.add(listener);
		if (isFirst && this.buffer.length > 0) {
			const drain = this.buffer;
			this.buffer = [];
			for (const env of drain) listener(env);
		}
		return () => {
			this.listeners.delete(listener);
		};
	}

	hasPending(): boolean {
		return this.buffer.length > 0;
	}
}

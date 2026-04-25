import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/shared/agent-protocol";
import { AgentEventBuffer } from "./agent-event-buffer";

function envelope(
	type: AgentEvent["type"],
	extra: Partial<AgentEvent> = {},
): { sessionId: string; event: AgentEvent } {
	// Build minimally-shaped events; the buffer is agnostic to payload fields.
	return {
		sessionId: "s1",
		event: { type, ...extra } as AgentEvent,
	};
}

describe("AgentEventBuffer", () => {
	it("buffers events received before any listener subscribes", () => {
		const buf = new AgentEventBuffer();
		buf.push(envelope("text-start"));
		buf.push(envelope("text-delta"));

		const listener = vi.fn();
		buf.subscribe(listener);

		expect(listener).toHaveBeenCalledTimes(2);
		expect(listener.mock.calls[0][0].event.type).toBe("text-start");
		expect(listener.mock.calls[1][0].event.type).toBe("text-delta");
	});

	it("drains the buffer to the first subscriber only once", () => {
		const buf = new AgentEventBuffer();
		buf.push(envelope("text-start"));

		const first = vi.fn();
		const second = vi.fn();
		buf.subscribe(first);
		buf.subscribe(second);

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});

	it("dispatches live events to every active listener without buffering", () => {
		const buf = new AgentEventBuffer();
		const a = vi.fn();
		const b = vi.fn();
		buf.subscribe(a);
		buf.subscribe(b);

		buf.push(envelope("text-delta"));

		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
	});

	it("stops delivering after unsubscribe", () => {
		const buf = new AgentEventBuffer();
		const listener = vi.fn();
		const unsubscribe = buf.subscribe(listener);
		unsubscribe();
		buf.push(envelope("text-delta"));
		expect(listener).not.toHaveBeenCalled();
	});

	it("resumes buffering once the last listener unsubscribes", () => {
		const buf = new AgentEventBuffer();
		const listener = vi.fn();
		const unsubscribe = buf.subscribe(listener);
		unsubscribe();

		buf.push(envelope("text-delta"));
		expect(listener).not.toHaveBeenCalled();

		const next = vi.fn();
		buf.subscribe(next);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("preserves FIFO ordering when draining the buffer", () => {
		const buf = new AgentEventBuffer();
		buf.push(envelope("text-start"));
		buf.push(envelope("text-delta"));
		buf.push(envelope("text-end"));

		const listener = vi.fn();
		buf.subscribe(listener);

		expect(listener.mock.calls.map((c) => c[0].event.type)).toEqual([
			"text-start",
			"text-delta",
			"text-end",
		]);
	});

	it("buffers session-model-changed before subscribers attach", () => {
		const buf = new AgentEventBuffer();
		buf.push({
			sessionId: "s1",
			event: {
				type: "session-model-changed",
				sessionId: "s1",
				model: "claude-opus-4-6",
			},
		});

		const listener = vi.fn();
		buf.subscribe(listener);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0][0].event).toEqual({
			type: "session-model-changed",
			sessionId: "s1",
			model: "claude-opus-4-6",
		});
	});

	it("dispatches models-cache-invalidated to live subscribers", () => {
		const buf = new AgentEventBuffer();
		const listener = vi.fn();
		buf.subscribe(listener);

		buf.push({
			sessionId: "",
			event: { type: "models-cache-invalidated", authMode: "anthropic" },
		});

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0][0].event).toEqual({
			type: "models-cache-invalidated",
			authMode: "anthropic",
		});
		expect(listener.mock.calls[0][0].sessionId).toBe("");
	});
});

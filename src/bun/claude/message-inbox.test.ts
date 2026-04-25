import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, test } from "vitest";
import { createMessageInbox } from "./message-inbox";

function userMsg(text: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content: text },
		parent_tool_use_id: null,
	};
}

describe("createMessageInbox", () => {
	test("delivers messages in push order", async () => {
		const inbox = createMessageInbox();
		inbox.push(userMsg("first"));
		inbox.push(userMsg("second"));
		inbox.close();

		const received: string[] = [];
		for await (const msg of inbox.iterable) {
			received.push(
				typeof msg.message.content === "string" ? msg.message.content : "",
			);
		}
		expect(received).toEqual(["first", "second"]);
	});

	test("yields a pushed message even when consumer awaits first", async () => {
		const inbox = createMessageInbox();
		const it = inbox.iterable[Symbol.asyncIterator]();
		const pending = it.next();
		inbox.push(userMsg("late"));
		const value = await pending;
		expect(value.done).toBe(false);
		expect(value.value?.message.content).toBe("late");
		inbox.close();
	});

	test("close() ends the iterator after draining queued messages", async () => {
		const inbox = createMessageInbox();
		inbox.push(userMsg("one"));
		inbox.close();
		const it = inbox.iterable[Symbol.asyncIterator]();
		const a = await it.next();
		const b = await it.next();
		expect(a.done).toBe(false);
		expect(b.done).toBe(true);
	});

	test("push after close throws", () => {
		const inbox = createMessageInbox();
		inbox.close();
		expect(() => inbox.push(userMsg("x"))).toThrow(/closed/i);
	});

	test("early loop exit does not permanently close the inbox", async () => {
		const inbox = createMessageInbox();
		inbox.push(userMsg("a"));
		inbox.push(userMsg("b"));

		// Break out of the loop after the first message — triggers return().
		for await (const msg of inbox.iterable) {
			void msg;
			break;
		}

		// After the break, the inbox should still accept pushes.
		expect(() => inbox.push(userMsg("c"))).not.toThrow();
		inbox.close();
	});
});

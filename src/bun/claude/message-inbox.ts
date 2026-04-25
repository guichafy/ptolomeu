import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export interface MessageInbox {
	push(msg: SDKUserMessage): void;
	close(): void;
	readonly iterable: AsyncIterable<SDKUserMessage>;
}

/**
 * Push-able async iterable used as the prompt stream for stable `query()`.
 * Messages enqueued before a consumer attaches are buffered; consumers awaiting
 * a `next()` while the queue is empty receive the next pushed message.
 */
export function createMessageInbox(): MessageInbox {
	const queue: SDKUserMessage[] = [];
	const waiters: Array<(result: IteratorResult<SDKUserMessage>) => void> = [];
	let closed = false;

	function push(msg: SDKUserMessage): void {
		if (closed) throw new Error("Inbox is closed");
		const waiter = waiters.shift();
		if (waiter) {
			waiter({ value: msg, done: false });
		} else {
			queue.push(msg);
		}
	}

	function close(): void {
		closed = true;
		while (waiters.length > 0) {
			const w = waiters.shift();
			w?.({ value: undefined as never, done: true });
		}
	}

	const iterable: AsyncIterable<SDKUserMessage> = {
		[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
			return {
				next() {
					if (queue.length > 0) {
						const value = queue.shift()!;
						return Promise.resolve({ value, done: false });
					}
					if (closed) {
						return Promise.resolve({ value: undefined as never, done: true });
					}
					return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
						waiters.push(resolve);
					});
				},
				return() {
					return Promise.resolve({ value: undefined as never, done: true });
				},
			};
		},
	};

	return { push, close, iterable };
}

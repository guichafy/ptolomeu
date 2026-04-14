import type { ChatBlock, ThinkingBlock, ToolUseBlock } from "../types";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const VERBOSE = import.meta.env.VITE_CLAUDE_LOG_VERBOSE === "1";
const verbose = (...args: unknown[]) => {
	if (VERBOSE) console.log(...args);
};

// ---------------------------------------------------------------------------
// Stream event shape helpers (typed from the raw SDK chunks)
// ---------------------------------------------------------------------------

interface StreamEventChunk {
	type: "stream_event";
	event: {
		type: string;
		index?: number;
		content_block?: {
			type: string;
			id?: string;
			name?: string;
			input?: unknown;
			text?: string;
			thinking?: string;
		};
		delta?: {
			type: string;
			text?: string;
			thinking?: string;
			partial_json?: string;
		};
	};
}

interface AssistantChunk {
	type: "assistant";
	message: {
		content: Array<{
			type: string;
			text?: string;
			thinking?: string;
			id?: string;
			name?: string;
			input?: unknown;
		}>;
	};
}

interface UserChunk {
	type: "user";
	message: {
		content:
			| string
			| Array<{
					type: string;
					tool_use_id?: string;
					content?: string | Array<{ type: string; text?: string }>;
					is_error?: boolean;
			  }>;
	};
}

interface ToolProgressChunk {
	type: "tool_progress";
	tool_use_id: string;
	tool_name: string;
	elapsed_time_seconds: number;
}

interface ResultChunk {
	type: "result";
	subtype: string;
	result?: string;
	total_cost_usd?: number;
	duration_ms?: number;
	duration_api_ms?: number;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
	};
}

// ---------------------------------------------------------------------------
// StreamBlockAccumulator
// ---------------------------------------------------------------------------

/**
 * Translates raw SDK stream chunks into structured ChatBlock[] arrays.
 * Pure class with no React dependencies — testable independently.
 */
export class StreamBlockAccumulator {
	private blocks: Map<number, ChatBlock> = new Map();
	private toolInputJsons: Map<number, string> = new Map();
	private thinkingStartTime: number | null = null;
	private turnDone = false;
	// Offset added to stream_event indices so that multi-turn blocks
	// (e.g. after tool use) don't overwrite earlier turns' blocks.
	private blockIndexOffset = 0;

	/**
	 * Process a raw SDK message chunk and update internal block state.
	 * Returns true if the chunk caused a state change worth re-rendering.
	 */
	processChunk(chunk: unknown): boolean {
		if (!chunk || typeof chunk !== "object") return false;
		const msg = chunk as Record<string, unknown>;
		const type = msg.type as string;

		verbose(`[chat:parser] processChunk: type=${type}`);

		switch (type) {
			case "stream_event":
				return this.handleStreamEvent(msg as unknown as StreamEventChunk);
			case "assistant":
				return this.handleAssistantMessage(msg as unknown as AssistantChunk);
			case "user":
				return this.handleUserMessage(msg as unknown as UserChunk);
			case "tool_progress":
				return this.handleToolProgress(msg as unknown as ToolProgressChunk);
			case "result":
				return this.handleResult(msg as unknown as ResultChunk);
			default:
				return false;
		}
	}

	/** Returns current in-progress blocks for rendering. */
	getStreamingBlocks(): ChatBlock[] {
		return Array.from(this.blocks.values());
	}

	/** Returns finalized blocks and metadata after turn ends. */
	finalize(): {
		blocks: ChatBlock[];
		cost?: number;
		durationMs?: number;
		tokenUsage?: { input: number; output: number };
	} {
		const blocks = Array.from(this.blocks.values());

		// Mark any remaining running tool_use as done
		for (const block of blocks) {
			if (block.type === "tool_use" && block.status === "running") {
				block.status = "done";
			}
		}

		return { blocks };
	}

	/** Reset for next turn. */
	reset(): void {
		verbose("[chat:parser] reset");
		this.blocks.clear();
		this.toolInputJsons.clear();
		this.thinkingStartTime = null;
		this.turnDone = false;
		this.blockIndexOffset = 0;
	}

	/** Whether the current turn has completed. */
	isDone(): boolean {
		return this.turnDone;
	}

	// -----------------------------------------------------------------------
	// Private handlers
	// -----------------------------------------------------------------------

	private handleStreamEvent(msg: StreamEventChunk): boolean {
		const evt = msg.event;
		if (!evt) return false;

		switch (evt.type) {
			case "content_block_start":
				return this.onContentBlockStart(evt);
			case "content_block_delta":
				return this.onContentBlockDelta(evt);
			case "content_block_stop":
				return this.onContentBlockStop(evt);
			default:
				return false;
		}
	}

	private onContentBlockStart(evt: StreamEventChunk["event"]): boolean {
		const index = (evt.index ?? 0) + this.blockIndexOffset;
		const block = evt.content_block;
		if (!block) return false;

		verbose(
			`[chat:parser] block start: idx=${index} offset=${this.blockIndexOffset} type=${block.type}${block.name ? ` name=${block.name}` : ""}`,
		);

		switch (block.type) {
			case "text":
				this.blocks.set(index, { type: "text", text: block.text ?? "" });
				return true;
			case "thinking":
				this.thinkingStartTime = Date.now();
				this.blocks.set(index, {
					type: "thinking",
					thinking: block.thinking ?? "",
				});
				return true;
			case "tool_use":
				this.blocks.set(index, {
					type: "tool_use",
					id: block.id ?? "",
					name: block.name ?? "",
					input: block.input ?? {},
					status: "running",
				});
				this.toolInputJsons.set(index, "");
				return true;
			default:
				return false;
		}
	}

	private onContentBlockDelta(evt: StreamEventChunk["event"]): boolean {
		if (evt.index === undefined) return false;
		const index = evt.index + this.blockIndexOffset;
		const delta = evt.delta;
		if (!delta) return false;

		const existing = this.blocks.get(index);
		if (!existing) return false;

		switch (delta.type) {
			case "text_delta":
				if (existing.type === "text" && delta.text) {
					existing.text += delta.text;
					return true;
				}
				return false;

			case "thinking_delta":
				if (existing.type === "thinking" && delta.thinking) {
					existing.thinking += delta.thinking;
					return true;
				}
				return false;

			case "input_json_delta":
				if (existing.type === "tool_use" && delta.partial_json) {
					const current = this.toolInputJsons.get(index) ?? "";
					this.toolInputJsons.set(index, current + delta.partial_json);
					return false; // Don't re-render on every JSON fragment
				}
				return false;

			default:
				return false;
		}
	}

	private onContentBlockStop(evt: StreamEventChunk["event"]): boolean {
		if (evt.index === undefined) return false;
		const index = evt.index + this.blockIndexOffset;

		const existing = this.blocks.get(index);
		if (!existing) return false;

		verbose(`[chat:parser] block stop: idx=${index} type=${existing.type}`);

		// Finalize thinking block with duration
		if (existing.type === "thinking" && this.thinkingStartTime) {
			(existing as ThinkingBlock).durationMs =
				Date.now() - this.thinkingStartTime;
			this.thinkingStartTime = null;
		}

		// Finalize tool_use input from accumulated JSON
		if (existing.type === "tool_use") {
			const json = this.toolInputJsons.get(index);
			if (json) {
				try {
					(existing as ToolUseBlock).input = JSON.parse(json);
				} catch {
					(existing as ToolUseBlock).input = json;
				}
				this.toolInputJsons.delete(index);
			}
		}

		return true;
	}

	private handleAssistantMessage(msg: AssistantChunk): boolean {
		if (!msg.message?.content) return false;

		// Fill in blocks that don't already exist from stream_events.
		// Stream_event blocks take priority (they have richer state like
		// tool status "running"), so we skip indices already occupied.
		let added = false;
		for (let i = 0; i < msg.message.content.length; i++) {
			const targetIndex = i + this.blockIndexOffset;
			if (this.blocks.has(targetIndex)) continue;

			const block = msg.message.content[i];
			switch (block.type) {
				case "text":
					this.blocks.set(targetIndex, {
						type: "text",
						text: block.text ?? "",
					});
					added = true;
					break;
				case "thinking":
					this.blocks.set(targetIndex, {
						type: "thinking",
						thinking: block.thinking ?? "",
					});
					added = true;
					break;
				case "tool_use":
					this.blocks.set(targetIndex, {
						type: "tool_use",
						id: block.id ?? "",
						name: block.name ?? "",
						input: block.input ?? {},
						status: "done",
					});
					added = true;
					break;
			}
		}

		verbose(
			`[chat:parser] assistant message: added=${added} contentLength=${msg.message.content.length} offset=${this.blockIndexOffset}`,
		);

		return added;
	}

	private handleUserMessage(msg: UserChunk): boolean {
		if (typeof msg.message?.content === "string") return false;
		if (!Array.isArray(msg.message?.content)) return false;

		let added = false;
		for (const block of msg.message.content) {
			if (block.type === "tool_result" && block.tool_use_id) {
				let contentStr = "";
				if (typeof block.content === "string") {
					contentStr = block.content;
				} else if (Array.isArray(block.content)) {
					contentStr = block.content
						.filter(
							(b): b is { type: string; text: string } =>
								b.type === "text" && typeof b.text === "string",
						)
						.map((b) => b.text)
						.join("");
				}
				const idx = this.blocks.size;
				this.blocks.set(idx, {
					type: "tool_result",
					toolUseId: block.tool_use_id,
					content: contentStr,
					isError: block.is_error ?? false,
				});
				added = true;
			}
		}

		// After tool results, the next stream_events will be a new assistant
		// turn with indices starting from 0. Update offset so they don't
		// overwrite blocks from previous turns.
		if (added) {
			this.blockIndexOffset = this.blocks.size;
			console.log(
				`[chat:parser] blockIndexOffset updated: offset=${this.blockIndexOffset} reason=tool_result`,
			);
		}

		return added;
	}

	private handleToolProgress(msg: ToolProgressChunk): boolean {
		// Find the tool_use block by ID and update elapsed time
		for (const block of this.blocks.values()) {
			if (
				block.type === "tool_use" &&
				block.id === msg.tool_use_id &&
				block.status === "running"
			) {
				block.elapsedSeconds = msg.elapsed_time_seconds;
				return true;
			}
		}
		return false;
	}

	private handleResult(_msg: ResultChunk): boolean {
		this.turnDone = true;
		// Mark all running tools as done
		for (const block of this.blocks.values()) {
			if (block.type === "tool_use" && block.status === "running") {
				block.status = "done";
			}
		}
		console.log(
			`[chat:parser] turn done: blocks=${this.blocks.size} offset=${this.blockIndexOffset}`,
		);
		return true;
	}
}

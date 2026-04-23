import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { buildAgentEvents, createEventMapperContext } from "./event-mapper";

// Fixtures are shaped to match SDK types but keep only the fields the mapper
// reads. Cast through `unknown` to bypass exhaustive type assertions.
const asMessage = (value: unknown): SDKMessage => value as SDKMessage;

const messageStart = (id = "msg_1") =>
	asMessage({
		type: "stream_event",
		event: { type: "message_start", message: { id } },
		parent_tool_use_id: null,
		uuid: "evt_start",
		session_id: "s1",
	});

const contentBlockStart = (
	index: number,
	block: unknown,
	parent: string | null = null,
) =>
	asMessage({
		type: "stream_event",
		event: { type: "content_block_start", index, content_block: block },
		parent_tool_use_id: parent,
		uuid: `evt_start_${index}`,
		session_id: "s1",
	});

const contentBlockDelta = (index: number, delta: unknown) =>
	asMessage({
		type: "stream_event",
		event: { type: "content_block_delta", index, delta },
		parent_tool_use_id: null,
		uuid: `evt_delta_${index}`,
		session_id: "s1",
	});

const contentBlockStop = (index: number) =>
	asMessage({
		type: "stream_event",
		event: { type: "content_block_stop", index },
		parent_tool_use_id: null,
		uuid: `evt_stop_${index}`,
		session_id: "s1",
	});

describe("buildAgentEvents", () => {
	describe("stream_event — text", () => {
		it("emits text-start / text-delta / text-end with messageId from message_start", () => {
			const ctx = createEventMapperContext();

			expect(buildAgentEvents(messageStart("msg_A"), ctx)).toEqual([]);
			expect(
				buildAgentEvents(contentBlockStart(0, { type: "text", text: "" }), ctx),
			).toEqual([
				{ type: "text-start", messageId: "msg_A", parentToolCallId: null },
			]);
			expect(
				buildAgentEvents(
					contentBlockDelta(0, { type: "text_delta", text: "Hello" }),
					ctx,
				),
			).toEqual([{ type: "text-delta", messageId: "msg_A", delta: "Hello" }]);
			expect(
				buildAgentEvents(
					contentBlockDelta(0, { type: "text_delta", text: " world" }),
					ctx,
				),
			).toEqual([{ type: "text-delta", messageId: "msg_A", delta: " world" }]);
			expect(buildAgentEvents(contentBlockStop(0), ctx)).toEqual([
				{ type: "text-end", messageId: "msg_A" },
			]);
		});

		it("ignores deltas whose index has no active block", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				contentBlockDelta(9, { type: "text_delta", text: "x" }),
				ctx,
			);
			expect(events).toEqual([]);
		});
	});

	describe("stream_event — thinking / reasoning", () => {
		it("emits reasoning-start/delta/end with durationMs", () => {
			const ctx = createEventMapperContext();
			buildAgentEvents(messageStart("msg_T"), ctx);
			expect(
				buildAgentEvents(
					contentBlockStart(0, { type: "thinking", thinking: "" }),
					ctx,
				),
			).toEqual([
				{
					type: "reasoning-start",
					messageId: "msg_T",
					parentToolCallId: null,
				},
			]);
			expect(
				buildAgentEvents(
					contentBlockDelta(0, {
						type: "thinking_delta",
						thinking: "let me think",
					}),
					ctx,
				),
			).toEqual([
				{
					type: "reasoning-delta",
					messageId: "msg_T",
					delta: "let me think",
				},
			]);
			const stop = buildAgentEvents(contentBlockStop(0), ctx);
			expect(stop).toHaveLength(1);
			expect(stop[0]).toMatchObject({
				type: "reasoning-end",
				messageId: "msg_T",
			});
			expect(
				(stop[0] as { durationMs: number }).durationMs,
			).toBeGreaterThanOrEqual(0);
		});
	});

	describe("stream_event — tool_use input streaming", () => {
		it("emits tool-input-start and tool-input-delta, carries parentToolCallId from stream envelope", () => {
			const ctx = createEventMapperContext();
			buildAgentEvents(messageStart("msg_X"), ctx);

			expect(
				buildAgentEvents(
					contentBlockStart(
						0,
						{ type: "tool_use", id: "t1", name: "Bash", input: {} },
						"parent_tool_id",
					),
					ctx,
				),
			).toEqual([
				{
					type: "tool-input-start",
					toolCallId: "t1",
					toolName: "Bash",
					parentToolCallId: "parent_tool_id",
				},
			]);
			expect(
				buildAgentEvents(
					contentBlockDelta(0, {
						type: "input_json_delta",
						partial_json: '{"cmd"',
					}),
					ctx,
				),
			).toEqual([
				{ type: "tool-input-delta", toolCallId: "t1", argsDelta: '{"cmd"' },
			]);
			expect(
				buildAgentEvents(
					contentBlockDelta(0, {
						type: "input_json_delta",
						partial_json: ': "ls"}',
					}),
					ctx,
				),
			).toEqual([
				{
					type: "tool-input-delta",
					toolCallId: "t1",
					argsDelta: ': "ls"}',
				},
			]);
			// content_block_stop for tool_use does NOT emit a tool-call event
			// (that comes from the complete assistant message).
			expect(buildAgentEvents(contentBlockStop(0), ctx)).toEqual([]);
		});

		it("registers parent in ctx so later tool_progress/result can correlate", () => {
			const ctx = createEventMapperContext();
			buildAgentEvents(messageStart("m"), ctx);
			buildAgentEvents(
				contentBlockStart(
					0,
					{ type: "tool_use", id: "t42", name: "Read", input: {} },
					"parent42",
				),
				ctx,
			);
			expect(ctx.toolCallParents.get("t42")).toBe("parent42");
			expect(ctx.toolCallNames.get("t42")).toBe("Read");
		});
	});

	describe("assistant message — tool-call emission", () => {
		it("emits one tool-call per tool_use block with full args", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "assistant",
					uuid: "a1",
					session_id: "s1",
					parent_tool_use_id: null,
					message: {
						id: "msg_A",
						content: [
							{ type: "text", text: "sure" },
							{
								type: "tool_use",
								id: "t1",
								name: "Bash",
								input: { cmd: "ls" },
							},
							{
								type: "tool_use",
								id: "t2",
								name: "Read",
								input: { path: "/tmp/x" },
							},
						],
					},
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "tool-call",
					toolCallId: "t1",
					toolName: "Bash",
					args: { cmd: "ls" },
					parentToolCallId: null,
				},
				{
					type: "tool-call",
					toolCallId: "t2",
					toolName: "Read",
					args: { path: "/tmp/x" },
					parentToolCallId: null,
				},
			]);
		});

		it("deduplicates on repeated assistant messages with same uuid", () => {
			const ctx = createEventMapperContext();
			const msg = asMessage({
				type: "assistant",
				uuid: "a_same",
				session_id: "s1",
				parent_tool_use_id: null,
				message: {
					id: "m",
					content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
				},
			});
			expect(buildAgentEvents(msg, ctx)).toHaveLength(1);
			expect(buildAgentEvents(msg, ctx)).toEqual([]);
		});

		it("propagates parent_tool_use_id from the envelope into tool-call events (subagent case)", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "assistant",
					uuid: "a_sub",
					session_id: "s1",
					parent_tool_use_id: "task_root",
					message: {
						id: "m_sub",
						content: [
							{ type: "tool_use", id: "t_sub", name: "Grep", input: {} },
						],
					},
				}),
				ctx,
			);
			expect(events[0]).toMatchObject({ parentToolCallId: "task_root" });
			expect(ctx.toolCallParents.get("t_sub")).toBe("task_root");
		});
	});

	describe("user message — tool_result / tool_error", () => {
		it("emits tool-result for successful results", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "user",
					parent_tool_use_id: null,
					message: {
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: "t1",
								content: "README.md\nindex.html",
							},
						],
					},
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "tool-result",
					toolCallId: "t1",
					result: "README.md\nindex.html",
				},
			]);
		});

		it("emits tool-error when is_error is true, with stringified content message", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "user",
					parent_tool_use_id: null,
					message: {
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: "t_bad",
								is_error: true,
								content: [{ type: "text", text: "ENOENT: not found" }],
							},
						],
					},
				}),
				ctx,
			);
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				type: "tool-error",
				toolCallId: "t_bad",
				error: { message: "ENOENT: not found" },
			});
		});

		it("ignores string-content user messages (no tool results)", () => {
			const ctx = createEventMapperContext();
			expect(
				buildAgentEvents(
					asMessage({
						type: "user",
						parent_tool_use_id: null,
						message: { role: "user", content: "just text" },
					}),
					ctx,
				),
			).toEqual([]);
		});
	});

	describe("tool_progress", () => {
		it("emits tool-progress with elapsedSeconds", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "tool_progress",
					tool_use_id: "t1",
					tool_name: "Bash",
					parent_tool_use_id: null,
					elapsed_time_seconds: 3.2,
					uuid: "tp",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{ type: "tool-progress", toolCallId: "t1", elapsedSeconds: 3.2 },
			]);
		});
	});

	describe("system subagent task messages", () => {
		it("maps task_started to task-start", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "system",
					subtype: "task_started",
					task_id: "task_1",
					tool_use_id: "t_task",
					description: "Research X",
					task_type: "general-purpose",
					uuid: "sys_1",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "task-start",
					taskId: "task_1",
					toolCallId: "t_task",
					description: "Research X",
					taskType: "general-purpose",
					parentToolCallId: "t_task",
					skipTranscript: undefined,
				},
			]);
		});

		it("maps task_progress to task-progress with usage", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "system",
					subtype: "task_progress",
					task_id: "task_1",
					description: "Searching code",
					last_tool_name: "Grep",
					usage: { total_tokens: 500, tool_uses: 3, duration_ms: 1200 },
					uuid: "sys_2",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "task-progress",
					taskId: "task_1",
					description: "Searching code",
					lastToolName: "Grep",
					usage: { totalTokens: 500, toolUses: 3, durationMs: 1200 },
				},
			]);
		});

		it("maps task_updated to task-update with patch fields remapped", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "system",
					subtype: "task_updated",
					task_id: "task_1",
					patch: {
						status: "running",
						end_time: 1700000000000,
						is_backgrounded: true,
					},
					uuid: "sys_3",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "task-update",
					taskId: "task_1",
					patch: {
						status: "running",
						description: undefined,
						endTime: 1700000000000,
						error: undefined,
						isBackgrounded: true,
					},
				},
			]);
		});

		it("maps task_notification to task-end", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "system",
					subtype: "task_notification",
					task_id: "task_1",
					tool_use_id: "t_task",
					status: "completed",
					output_file: "/tmp/out.md",
					summary: "done",
					usage: { total_tokens: 1000, tool_uses: 5, duration_ms: 2400 },
					uuid: "sys_4",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "task-end",
					taskId: "task_1",
					toolCallId: "t_task",
					status: "completed",
					summary: "done",
					outputFile: "/tmp/out.md",
					usage: { totalTokens: 1000, toolUses: 5, durationMs: 2400 },
				},
			]);
		});

		it("maps session_state_changed to session-state-change", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "system",
					subtype: "session_state_changed",
					state: "idle",
					uuid: "sys_5",
					session_id: "sess_X",
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "session-state-change",
					sessionId: "sess_X",
					state: "idle",
				},
			]);
		});

		it("returns [] for unknown system subtype", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "system",
					subtype: "compact_boundary",
					uuid: "sys_6",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([]);
		});
	});

	describe("result", () => {
		it("maps SDKResultSuccess to finish with usage and cost", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "result",
					subtype: "success",
					duration_ms: 1500,
					duration_api_ms: 1000,
					is_error: false,
					num_turns: 1,
					result: "ok",
					stop_reason: "end_turn",
					total_cost_usd: 0.0042,
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 10,
						cache_creation_input_tokens: 20,
					},
					modelUsage: {},
					permission_denials: [],
					uuid: "r1",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{
					type: "finish",
					reason: "success",
					usage: {
						inputTokens: 100,
						outputTokens: 50,
						cacheReadTokens: 10,
						cacheCreationTokens: 20,
					},
					totalCostUsd: 0.0042,
					durationMs: 1500,
				},
			]);
		});

		it("maps SDKResultError to finish with error subtype as reason", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "result",
					subtype: "error_max_turns",
					duration_ms: 500,
					duration_api_ms: 400,
					is_error: true,
					num_turns: 10,
					stop_reason: null,
					total_cost_usd: 0,
					usage: { input_tokens: 0, output_tokens: 0 },
					modelUsage: {},
					permission_denials: [],
					errors: ["max turns reached"],
					uuid: "r2",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				type: "finish",
				reason: "error_max_turns",
			});
		});
	});

	describe("prompt_suggestion", () => {
		it("emits prompt-suggestions with a single-element array", () => {
			const ctx = createEventMapperContext();
			const events = buildAgentEvents(
				asMessage({
					type: "prompt_suggestion",
					suggestion: "Try running tests",
					uuid: "p1",
					session_id: "s1",
				}),
				ctx,
			);
			expect(events).toEqual([
				{ type: "prompt-suggestions", suggestions: ["Try running tests"] },
			]);
		});
	});
});

import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/shared/agent-protocol";
import {
	type AgentState,
	type AgentToolPart,
	appendUserMessage,
	initialAgentState,
	reduceAgentState,
	resolvePermission,
} from "./agent-state";

function reduce(events: AgentEvent[], start = initialAgentState()): AgentState {
	return events.reduce(reduceAgentState, start);
}

function toolPart(state: AgentState, toolCallId: string): AgentToolPart {
	const part = state.currentMessage?.parts.find(
		(p): p is AgentToolPart => p.kind === "tool" && p.toolCallId === toolCallId,
	);
	if (!part) throw new Error(`tool part ${toolCallId} not found`);
	return part;
}

describe("reduceAgentState", () => {
	describe("session lifecycle", () => {
		it("session-start resets state and marks session running", () => {
			const dirty: AgentState = {
				...initialAgentState(),
				messages: [{ id: "m", role: "user", parts: [], createdAt: 0 }],
				lastError: { message: "boom", recoverable: false },
			};
			const next = reduceAgentState(dirty, {
				type: "session-start",
				sessionId: "s1",
			});
			expect(next.sessionId).toBe("s1");
			expect(next.sessionState).toBe("running");
			expect(next.messages).toEqual([]);
			expect(next.lastError).toBeNull();
		});

		it("session-state-change updates sessionState verbatim", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "session-state-change",
					sessionId: "s1",
					state: "requires_action",
				},
			]);
			expect(state.sessionState).toBe("requires_action");
		});

		it("session-end clears currentMessage and sets sessionState", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "text-start", messageId: "m1", parentToolCallId: null },
				{
					type: "session-end",
					sessionId: "s1",
					reason: "cancelled",
				},
			]);
			expect(state.sessionState).toBe("idle");
			expect(state.currentMessage).toBeNull();
		});

		it("session-end with reason=error sets sessionState=error", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "session-end", sessionId: "s1", reason: "error" },
			]);
			expect(state.sessionState).toBe("error");
		});
	});

	describe("text streaming", () => {
		it("accumulates deltas into a single streaming text part", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "text-start", messageId: "m1", parentToolCallId: null },
				{ type: "text-delta", messageId: "m1", delta: "Hello" },
				{ type: "text-delta", messageId: "m1", delta: " world" },
			]);
			expect(state.currentMessage?.parts).toEqual([
				{
					kind: "text",
					messageId: "m1",
					text: "Hello world",
					streaming: true,
					parentToolCallId: null,
				},
			]);
		});

		it("text-end flips streaming=false on the matching part", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "text-start", messageId: "m1", parentToolCallId: null },
				{ type: "text-delta", messageId: "m1", delta: "hi" },
				{ type: "text-end", messageId: "m1" },
			]);
			const part = state.currentMessage?.parts[0];
			expect(part).toMatchObject({
				kind: "text",
				streaming: false,
				text: "hi",
			});
		});

		it("ignores deltas targeting an unknown messageId", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "text-start", messageId: "m1", parentToolCallId: null },
				{ type: "text-delta", messageId: "wrong", delta: "noise" },
			]);
			const part = state.currentMessage?.parts[0];
			expect(part).toMatchObject({ text: "" });
		});
	});

	describe("reasoning", () => {
		it("stores durationMs on reasoning-end", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "reasoning-start", messageId: "m1", parentToolCallId: null },
				{ type: "reasoning-delta", messageId: "m1", delta: "thinking..." },
				{ type: "reasoning-end", messageId: "m1", durationMs: 1500 },
			]);
			expect(state.currentMessage?.parts[0]).toMatchObject({
				kind: "reasoning",
				text: "thinking...",
				streaming: false,
				durationMs: 1500,
			});
		});
	});

	describe("tool lifecycle", () => {
		it("tool-input-start creates a running tool part; deltas accumulate argsStreaming", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-input-start",
					toolCallId: "t1",
					toolName: "Bash",
					parentToolCallId: null,
				},
				{ type: "tool-input-delta", toolCallId: "t1", argsDelta: '{"cmd"' },
				{
					type: "tool-input-delta",
					toolCallId: "t1",
					argsDelta: ':"ls"}',
				},
			]);
			const tool = toolPart(state, "t1");
			expect(tool).toMatchObject({
				status: "running",
				argsStreaming: '{"cmd":"ls"}',
				args: undefined,
			});
		});

		it("tool-call fills in parsed args without losing prior status", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-input-start",
					toolCallId: "t1",
					toolName: "Bash",
					parentToolCallId: null,
				},
				{
					type: "tool-call",
					toolCallId: "t1",
					toolName: "Bash",
					args: { cmd: "ls" },
					parentToolCallId: null,
				},
			]);
			expect(toolPart(state, "t1").args).toEqual({ cmd: "ls" });
		});

		it("tool-call creates the part when no tool-input-start was seen", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-call",
					toolCallId: "t9",
					toolName: "Read",
					args: { path: "/tmp/x" },
					parentToolCallId: null,
				},
			]);
			const tool = toolPart(state, "t9");
			expect(tool.status).toBe("running");
			expect(tool.args).toEqual({ path: "/tmp/x" });
		});

		it("tool-result transitions to completed and stores result", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-input-start",
					toolCallId: "t1",
					toolName: "Bash",
					parentToolCallId: null,
				},
				{ type: "tool-result", toolCallId: "t1", result: "output" },
			]);
			expect(toolPart(state, "t1")).toMatchObject({
				status: "completed",
				result: "output",
			});
		});

		it("tool-error transitions to error with error payload", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-input-start",
					toolCallId: "t1",
					toolName: "Bash",
					parentToolCallId: null,
				},
				{
					type: "tool-error",
					toolCallId: "t1",
					error: { message: "denied" },
				},
			]);
			expect(toolPart(state, "t1")).toMatchObject({
				status: "error",
				error: { message: "denied" },
			});
		});

		it("tool-progress updates elapsedSeconds in place", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-input-start",
					toolCallId: "t1",
					toolName: "Bash",
					parentToolCallId: null,
				},
				{ type: "tool-progress", toolCallId: "t1", elapsedSeconds: 2.5 },
			]);
			expect(toolPart(state, "t1").elapsedSeconds).toBe(2.5);
		});

		it("subagent tool-call carries parentToolCallId", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-call",
					toolCallId: "child",
					toolName: "Grep",
					args: {},
					parentToolCallId: "task_root",
				},
			]);
			expect(toolPart(state, "child").parentToolCallId).toBe("task_root");
		});
	});

	describe("HITL permissions", () => {
		it("tool-permission-request enqueues and flips sessionState=requires_action", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-permission-request",
					permissionId: "p1",
					toolCallId: "t1",
					toolName: "Bash",
					args: { cmd: "rm -rf" },
				},
			]);
			expect(state.sessionState).toBe("requires_action");
			expect(state.pendingPermissions).toHaveLength(1);
			expect(state.pendingPermissions[0]).toMatchObject({
				permissionId: "p1",
				toolName: "Bash",
			});
		});

		it("resolvePermission removes from queue and restores running state when empty", () => {
			const withRequest = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-permission-request",
					permissionId: "p1",
					toolCallId: "t1",
					toolName: "Bash",
					args: {},
				},
			]);
			const after = resolvePermission(withRequest, "p1");
			expect(after.pendingPermissions).toHaveLength(0);
			expect(after.sessionState).toBe("running");
		});

		it("resolvePermission is a no-op for unknown permissionId", () => {
			const withRequest = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "tool-permission-request",
					permissionId: "p1",
					toolCallId: "t1",
					toolName: "Bash",
					args: {},
				},
			]);
			expect(resolvePermission(withRequest, "nope")).toBe(withRequest);
		});
	});

	describe("tasks / subagents", () => {
		it("task-start registers a running task keyed by taskId", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "task-start",
					taskId: "task1",
					toolCallId: "t_task",
					description: "Audit",
					taskType: "general-purpose",
					parentToolCallId: "t_task",
				},
			]);
			expect(state.tasks.task1).toMatchObject({
				status: "running",
				description: "Audit",
			});
		});

		it("task-progress and task-update merge into existing task", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "task-start",
					taskId: "task1",
					description: "Audit",
					parentToolCallId: null,
				},
				{
					type: "task-progress",
					taskId: "task1",
					description: "Grepping",
					lastToolName: "Grep",
					usage: { totalTokens: 100, toolUses: 1, durationMs: 500 },
				},
				{
					type: "task-update",
					taskId: "task1",
					patch: { status: "running" },
				},
			]);
			expect(state.tasks.task1).toMatchObject({
				lastToolName: "Grep",
				usage: { totalTokens: 100, toolUses: 1, durationMs: 500 },
			});
		});

		it("task-end finalizes status and summary", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "task-start",
					taskId: "task1",
					description: "Audit",
					parentToolCallId: null,
				},
				{
					type: "task-end",
					taskId: "task1",
					status: "completed",
					summary: "done",
				},
			]);
			expect(state.tasks.task1).toMatchObject({
				status: "completed",
				summary: "done",
			});
		});

		it("task events for unknown taskId are ignored (update/end)", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "task-update",
					taskId: "ghost",
					patch: { status: "killed" },
				},
			]);
			expect(state.tasks).toEqual({});
		});
	});

	describe("suggestions + error + finish", () => {
		it("prompt-suggestions replaces suggestions list", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "prompt-suggestions", suggestions: ["try ls", "open README"] },
			]);
			expect(state.suggestions).toEqual(["try ls", "open README"]);
		});

		it("error event stores lastError and keeps running when recoverable", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "error",
					error: { message: "rate limited", recoverable: true },
				},
			]);
			expect(state.lastError).toMatchObject({ message: "rate limited" });
			expect(state.sessionState).toBe("running");
		});

		it("error event with recoverable=false flips sessionState=error", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "error",
					error: { message: "fatal", recoverable: false },
				},
			]);
			expect(state.sessionState).toBe("error");
		});

		it("finish moves currentMessage to messages and records usage/cost", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{ type: "text-start", messageId: "m1", parentToolCallId: null },
				{ type: "text-delta", messageId: "m1", delta: "done" },
				{ type: "text-end", messageId: "m1" },
				{
					type: "finish",
					reason: "success",
					usage: { inputTokens: 50, outputTokens: 20 },
					totalCostUsd: 0.001,
					durationMs: 500,
				},
			]);
			expect(state.currentMessage).toBeNull();
			expect(state.messages).toHaveLength(1);
			expect(state.messages[0].role).toBe("assistant");
			expect(state.usage).toEqual({ inputTokens: 50, outputTokens: 20 });
			expect(state.totalCostUsd).toBe(0.001);
			expect(state.durationMs).toBe(500);
			expect(state.sessionState).toBe("idle");
		});

		it("finish without any currentMessage still records usage and stays idle", () => {
			const state = reduce([
				{ type: "session-start", sessionId: "s1" },
				{
					type: "finish",
					reason: "success",
					usage: { inputTokens: 10, outputTokens: 5 },
				},
			]);
			expect(state.messages).toEqual([]);
			expect(state.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
		});
	});

	describe("optimistic user append", () => {
		it("appendUserMessage pushes a user-role message with a text part", () => {
			const state = appendUserMessage(initialAgentState(), "u1", "hello");
			expect(state.messages).toHaveLength(1);
			expect(state.messages[0]).toMatchObject({
				id: "u1",
				role: "user",
			});
			expect(state.messages[0].parts[0]).toMatchObject({
				kind: "text",
				text: "hello",
				streaming: false,
			});
		});
	});
});

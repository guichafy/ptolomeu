import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
	buildCreateSessionOptions,
	buildResumeSessionOptions,
} from "./session-options";

const noopCanUseTool: CanUseTool = async () => ({
	behavior: "deny",
	message: "test",
});

const TEST_CWD = "/tmp/ptolomeu-test-project";

describe("buildCreateSessionOptions", () => {
	it("sets includePartialMessages=true so the V2 UI receives stream_event deltas", () => {
		const opts = buildCreateSessionOptions({
			model: "claude-sonnet-4-6",
			permissionMode: "dontAsk",
			claudePath: "/usr/local/bin/claude",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.includePartialMessages).toBe(true);
	});

	it("propagates model, claudePath and permissionMode", () => {
		const opts = buildCreateSessionOptions({
			model: "claude-sonnet-4-6",
			permissionMode: "plan",
			claudePath: "/usr/local/bin/claude",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.model).toBe("claude-sonnet-4-6");
		expect(opts.pathToClaudeCodeExecutable).toBe("/usr/local/bin/claude");
		expect(opts.permissionMode).toBe("plan");
	});

	it("wires the provided canUseTool callback", () => {
		const opts = buildCreateSessionOptions({
			model: "m",
			permissionMode: "dontAsk",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.canUseTool).toBe(noopCanUseTool);
	});

	it("propagates cwd so the agent is scoped to the per-conversation project dir", () => {
		const opts = buildCreateSessionOptions({
			model: "m",
			permissionMode: "dontAsk",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.cwd).toBe(TEST_CWD);
	});

	it("includes the default allowedTools whitelist", () => {
		const opts = buildCreateSessionOptions({
			model: "m",
			permissionMode: "dontAsk",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.allowedTools).toEqual([
			"Read",
			"Write",
			"Edit",
			"Bash",
			"Glob",
			"Grep",
			"LS",
		]);
	});

	it("omits mcpServers when the record is empty", () => {
		const opts = buildCreateSessionOptions({
			model: "m",
			permissionMode: "dontAsk",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect("mcpServers" in opts).toBe(false);
	});

	it("forwards mcpServers when the record has entries", () => {
		const mcp = {
			foo: { command: "fake", args: [] },
		} as unknown as Record<string, never>;
		const opts = buildCreateSessionOptions({
			model: "m",
			permissionMode: "dontAsk",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: mcp,
			cwd: TEST_CWD,
		});
		expect(opts.mcpServers).toBe(mcp);
	});
});

describe("buildResumeSessionOptions", () => {
	it("sets includePartialMessages=true", () => {
		const opts = buildResumeSessionOptions({
			model: "m",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.includePartialMessages).toBe(true);
	});

	it("does not set permissionMode (resume inherits from original session)", () => {
		const opts = buildResumeSessionOptions({
			model: "m",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect("permissionMode" in opts).toBe(false);
	});

	it("does not set allowedTools (resume preserves the creating session's config)", () => {
		const opts = buildResumeSessionOptions({
			model: "m",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect("allowedTools" in opts).toBe(false);
	});

	it("propagates cwd so resumed sessions keep running in the project dir", () => {
		const opts = buildResumeSessionOptions({
			model: "m",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect(opts.cwd).toBe(TEST_CWD);
	});

	it("omits mcpServers when empty and forwards when non-empty", () => {
		const empty = buildResumeSessionOptions({
			model: "m",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: {},
			cwd: TEST_CWD,
		});
		expect("mcpServers" in empty).toBe(false);

		const mcp = { foo: { command: "x", args: [] } } as unknown as Record<
			string,
			never
		>;
		const filled = buildResumeSessionOptions({
			model: "m",
			claudePath: "/c",
			canUseTool: noopCanUseTool,
			mcpServers: mcp,
			cwd: TEST_CWD,
		});
		expect(filled.mcpServers).toBe(mcp);
	});
});

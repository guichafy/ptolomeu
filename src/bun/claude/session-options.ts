import type {
	CanUseTool,
	McpServerConfig,
	PermissionMode,
	SDKSessionOptions,
} from "@anthropic-ai/claude-agent-sdk";

// SDKSessionOptions does not publicly expose `includePartialMessages`,
// `mcpServers`, or `cwd`, but the underlying `query` machinery accepts them
// all at runtime. The V2 chat UI depends on `stream_event` messages (partial
// assistant deltas); without includePartialMessages=true the SDK emits only
// complete `assistant` messages and no text-* events reach the renderer.
// `cwd` scopes the agent to a per-conversation project directory — without
// it the SDK inherits process.cwd() (the Electrobun repo).
export type SessionOptionsInternal = SDKSessionOptions & {
	includePartialMessages?: boolean;
	mcpServers?: Record<string, McpServerConfig>;
	cwd?: string;
};

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "LS"];

export interface BuildCreateArgs {
	model: string;
	permissionMode: PermissionMode;
	claudePath: string;
	canUseTool: CanUseTool;
	mcpServers: Record<string, McpServerConfig>;
	/** Per-conversation project directory — becomes the agent's cwd. */
	cwd: string;
}

export interface BuildResumeArgs {
	model: string;
	claudePath: string;
	canUseTool: CanUseTool;
	mcpServers: Record<string, McpServerConfig>;
	/** Project directory of the session being resumed. */
	cwd: string;
}

export function buildCreateSessionOptions(
	args: BuildCreateArgs,
): SessionOptionsInternal {
	const opts: SessionOptionsInternal = {
		model: args.model,
		permissionMode: args.permissionMode,
		pathToClaudeCodeExecutable: args.claudePath,
		allowedTools: ALLOWED_TOOLS,
		canUseTool: args.canUseTool,
		includePartialMessages: true,
		cwd: args.cwd,
	};
	if (Object.keys(args.mcpServers).length > 0) {
		opts.mcpServers = args.mcpServers;
	}
	return opts;
}

export function buildResumeSessionOptions(
	args: BuildResumeArgs,
): SessionOptionsInternal {
	const opts: SessionOptionsInternal = {
		model: args.model,
		pathToClaudeCodeExecutable: args.claudePath,
		canUseTool: args.canUseTool,
		includePartialMessages: true,
		cwd: args.cwd,
	};
	if (Object.keys(args.mcpServers).length > 0) {
		opts.mcpServers = args.mcpServers;
	}
	return opts;
}

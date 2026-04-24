import type {
	CanUseTool,
	McpServerConfig,
	PermissionMode,
	SDKSessionOptions,
} from "@anthropic-ai/claude-agent-sdk";

// SDKSessionOptions does not publicly expose `includePartialMessages` or
// `mcpServers`, but the underlying `query` machinery accepts both at runtime.
// The V2 chat UI depends on `stream_event` messages (partial assistant deltas);
// without includePartialMessages=true the SDK emits only complete `assistant`
// messages and no text-* events reach the renderer.
export type SessionOptionsInternal = SDKSessionOptions & {
	includePartialMessages?: boolean;
	mcpServers?: Record<string, McpServerConfig>;
};

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "LS"];

export interface BuildCreateArgs {
	model: string;
	permissionMode: PermissionMode;
	claudePath: string;
	canUseTool: CanUseTool;
	mcpServers: Record<string, McpServerConfig>;
}

export interface BuildResumeArgs {
	model: string;
	claudePath: string;
	canUseTool: CanUseTool;
	mcpServers: Record<string, McpServerConfig>;
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
	};
	if (Object.keys(args.mcpServers).length > 0) {
		opts.mcpServers = args.mcpServers;
	}
	return opts;
}

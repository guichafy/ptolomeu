// src/bun/claude/session-options.ts
import type {
	CanUseTool,
	McpServerConfig,
	Options,
	PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "LS"];

export interface BuildQueryArgs {
	model: string;
	permissionMode?: PermissionMode;
	claudePath: string;
	canUseTool: CanUseTool;
	mcpServers: Record<string, McpServerConfig>;
	cwd: string;
	/** Pass to resume an existing SDK session (CLI `--resume` semantics). */
	resumeSdkSessionId?: string;
}

/**
 * Build `Options` for the stable `query({ prompt, options })`.
 * `permissionMode` is omitted on resume to honour the SDK transcript's prior mode.
 * `mcpServers` is only attached when non-empty so we don't override the file-based config with `{}`.
 */
export function buildQueryOptions(args: BuildQueryArgs): Options {
	const opts: Options = {
		model: args.model,
		pathToClaudeCodeExecutable: args.claudePath,
		allowedTools: ALLOWED_TOOLS,
		canUseTool: args.canUseTool,
		includePartialMessages: true,
		cwd: args.cwd,
	};
	if (args.permissionMode) {
		opts.permissionMode = args.permissionMode;
	}
	if (Object.keys(args.mcpServers).length > 0) {
		opts.mcpServers = args.mcpServers;
	}
	if (args.resumeSdkSessionId) {
		opts.resume = args.resumeSdkSessionId;
	}
	return opts;
}

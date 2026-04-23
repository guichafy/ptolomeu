import { type ElectrobunRPCSchema, Electroview } from "electrobun/view";
import type { AgentEvent } from "@/shared/agent-protocol";

const VERBOSE = import.meta.env.VITE_CLAUDE_LOG_VERBOSE === "1";
const verbose = (...args: unknown[]) => {
	if (VERBOSE) console.log(...args);
};

export type GitHubSearchType = "repos" | "code" | "issues" | "users";

export type CustomFilter =
	| {
			id: string;
			kind: "team-repos";
			name: string;
			icon?: string;
			org: string;
			team: string;
	  }
	| {
			id: string;
			kind: "search";
			name: string;
			icon?: string;
			baseType: GitHubSearchType;
			qualifiers: string;
	  };

export interface GitHubSettings {
	customFilters: CustomFilter[];
	hasToken: boolean;
}

export interface AnalyticsSettings {
	consentGiven: boolean;
	anonymousId: string;
}

export type ClaudeAuthMode = "anthropic" | "bedrock";
export type ClaudePermissionMode =
	| "dontAsk"
	| "acceptEdits"
	| "bypassPermissions";

export interface ClaudeSettings {
	authMode: ClaudeAuthMode;
	model: string;
	permissionMode: ClaudePermissionMode;
}

export interface Settings {
	version: 1;
	plugins: {
		enabledOrder: string[];
	};
	github: GitHubSettings;
	analytics: AnalyticsSettings;
	claude: ClaudeSettings;
}

export type GitHubSubType =
	| { kind: "native"; type: GitHubSearchType }
	| { kind: "custom"; filter: CustomFilter };

export type GitHubItem =
	| {
			kind: "repo";
			id: number;
			fullName: string;
			description: string | null;
			stars: number;
			language: string | null;
			url: string;
	  }
	| {
			kind: "code";
			id: string;
			path: string;
			repoFullName: string;
			url: string;
	  }
	| {
			kind: "issue";
			id: number;
			number: number;
			title: string;
			state: "open" | "closed";
			isPR: boolean;
			repoFullName: string;
			url: string;
	  }
	| {
			kind: "user";
			id: number;
			login: string;
			name: string | null;
			avatarUrl: string;
			url: string;
	  };

export interface TokenStatus {
	hasToken: boolean;
	account?: string;
	login?: string;
}

export type SettingsSection = "plugins" | "general" | `plugin:${string}`;

export interface ClaudeAuthStatus {
	mode: "anthropic" | "bedrock" | "none";
	anthropic?: { connected: boolean; email?: string };
	bedrock?: { endpoint: string; profile: string; region: string };
}

export interface BedrockConfig {
	endpoint: string;
	profile: string;
	region: string;
}

export interface SessionMeta {
	id: string;
	sdkSessionId: string;
	title: string;
	cwd: string | null;
	model: string;
	authMode: "anthropic" | "bedrock";
	createdAt: string;
	updatedAt: string;
	messageCount: number;
	lastMessage: string;
}

/** Block type for stored messages. */
export type StoredBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string; durationMs?: number }
	| {
			type: "tool_use";
			id: string;
			name: string;
			input: unknown;
			status: "running" | "done" | "error";
			elapsedSeconds?: number;
	  }
	| {
			type: "tool_result";
			toolUseId: string;
			content: string;
			isError?: boolean;
	  };

/** Stored message V2 format with structured blocks. */
export interface StoredMessage {
	version: 2;
	role: "user" | "assistant";
	blocks: StoredBlock[];
	timestamp: string;
	cost?: number;
	durationMs?: number;
	tokenUsage?: { input: number; output: number };
}

interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
	bun: {
		requests: {
			listApps: { params: void; response: { name: string; path: string }[] };
			openApp: { params: { path: string }; response: boolean };
			openUrl: { params: { url: string }; response: boolean };
			getAppIcon: {
				params: { path: string };
				response: { icon: string | null };
			};
			resizeWindow: { params: { height: number }; response: boolean };
			loadSettings: { params: void; response: Settings };
			saveSettings: { params: Settings; response: boolean };
			githubGetTokenStatus: { params: void; response: TokenStatus };
			githubSetToken: {
				params: { token: string };
				response: { ok: boolean; login?: string; error?: string };
			};
			githubDeleteToken: { params: void; response: boolean };
			githubFetchSearch: {
				params: { subType: GitHubSubType; query: string };
				response: { items: GitHubItem[]; cached: boolean };
			};
			githubInvalidateCache: {
				params: void;
				response: boolean;
			};
			trackAnalyticsEvent: {
				params: { event: string; properties?: Record<string, unknown> };
				response: boolean;
			};
			setAnalyticsConsent: {
				params: { consentGiven: boolean };
				response: boolean;
			};
			claudeListSessions: { params: void; response: SessionMeta[] };
			claudeCreateSession: {
				params: { prompt: string; cwd?: string };
				response: { sessionId: string };
			};
			claudeResumeSession: {
				params: { sessionId: string };
				response: boolean;
			};
			claudeSendMessage: { params: { message: string }; response: void };
			claudeStopGeneration: { params: void; response: boolean };
			claudeDeleteSession: {
				params: { sessionId: string };
				response: boolean;
			};
			claudeGetSessionMessages: {
				params: { sessionId: string };
				response: StoredMessage[];
			};
			claudeGetAuthStatus: { params: void; response: ClaudeAuthStatus };
			claudeLoginSSO: {
				params: void;
				response: { ok: boolean; error?: string };
			};
			claudeLogoutSSO: { params: void; response: boolean };
			claudeSetBedrock: { params: BedrockConfig; response: boolean };
			claudeGetBedrock: { params: void; response: BedrockConfig | null };
			claudeOpenChat: {
				params: { sessionId?: string };
				response: boolean;
			};
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {
			openPreferences: { section?: SettingsSection };
			claudeStreamChunk: { sessionId: string; chunk: unknown };
			claudeStreamEnd: {
				sessionId: string;
				result: {
					subtype: string;
					result?: string;
					totalCostUsd?: number;
					durationMs?: number;
					usage?: { input: number; output: number };
				};
			};
			claudeStreamError: { sessionId: string; error: string };
			claudeOpenSession: { sessionId: string };
			agentEvent: { sessionId: string; event: AgentEvent };
		};
	};
}

let openSessionHandler: ((args: { sessionId: string }) => void) | null = null;

// Buffer for claudeOpenSession messages that arrive before the React tree
// has mounted and registered a handler via onOpenSession. This happens when
// the backend creates a new chat window and sends the sessionId before the
// webview's JS has fully loaded. We deliver the buffered args as soon as a
// handler is registered.
let pendingOpenSession: { sessionId: string } | null = null;

let streamChunkHandler:
	| ((args: { sessionId: string; chunk: unknown }) => void)
	| null = null;
let streamEndHandler:
	| ((args: {
			sessionId: string;
			result: {
				subtype: string;
				result?: string;
				totalCostUsd?: number;
				durationMs?: number;
				usage?: { input: number; output: number };
			};
	  }) => void)
	| null = null;
let streamErrorHandler:
	| ((args: { sessionId: string; error: string }) => void)
	| null = null;

// Typed agent-event channel. Subscribers see every event the backend emits for
// any session; filter by sessionId downstream.
type AgentEventListener = (args: {
	sessionId: string;
	event: AgentEvent;
}) => void;
const agentEventListeners = new Set<AgentEventListener>();

export function onAgentEvent(listener: AgentEventListener): () => void {
	agentEventListeners.add(listener);
	return () => {
		agentEventListeners.delete(listener);
	};
}

export function setStreamHandlers(handlers: {
	onChunk: (args: { sessionId: string; chunk: unknown }) => void;
	onEnd: (args: {
		sessionId: string;
		result: {
			subtype: string;
			result?: string;
			totalCostUsd?: number;
			durationMs?: number;
			usage?: { input: number; output: number };
		};
	}) => void;
	onError: (args: { sessionId: string; error: string }) => void;
}) {
	streamChunkHandler = handlers.onChunk;
	streamEndHandler = handlers.onEnd;
	streamErrorHandler = handlers.onError;
}

const rpcInstance = Electroview.defineRPC<PtolomeuRPCSchema>({
	maxRequestTime: 60_000,
	handlers: {
		messages: {
			openPreferences: () => {},
			claudeStreamChunk: (args) => {
				const chunkType =
					args.chunk && typeof args.chunk === "object" && "type" in args.chunk
						? (args.chunk as { type: unknown }).type
						: "unknown";
				verbose(
					`[chat:rpc] chunk: sessionId=${args.sessionId} type=${String(chunkType)}`,
				);
				streamChunkHandler?.(args);
			},
			claudeStreamEnd: (args) => {
				console.log(
					`[chat:rpc] end: sessionId=${args.sessionId} subtype=${args.result.subtype}`,
				);
				streamEndHandler?.(args);
			},
			claudeStreamError: (args) => {
				console.error(
					`[chat:rpc] error: sessionId=${args.sessionId} error=${args.error}`,
				);
				streamErrorHandler?.(args);
			},
			claudeOpenSession: (args) => {
				console.log(`[chat:rpc] openSession: sessionId=${args.sessionId}`);
				if (openSessionHandler) {
					openSessionHandler(args);
				} else {
					console.log(
						`[chat:rpc] openSession buffered (handler not ready): sessionId=${args.sessionId}`,
					);
					pendingOpenSession = args;
				}
			},
			agentEvent: (args) => {
				verbose(
					`[chat:rpc] agentEvent: sessionId=${args.sessionId} type=${args.event.type}`,
				);
				for (const listener of agentEventListeners) listener(args);
			},
		},
	},
});

new Electroview({ rpc: rpcInstance });

export function onOpenSession(handler: (args: { sessionId: string }) => void) {
	openSessionHandler = handler;
	// Drain any message that arrived before the handler was registered.
	if (pendingOpenSession) {
		const pending = pendingOpenSession;
		pendingOpenSession = null;
		console.log(`[chat:rpc] openSession drain: sessionId=${pending.sessionId}`);
		handler(pending);
	}
}

export const rpc = rpcInstance;

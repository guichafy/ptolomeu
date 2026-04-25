import type { ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadSettings } from "../settings";
import { findClaudeCli } from "./claude-cli";
import { mcpLoader } from "./mcp-loader";
import { createMessageInbox } from "./message-inbox";
import { buildQueryOptions } from "./session-options";

export type ClaudeAuthMode = "anthropic" | "bedrock";

const cache = new Map<ClaudeAuthMode, ModelInfo[]>();
const inFlight = new Map<ClaudeAuthMode, Promise<ModelInfo[]>>();

export function peekModels(authMode: ClaudeAuthMode): ModelInfo[] | null {
	return cache.get(authMode) ?? null;
}

export async function putModelsFromInit(models: ModelInfo[]): Promise<void> {
	const settings = await loadSettings();
	const mode: ClaudeAuthMode = settings.claude.authMode;
	cache.set(mode, models);
}

export function invalidate(authMode?: ClaudeAuthMode): void {
	if (!authMode) {
		cache.clear();
		inFlight.clear();
		return;
	}
	cache.delete(authMode);
	inFlight.delete(authMode);
}

export interface GetModelsOpts {
	/** Override the discovery function (testing). */
	discover?: () => Promise<ModelInfo[]>;
}

export async function getModels(
	authMode: ClaudeAuthMode,
	opts: GetModelsOpts = {},
): Promise<ModelInfo[]> {
	const cached = cache.get(authMode);
	if (cached) return cached;
	const inflight = inFlight.get(authMode);
	if (inflight) return inflight;

	const discoverFn = opts.discover ?? (() => discoverModels(authMode));
	const promise = discoverFn()
		.then((models) => {
			cache.set(authMode, models);
			return models;
		})
		.finally(() => {
			inFlight.delete(authMode);
		});
	inFlight.set(authMode, promise);
	return promise;
}

/**
 * Default discovery: spin up a minimal `query()` whose prompt iterable never
 * yields, read `initializationResult` to extract the model list, then close.
 * No SDK message is sent, so there is no inference cost.
 */
async function discoverModels(authMode: ClaudeAuthMode): Promise<ModelInfo[]> {
	void authMode;
	const settings = await loadSettings();
	const claudePath = await findClaudeCli();
	const mcpServers = await mcpLoader.resolve();
	const inbox = createMessageInbox();
	const q: Query = query({
		prompt: inbox.iterable,
		options: buildQueryOptions({
			model: settings.claude.model,
			claudePath,
			canUseTool: async () => ({ behavior: "deny", message: "discovery-only" }),
			mcpServers,
			cwd: process.cwd(),
		}),
	});
	try {
		const init = await q.initializationResult();
		return init.models ?? [];
	} finally {
		try {
			inbox.close();
		} catch {}
		try {
			q.close();
		} catch {}
	}
}

/** Test-only reset. */
export function __resetModelsCache(): void {
	cache.clear();
	inFlight.clear();
}

import { readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineElectrobunRPC, type ElectrobunRPCSchema } from "electrobun/bun";
import { setAnalyticsEnabled, trackEvent } from "./analytics";
import {
	type BedrockConfig,
	type ClaudeAuthStatus,
	getBedrockConfig,
	getClaudeAuthStatus,
	loginAnthropicSSO,
	logoutAnthropicSSO,
	setBedrockConfig,
} from "./claude/auth";
import {
	createSession as claudeCreateSession,
	deleteSession as claudeDeleteSession,
	getSessionMessages as claudeGetSessionMessages,
	listSessions as claudeListSessions,
	resumeSession as claudeResumeSession,
	sendMessage as claudeSendMessage,
	setSender as claudeSetSender,
	stopGeneration as claudeStopGeneration,
	type SessionMeta,
	type StoredMessage,
} from "./claude/session-manager";
import {
	type GitHubItem,
	type GitHubSubType,
	githubFetchSearch,
} from "./github/github-fetch";
import { invalidateAll as invalidateSearchCache } from "./github/search-cache";
import {
	deleteToken as deleteGithubToken,
	getStatus as getGithubTokenStatus,
	setToken as setGithubToken,
	type TokenStatus,
} from "./github-token";
import {
	loadSettings as loadSettingsFromDisk,
	type Settings,
	saveSettings as saveSettingsToDisk,
} from "./settings";

export type SettingsSection = "plugins" | "general" | "github";

export interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
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
				result: { subtype: string; result?: string };
			};
			claudeStreamError: { sessionId: string; error: string };
		};
	};
}

// Callback for opening chat window (set from index.ts)
let openChatCallback: ((sessionId?: string) => void) | null = null;
export function setOpenChatCallback(cb: (sessionId?: string) => void) {
	openChatCallback = cb;
}

// Window reference for resize handler (set from index.ts)
let mainWindowRef: {
	getFrame: () => { x: number; y: number; width: number; height: number };
	setFrame: (x: number, y: number, w: number, h: number) => void;
} | null = null;
export function setMainWindow(win: {
	getFrame: () => { x: number; y: number; width: number; height: number };
	setFrame: (x: number, y: number, w: number, h: number) => void;
}) {
	mainWindowRef = win;
}

let cachedApps: { name: string; path: string }[] | null = null;

async function scanDirectory(
	dir: string,
): Promise<{ name: string; path: string }[]> {
	const results: { name: string; path: string }[] = [];
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.name.endsWith(".app")) {
				results.push({
					name: entry.name.replace(/\.app$/, ""),
					path: fullPath,
				});
			} else if (entry.isDirectory()) {
				const subResults = await scanDirectory(fullPath);
				results.push(...subResults);
			}
		}
	} catch {
		// Directory may not exist or be unreadable
	}
	return results;
}

async function scanApps(): Promise<{ name: string; path: string }[]> {
	if (cachedApps) return cachedApps;

	const dirs = [
		"/Applications",
		"/System/Applications",
		join(homedir(), "Applications"),
	];

	const results = await Promise.all(dirs.map(scanDirectory));
	const apps = results.flat();

	const seen = new Set<string>();
	const unique = apps.filter((app) => {
		if (seen.has(app.path)) return false;
		seen.add(app.path);
		return true;
	});

	unique.sort((a, b) => a.name.localeCompare(b.name));
	cachedApps = unique;
	return unique;
}

const iconCache = new Map<string, string | null>();

async function getAppIconBase64(appPath: string): Promise<string | null> {
	if (iconCache.has(appPath)) return iconCache.get(appPath)!;

	try {
		// Read CFBundleIconFile from Info.plist
		const plistBase = join(appPath, "Contents", "Info");
		const defaultsProc = Bun.spawn(
			["defaults", "read", plistBase, "CFBundleIconFile"],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		let iconName = (await new Response(defaultsProc.stdout).text()).trim();
		if (!iconName) {
			// Try CFBundleIconName (modern apps with asset catalogs)
			const defaultsProc2 = Bun.spawn(
				["defaults", "read", plistBase, "CFBundleIconName"],
				{
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			iconName = (await new Response(defaultsProc2.stdout).text()).trim();
			if (!iconName) {
				iconCache.set(appPath, null);
				return null;
			}
		}

		if (!iconName.endsWith(".icns")) iconName += ".icns";
		const icnsPath = join(appPath, "Contents", "Resources", iconName);

		// Check file exists
		const file = Bun.file(icnsPath);
		if (!(await file.exists())) {
			iconCache.set(appPath, null);
			return null;
		}

		// Convert to 32x32 PNG using sips
		const tmpFile = `/tmp/ptolomeu-icon-${process.pid}-${Date.now()}.png`;
		const sipsProc = Bun.spawn(
			["sips", "-s", "format", "png", "-Z", "32", icnsPath, "--out", tmpFile],
			{ stdout: "pipe", stderr: "pipe" },
		);
		await sipsProc.exited;

		const pngFile = Bun.file(tmpFile);
		if (!(await pngFile.exists())) {
			iconCache.set(appPath, null);
			return null;
		}

		const buffer = await pngFile.arrayBuffer();
		const base64 = Buffer.from(buffer).toString("base64");

		// Cleanup temp file
		unlink(tmpFile).catch(() => {});

		iconCache.set(appPath, base64);
		return base64;
	} catch {
		iconCache.set(appPath, null);
		return null;
	}
}

export const rpc = defineElectrobunRPC<PtolomeuRPCSchema, "bun">("bun", {
	handlers: {
		requests: {
			listApps: async () => {
				return scanApps();
			},
			openApp: async ({ path }) => {
				try {
					Bun.spawn(["open", "-a", path]);
					return true;
				} catch {
					return false;
				}
			},
			openUrl: async ({ url }) => {
				try {
					Bun.spawn(["open", url]);
					return true;
				} catch {
					return false;
				}
			},
			getAppIcon: async ({ path }) => {
				const icon = await getAppIconBase64(path);
				return { icon };
			},
			resizeWindow: async ({ height }) => {
				if (mainWindowRef) {
					const frame = mainWindowRef.getFrame();
					if (frame.height === height) return true;
					const newY = frame.y + (frame.height - height) / 2;
					mainWindowRef.setFrame(frame.x, newY, 630, height);
					return true;
				}
				return false;
			},
			loadSettings: async () => {
				return loadSettingsFromDisk();
			},
			saveSettings: async (next) => {
				return saveSettingsToDisk(next);
			},
			githubGetTokenStatus: async () => {
				return getGithubTokenStatus();
			},
			githubSetToken: async ({ token }) => {
				const result = await setGithubToken(token);
				if (result.ok) {
					const current = await loadSettingsFromDisk();
					await saveSettingsToDisk({
						...current,
						github: { ...current.github, hasToken: true },
					});
				}
				return result;
			},
			githubDeleteToken: async () => {
				await deleteGithubToken();
				const current = await loadSettingsFromDisk();
				await saveSettingsToDisk({
					...current,
					github: { ...current.github, hasToken: false },
				});
				return true;
			},
			githubFetchSearch: async ({ subType, query }) => {
				const started = Date.now();
				const label =
					subType.kind === "native"
						? subType.type
						: `custom:${subType.filter.kind}:${subType.filter.name}`;
				try {
					const result = await githubFetchSearch({ subType, query });
					console.log(
						`[github] ${label} "${query}" → ${result.items.length} items ${
							result.cached ? "(cache)" : `(${Date.now() - started}ms)`
						}`,
					);
					return result;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					console.error(
						`[github] ${label} "${query}" failed after ${Date.now() - started}ms: ${message}`,
					);
					if (err instanceof Error && err.stack) {
						console.error(err.stack);
					}
					throw err;
				}
			},
			githubInvalidateCache: async () => {
				invalidateSearchCache();
				return true;
			},
			trackAnalyticsEvent: async ({ event, properties }) => {
				trackEvent(event, properties);
				return true;
			},
			setAnalyticsConsent: async ({ consentGiven }) => {
				setAnalyticsEnabled(consentGiven);
				return true;
			},
			claudeListSessions: async () => claudeListSessions(),
			claudeCreateSession: async ({ prompt, cwd }) => {
				console.log("[rpc] claudeCreateSession called, prompt:", prompt);
				try {
					const sessionId = await claudeCreateSession(prompt, cwd);
					console.log("[rpc] claudeCreateSession success:", sessionId);
					return { sessionId };
				} catch (err) {
					console.error("[rpc] claudeCreateSession FAILED:", err);
					throw err;
				}
			},
			claudeResumeSession: async ({ sessionId }) =>
				claudeResumeSession(sessionId),
			claudeSendMessage: async ({ message }) => {
				await claudeSendMessage(message);
			},
			claudeStopGeneration: async () => claudeStopGeneration(),
			claudeDeleteSession: async ({ sessionId }) =>
				claudeDeleteSession(sessionId),
			claudeGetSessionMessages: async ({ sessionId }) =>
				claudeGetSessionMessages(sessionId),
			claudeGetAuthStatus: async () => getClaudeAuthStatus(),
			claudeLoginSSO: async () => loginAnthropicSSO(),
			claudeLogoutSSO: async () => logoutAnthropicSSO(),
			claudeSetBedrock: async (config) => setBedrockConfig(config),
			claudeGetBedrock: async () => getBedrockConfig(),
			claudeOpenChat: async ({ sessionId }) => {
				openChatCallback?.(sessionId);
				return true;
			},
		},
	},
});

// Wire the streaming sender so session-manager can push stream events to the renderer
claudeSetSender({
	sendChunk: (sessionId, chunk) =>
		rpc.send.claudeStreamChunk({ sessionId, chunk }),
	sendEnd: (sessionId, result) =>
		rpc.send.claudeStreamEnd({ sessionId, result }),
	sendError: (sessionId, error) =>
		rpc.send.claudeStreamError({ sessionId, error }),
});

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const KNOWN_PLUGIN_IDS = [
	"apps",
	"github",
	"calc",
	"web",
	"claude",
] as const;
export type PluginId = (typeof KNOWN_PLUGIN_IDS)[number];

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

export type ProxyMode = "auto" | "system" | "env" | "none" | "manual";

export type ManualProxyProtocol = "http" | "https";

export interface ManualProxySettings {
	protocol: ManualProxyProtocol;
	host: string;
	port: number;
	username?: string;
	/**
	 * Flag indicando que há uma senha salva no Keychain. A senha em si nunca
	 * aparece em settings.json — é armazenada via `security` CLI (service
	 * `com.ptolomeu.app.proxy`, account `${protocol}://${host}:${port}`).
	 */
	hasPassword: boolean;
	noProxy: string[];
}

export interface ProxySettings {
	mode: ProxyMode;
	manual?: ManualProxySettings;
}

export interface Settings {
	version: 1;
	plugins: {
		enabledOrder: string[];
	};
	github: GitHubSettings;
	analytics: AnalyticsSettings;
	claude: ClaudeSettings;
	proxy: ProxySettings;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
	customFilters: [],
	hasToken: false,
};

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
	consentGiven: false,
	anonymousId: crypto.randomUUID(),
};

export const DEFAULT_CLAUDE_SETTINGS: ClaudeSettings = {
	authMode: "anthropic",
	model: "claude-sonnet-4-6",
	permissionMode: "acceptEdits",
};

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
	mode: "auto",
};

const VALID_AUTH_MODES: readonly ClaudeAuthMode[] = ["anthropic", "bedrock"];
const VALID_PERMISSION_MODES: readonly ClaudePermissionMode[] = [
	"dontAsk",
	"acceptEdits",
	"bypassPermissions",
];
const VALID_PROXY_MODES: readonly ProxyMode[] = [
	"auto",
	"system",
	"env",
	"none",
	"manual",
];

const VALID_MANUAL_PROTOCOLS: readonly ManualProxyProtocol[] = [
	"http",
	"https",
];

function validateManualProxy(value: unknown): ManualProxySettings | null {
	if (!value || typeof value !== "object") return null;
	const m = value as Record<string, unknown>;
	if (
		typeof m.protocol !== "string" ||
		!(VALID_MANUAL_PROTOCOLS as readonly string[]).includes(m.protocol)
	)
		return null;
	if (typeof m.host !== "string") return null;
	const host = m.host.trim();
	if (!host || /\s|\//.test(host)) return null;
	if (
		typeof m.port !== "number" ||
		!Number.isInteger(m.port) ||
		m.port < 1 ||
		m.port > 65535
	)
		return null;
	let username: string | undefined;
	if (m.username !== undefined) {
		if (typeof m.username !== "string" || !m.username) return null;
		username = m.username;
	}
	if (typeof m.hasPassword !== "boolean") return null;
	if (!Array.isArray(m.noProxy)) return null;
	const noProxy: string[] = [];
	for (const entry of m.noProxy) {
		if (typeof entry !== "string") return null;
		noProxy.push(entry);
	}
	return {
		protocol: m.protocol as ManualProxyProtocol,
		host,
		port: m.port,
		username,
		hasPassword: m.hasPassword,
		noProxy,
	};
}

const DEFAULT_SETTINGS: Settings = {
	version: 1,
	plugins: {
		enabledOrder: ["apps", "github", "calc", "web", "claude"],
	},
	github: DEFAULT_GITHUB_SETTINGS,
	analytics: DEFAULT_ANALYTICS_SETTINGS,
	claude: DEFAULT_CLAUDE_SETTINGS,
	proxy: DEFAULT_PROXY_SETTINGS,
};

const MIN_ACTIVE = 1;
const MAX_ACTIVE = 6;
const VALID_BASE_TYPES: readonly GitHubSearchType[] = [
	"repos",
	"code",
	"issues",
	"users",
];

export interface ValidateResult {
	ok: boolean;
	value?: Settings;
}

function isCustomFilter(value: unknown): value is CustomFilter {
	if (!value || typeof value !== "object") return false;
	const f = value as Record<string, unknown>;
	if (typeof f.id !== "string" || !f.id) return false;
	if (typeof f.name !== "string" || !f.name) return false;
	if (f.icon !== undefined && typeof f.icon !== "string") return false;
	if (f.kind === "team-repos") {
		return (
			typeof f.org === "string" &&
			!!f.org &&
			typeof f.team === "string" &&
			!!f.team
		);
	}
	if (f.kind === "search") {
		return (
			typeof f.qualifiers === "string" &&
			typeof f.baseType === "string" &&
			(VALID_BASE_TYPES as readonly string[]).includes(f.baseType)
		);
	}
	return false;
}

function validateGithub(value: unknown): GitHubSettings | null {
	if (value === undefined) return { ...DEFAULT_GITHUB_SETTINGS };
	if (!value || typeof value !== "object") return null;
	const g = value as Record<string, unknown>;
	if (typeof g.hasToken !== "boolean") return null;
	if (!Array.isArray(g.customFilters)) return null;
	const seen = new Set<string>();
	const filters: CustomFilter[] = [];
	for (const f of g.customFilters) {
		if (!isCustomFilter(f)) return null;
		if (seen.has(f.id)) return null;
		seen.add(f.id);
		filters.push(f);
	}
	return { customFilters: filters, hasToken: g.hasToken };
}

export function validateSettings(value: unknown): ValidateResult {
	if (!value || typeof value !== "object") return { ok: false };
	const s = value as Partial<Settings>;
	if (s.version !== 1) return { ok: false };
	if (!s.plugins || typeof s.plugins !== "object") return { ok: false };
	const order = s.plugins.enabledOrder;
	if (!Array.isArray(order)) return { ok: false };
	if (order.length < MIN_ACTIVE || order.length > MAX_ACTIVE)
		return { ok: false };
	const seen = new Set<string>();
	for (const id of order) {
		if (typeof id !== "string") return { ok: false };
		if (!(KNOWN_PLUGIN_IDS as readonly string[]).includes(id))
			return { ok: false };
		if (seen.has(id)) return { ok: false };
		seen.add(id);
	}
	const github = validateGithub((s as Record<string, unknown>).github);
	if (!github) return { ok: false };
	const raw = (s as Record<string, unknown>).analytics;
	let analytics: AnalyticsSettings;
	if (
		raw &&
		typeof raw === "object" &&
		typeof (raw as Record<string, unknown>).consentGiven === "boolean" &&
		typeof (raw as Record<string, unknown>).anonymousId === "string" &&
		(raw as Record<string, unknown>).anonymousId
	) {
		const a = raw as Record<string, unknown>;
		analytics = {
			consentGiven: a.consentGiven as boolean,
			anonymousId: a.anonymousId as string,
		};
	} else {
		analytics = { consentGiven: false, anonymousId: crypto.randomUUID() };
	}
	const rawClaude = (s as Record<string, unknown>).claude;
	let claude: ClaudeSettings;
	if (
		rawClaude &&
		typeof rawClaude === "object" &&
		typeof (rawClaude as Record<string, unknown>).authMode === "string" &&
		(VALID_AUTH_MODES as readonly string[]).includes(
			(rawClaude as Record<string, unknown>).authMode as string,
		) &&
		typeof (rawClaude as Record<string, unknown>).model === "string" &&
		(rawClaude as Record<string, unknown>).model &&
		typeof (rawClaude as Record<string, unknown>).permissionMode === "string" &&
		(VALID_PERMISSION_MODES as readonly string[]).includes(
			(rawClaude as Record<string, unknown>).permissionMode as string,
		)
	) {
		const c = rawClaude as Record<string, unknown>;
		claude = {
			authMode: c.authMode as ClaudeAuthMode,
			model: c.model as string,
			permissionMode: c.permissionMode as ClaudePermissionMode,
		};
	} else {
		claude = { ...DEFAULT_CLAUDE_SETTINGS };
	}
	const rawProxy = (s as Record<string, unknown>).proxy;
	let proxy: ProxySettings;
	if (
		rawProxy &&
		typeof rawProxy === "object" &&
		typeof (rawProxy as Record<string, unknown>).mode === "string" &&
		(VALID_PROXY_MODES as readonly string[]).includes(
			(rawProxy as Record<string, unknown>).mode as string,
		)
	) {
		const mode = (rawProxy as Record<string, unknown>).mode as ProxyMode;
		const rawManual = (rawProxy as Record<string, unknown>).manual;
		const manual =
			rawManual !== undefined ? validateManualProxy(rawManual) : null;
		// Degradação graciosa: mode="manual" sem config válida volta para "auto"
		// em vez de rejeitar o arquivo inteiro.
		if (mode === "manual" && !manual) {
			proxy = { mode: "auto" };
		} else {
			proxy = manual ? { mode, manual } : { mode };
		}
	} else {
		proxy = { ...DEFAULT_PROXY_SETTINGS };
	}
	return {
		ok: true,
		value: {
			version: 1,
			plugins: { enabledOrder: order as string[] },
			github,
			analytics,
			claude,
			proxy,
		},
	};
}

export function getSettingsPath(): string {
	return join(
		homedir(),
		"Library",
		"Application Support",
		"com.ptolomeu.app",
		"settings.json",
	);
}

async function writeDefaults(path: string): Promise<Settings> {
	const defaults = structuredClone(DEFAULT_SETTINGS);
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, JSON.stringify(defaults, null, 2));
	return defaults;
}

export async function loadSettings(): Promise<Settings> {
	const path = getSettingsPath();
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return writeDefaults(path);
	}
	try {
		const parsed = JSON.parse(await file.text());
		const result = validateSettings(parsed);
		if (!result.ok || !result.value) {
			return writeDefaults(path);
		}
		return result.value;
	} catch {
		return writeDefaults(path);
	}
}

export async function saveSettings(next: Settings): Promise<boolean> {
	const result = validateSettings(next);
	if (!result.ok) return false;
	const path = getSettingsPath();
	try {
		await mkdir(dirname(path), { recursive: true });
		await Bun.write(path, JSON.stringify(result.value, null, 2));
		return true;
	} catch {
		return false;
	}
}

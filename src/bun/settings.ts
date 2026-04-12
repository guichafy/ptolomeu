import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const KNOWN_PLUGIN_IDS = ["apps", "github", "calc", "web", "claude"] as const;
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

export interface Settings {
	version: 1;
	plugins: {
		enabledOrder: string[];
	};
	github: GitHubSettings;
	analytics: AnalyticsSettings;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
	customFilters: [],
	hasToken: false,
};

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
	consentGiven: false,
	anonymousId: crypto.randomUUID(),
};

const DEFAULT_SETTINGS: Settings = {
	version: 1,
	plugins: {
		enabledOrder: ["apps", "github", "calc", "web", "claude"],
	},
	github: DEFAULT_GITHUB_SETTINGS,
	analytics: DEFAULT_ANALYTICS_SETTINGS,
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
	return {
		ok: true,
		value: {
			version: 1,
			plugins: { enabledOrder: order as string[] },
			github,
			analytics,
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

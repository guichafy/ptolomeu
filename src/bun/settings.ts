import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const KNOWN_PLUGIN_IDS = ["apps", "github", "calc", "web"] as const;
export type PluginId = (typeof KNOWN_PLUGIN_IDS)[number];

export interface Settings {
	version: 1;
	plugins: {
		enabledOrder: string[];
	};
}

const DEFAULT_SETTINGS: Settings = {
	version: 1,
	plugins: {
		enabledOrder: ["apps", "github", "calc", "web"],
	},
};

const MIN_ACTIVE = 1;
const MAX_ACTIVE = 5;

export function getSettingsPath(): string {
	return join(
		homedir(),
		"Library",
		"Application Support",
		"com.ptolomeu.app",
		"settings.json",
	);
}

function isValidSettings(value: unknown): value is Settings {
	if (!value || typeof value !== "object") return false;
	const s = value as Partial<Settings>;
	if (s.version !== 1) return false;
	if (!s.plugins || typeof s.plugins !== "object") return false;
	const order = s.plugins.enabledOrder;
	if (!Array.isArray(order)) return false;
	if (order.length < MIN_ACTIVE || order.length > MAX_ACTIVE) return false;
	const seen = new Set<string>();
	for (const id of order) {
		if (typeof id !== "string") return false;
		if (!(KNOWN_PLUGIN_IDS as readonly string[]).includes(id)) return false;
		if (seen.has(id)) return false;
		seen.add(id);
	}
	return true;
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
		if (!isValidSettings(parsed)) {
			return writeDefaults(path);
		}
		return parsed;
	} catch {
		return writeDefaults(path);
	}
}

export async function saveSettings(next: Settings): Promise<boolean> {
	if (!isValidSettings(next)) return false;
	const path = getSettingsPath();
	try {
		await mkdir(dirname(path), { recursive: true });
		await Bun.write(path, JSON.stringify(next, null, 2));
		return true;
	} catch {
		return false;
	}
}

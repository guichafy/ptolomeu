import { readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineElectrobunRPC, type ElectrobunRPCSchema } from "electrobun/bun";
import {
	loadSettings as loadSettingsFromDisk,
	type Settings,
	saveSettings as saveSettingsToDisk,
} from "./settings";

export interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
	bun: {
		requests: {
			listApps: { params: void; response: { name: string; path: string }[] };
			openApp: { params: { path: string }; response: boolean };
			getAppIcon: {
				params: { path: string };
				response: { icon: string | null };
			};
			resizeWindow: { params: { height: number }; response: boolean };
			loadSettings: { params: void; response: Settings };
			saveSettings: { params: Settings; response: boolean };
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {
			openPreferences: void;
		};
	};
}

// Window reference for resize handler (set from index.ts)
let mainWindowRef: { setSize: (w: number, h: number) => void } | null = null;
export function setMainWindow(win: {
	setSize: (w: number, h: number) => void;
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
			getAppIcon: async ({ path }) => {
				const icon = await getAppIconBase64(path);
				return { icon };
			},
			resizeWindow: async ({ height }) => {
				if (mainWindowRef) {
					mainWindowRef.setSize(630, height);
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
		},
	},
});

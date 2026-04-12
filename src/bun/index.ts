import { dlopen, FFIType } from "bun:ffi";
import { join } from "node:path";
import {
	ApplicationMenu,
	BrowserWindow,
	Tray,
	Updater,
	Utils,
} from "electrobun/bun";
import { initAnalytics, shutdownAnalytics, trackEvent } from "./analytics";
import { rpc, setMainWindow, setOpenChatCallback } from "./rpc";
import { loadSettings } from "./settings";

// Load native helper for window overlay on fullscreen
// import.meta.dir points to Resources/app/bun/ in the bundle
// The dylib is copied to Resources/app/native/ via electrobun.config.ts
const dylibPath = join(import.meta.dir, "..", "native", "liboverlay.dylib");
const overlaySymbols = {
	makeWindowOverlay: {
		args: [FFIType.ptr],
		returns: FFIType.void,
	},
	registerHotkey: {
		args: [FFIType.ptr],
		returns: FFIType.void,
	},
	quitApp: {
		args: [],
		returns: FFIType.void,
	},
} as const;

let overlayLib: ReturnType<typeof dlopen<typeof overlaySymbols>>;
try {
	overlayLib = dlopen(dylibPath, overlaySymbols);
} catch (e) {
	console.error("Failed to load liboverlay.dylib:", e);
	process.exit(1);
}

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const CHAT_DEV_SERVER_PORT = 5174;
const CHAT_DEV_SERVER_URL = `http://localhost:${CHAT_DEV_SERVER_PORT}`;

// Wait for a Vite dev server to be fully ready, including dependency pre-bundling.
// Vite responds to HTML requests immediately but may still be optimizing deps in the
// background. Fetching the entry point script forces Vite to finish optimization
// before responding, ensuring the page won't hit missing modules on first load.
async function waitForDevServer(
	url: string,
	maxAttempts = 30,
	delayMs = 500,
): Promise<boolean> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(2000),
			});
			if (response.ok) {
				const html = await response.text();
				if (!html.includes('type="module"')) {
					await Bun.sleep(delayMs);
					continue;
				}
				// Extract the entry point script from HTML and fetch it to ensure
				// Vite has finished dependency pre-bundling
				const entryMatch = html.match(/src="([^"]+\.(tsx?|jsx?))"/);
				if (entryMatch) {
					const entryUrl = new URL(entryMatch[1], url).href;
					const entryResponse = await fetch(entryUrl, {
						signal: AbortSignal.timeout(15000),
					});
					if (!entryResponse.ok) {
						await Bun.sleep(delayMs);
						continue;
					}
				}
				return true;
			}
		} catch {
			// Dev server not ready yet
		}
		await Bun.sleep(delayMs);
	}
	return false;
}

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		const ready = await waitForDevServer(DEV_SERVER_URL);
		if (ready) {
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		}
		console.log(
			"Vite dev server not available. Using bundled assets.",
		);
	}
	return "views://mainview/index.html";
}

// Check if Vite chat dev server is running for HMR
async function getChatViewUrl(sessionId?: string): Promise<string> {
	const channel = await Updater.localInfo.channel();
	const params = sessionId ? `?sessionId=${sessionId}` : "";
	if (channel === "dev") {
		const ready = await waitForDevServer(CHAT_DEV_SERVER_URL);
		if (ready) {
			console.log(
				`HMR enabled: Using Vite chat dev server at ${CHAT_DEV_SERVER_URL}`,
			);
			return `${CHAT_DEV_SERVER_URL}${params}`;
		}
		console.log("Vite chat dev server not available, using bundled assets.");
	}
	return `views://chatview/index.html${params}`;
}

// Chat window — lazy, created on first open
let chatWindow: InstanceType<typeof BrowserWindow> | null = null;

async function openChatWindow(sessionId?: string) {
	const url = await getChatViewUrl(sessionId);

	if (chatWindow) {
		// Window already exists — just show it
		try {
			chatWindow.show();
			return;
		} catch {
			chatWindow = null;
		}
	}

	chatWindow = new BrowserWindow({
		title: "Ptolomeu — Chat",
		url,
		hidden: false,
		titleBarStyle: "default",
		styleMask: {
			Borderless: false,
			Titled: true,
			Closable: true,
			Miniaturizable: false,
			Resizable: true,
		},
		frame: {
			width: 800,
			height: 600,
			x: 300,
			y: 150,
		},
		rpc,
	});
}

// Hide dock icon — app runs as a menu bar agent
Utils.setDockIconVisible(false);

// Install application menu so macOS routes standard text-editing shortcuts
// (Cmd+A/C/V/X/Z) to focused inputs via NSMenu key equivalents. Even with the
// dock icon hidden, NSApp.mainMenu still participates in the responder chain.
ApplicationMenu.setApplicationMenu([
	{
		label: "Ptolomeu",
		submenu: [],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo", accelerator: "CommandOrControl+Z" },
			{ role: "redo", accelerator: "CommandOrControl+Shift+Z" },
			{ type: "separator" },
			{ role: "cut", accelerator: "CommandOrControl+X" },
			{ role: "copy", accelerator: "CommandOrControl+C" },
			{ role: "paste", accelerator: "CommandOrControl+V" },
			{
				role: "pasteAndMatchStyle",
				accelerator: "CommandOrControl+Shift+Option+V",
			},
			{ role: "delete" },
			{ role: "selectAll", accelerator: "CommandOrControl+A" },
		],
	},
]);

// Create the main application window (hidden)
const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "Ptolomeu",
	url,
	hidden: true,
	titleBarStyle: "hidden",
	styleMask: {
		Borderless: true,
		Titled: false,
		Closable: false,
		Miniaturizable: false,
		Resizable: false,
	},
	frame: {
		width: 630,
		height: 120,
		x: 200,
		y: 200,
	},
	rpc,
});

setMainWindow(mainWindow);
setOpenChatCallback((sessionId) => openChatWindow(sessionId));

// Initialize analytics (respects user consent)
const settings = await loadSettings();
initAnalytics(settings.analytics);
trackEvent("app_launched", { version: "1.2.0" });

// Create system tray with app icon
const trayIconPath = join(import.meta.dir, "..", "native", "tray-icon.png");
const tray = new Tray({
	title: "Ptolomeu",
	image: trayIconPath,
	template: false,
	width: 22,
	height: 22,
});

tray.setMenu([
	{ type: "normal", label: "Abrir", action: "open-window" },
	{ type: "normal", label: "Preferências...", action: "open-preferences" },
	{ type: "separator" },
	{ type: "normal", label: "Sair", action: "quit" },
]);

tray.on("tray-clicked", (event: any) => {
	const action = event.data?.action;

	if (action === "open-window") {
		overlayLib.symbols.makeWindowOverlay(mainWindow.ptr);
	} else if (action === "open-preferences") {
		overlayLib.symbols.makeWindowOverlay(mainWindow.ptr);
		rpc.send.openPreferences({});
	} else if (action === "quit") {
		trackEvent("app_quit");
		shutdownAnalytics().finally(() => {
			tray.remove();
			overlayLib.symbols.quitApp();
		});
	}
});

// Register global hotkey (Command+Shift+Space) via Carbon API in native code
overlayLib.symbols.registerHotkey(mainWindow.ptr);

console.log("System tray app started!");

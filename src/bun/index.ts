import { dlopen, FFIType } from "bun:ffi";
import { join } from "node:path";
import { ApplicationMenu, BrowserWindow, Tray, Utils } from "electrobun/bun";
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

// Chat window — lazy, created on first open
let chatWindow: InstanceType<typeof BrowserWindow> | null = null;

function openChatWindow(sessionId?: string) {
	console.log(
		`[main] openChatWindow: sessionId=${sessionId ?? "null"} hasWindow=${chatWindow !== null}`,
	);

	if (chatWindow) {
		// Window already exists — send sessionId via RPC and show it
		try {
			if (sessionId) {
				console.log(
					`[main] openChatWindow: reusing window, sending openSession sessionId=${sessionId}`,
				);
				rpc.send.claudeOpenSession({ sessionId });
			}
			chatWindow.show();
			return;
		} catch (err) {
			console.error(
				"[main] openChatWindow: reuse failed, recreating window:",
				err,
			);
			chatWindow = null;
		}
	}

	console.log("[main] openChatWindow: creating new chat window");
	chatWindow = new BrowserWindow({
		title: "Ptolomeu — Chat",
		url: "views://chatview/index.html",
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

	// Electrobun removes the window from its internal map on close, but our
	// reference here would remain stale — causing the next open to take the
	// "reuse" branch and silently fail. Clear the ref so we recreate.
	chatWindow.on("close", () => {
		console.log("[main] chatWindow closed, clearing reference");
		chatWindow = null;
	});

	// Send sessionId via RPC after window is created
	if (sessionId) {
		setTimeout(() => {
			console.log(
				`[main] openChatWindow: sending openSession to new window sessionId=${sessionId}`,
			);
			rpc.send.claudeOpenSession({ sessionId });
		}, 500);
	}
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
const url = "views://mainview/index.html";

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

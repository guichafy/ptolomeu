import { BrowserWindow, Tray, Utils, Updater } from "electrobun/bun";
import { dlopen, FFIType } from "bun:ffi";
import { join } from "path";

// Load native helper for window overlay on fullscreen
// import.meta.dir points to Resources/app/bun/ in the bundle
// The dylib is copied to Resources/app/native/ via electrobun.config.ts
const dylibPath = join(import.meta.dir, "..", "native", "liboverlay.dylib");
const overlaySymbols = {
	makeWindowOverlay: {
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

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

// Hide dock icon — app runs as a menu bar agent
Utils.setDockIconVisible(false);

// Create the main application window (hidden)
const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "React + Tailwind + Vite",
	url,
	hidden: true,
	frame: {
		width: 630,
		height: 260,
		x: 200,
		y: 200,
	},
});

// Create system tray
const tray = new Tray({ title: "MyApp", template: true });

tray.setMenu([
	{ type: "normal", label: "Abrir", action: "open-window" },
	{ type: "separator" },
	{ type: "normal", label: "Sair", action: "quit" },
]);

tray.on("tray-clicked", (event: any) => {
	const action = event.data?.action;

	if (action === "open-window") {
		overlayLib.symbols.makeWindowOverlay(mainWindow.ptr);
	} else if (action === "quit") {
		tray.remove();
		overlayLib.symbols.quitApp();
	}
});

console.log("System tray app started!");

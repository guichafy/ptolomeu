import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

export const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, "docs", "screenshots");

export const APP_PATH = path.join(
	PROJECT_ROOT,
	"build",
	"dev-macos-arm64",
	"ptolomeu-dev.app",
);

export const APPIUM_HOST = "127.0.0.1";
export const APPIUM_PORT = 4723;

export const BUNDLE_ID = "com.ptolomeu.app";

export const ModifierFlag = {
	SHIFT: 1 << 17,
	CONTROL: 1 << 18,
	OPTION: 1 << 19,
	COMMAND: 1 << 20,
} as const;

// macOS virtual key codes for special keys. appium-mac2-driver's `macos: keys`
// extension types the Selenium Keys strings ( etc.) as Unicode
// characters into the field instead of emitting the keystroke, so Tab/Enter/
// Escape must go through `virtualKeyCode` to reach the app as real events.
export const VKey = {
	TAB: 48,
	ENTER: 36,
	ESCAPE: 53,
	BACKSPACE: 51,
} as const;

export const Timing = {
	APPIUM_STARTUP: 30_000,
	APP_STARTUP: 2_000,
	SETTLE_LOCAL: 1_000,
	SETTLE_NETWORK: 8_000,
	POST_TAB: 500,
} as const;

// Providers cycled by Tab, in the default `enabledOrder`. Tests use these
// indices to navigate deterministically between screenshots.
export const Providers = ["apps", "github", "calc", "web", "claude"] as const;
export type ProviderId = (typeof Providers)[number];

export const Screenshots = {
	INITIAL: "estado-inicial.png",
	GITHUB: "busca-github.png",
	CALCULATOR: "calculadora.png",
	APPS: "busca-apps.png",
} as const;

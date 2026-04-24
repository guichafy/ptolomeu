import { type ChildProcess, execSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { remote } from "webdriverio";
import {
	APP_PATH,
	APPIUM_HOST,
	APPIUM_PORT,
	BUNDLE_ID,
	ModifierFlag,
	SCREENSHOTS_DIR,
	Timing,
	VKey,
} from "./constants";

export async function startAppiumServer(): Promise<ChildProcess> {
	const appiumBin = path.resolve(
		process.cwd(),
		"node_modules",
		".bin",
		"appium",
	);

	const proc = spawn(
		appiumBin,
		[
			"--address",
			APPIUM_HOST,
			"--port",
			String(APPIUM_PORT),
			"--log-level",
			"warn",
		],
		{
			stdio: ["ignore", "pipe", "pipe"],
			detached: false,
		},
	);

	await waitForAppium(proc, Timing.APPIUM_STARTUP);
	return proc;
}

async function waitForAppium(
	proc: ChildProcess,
	timeoutMs: number,
): Promise<void> {
	const url = `http://${APPIUM_HOST}:${APPIUM_PORT}/status`;
	const deadline = Date.now() + timeoutMs;
	const interval = 500;

	while (Date.now() < deadline) {
		if (proc.exitCode !== null) {
			throw new Error(`Appium process exited with code ${proc.exitCode}`);
		}
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// Server not ready yet
		}
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(`Appium server did not start within ${timeoutMs}ms`);
}

export function stopAppiumServer(proc: ChildProcess): void {
	if (proc && !proc.killed) {
		proc.kill("SIGTERM");
	}
}

export async function createDriver() {
	return await remote({
		hostname: APPIUM_HOST,
		port: APPIUM_PORT,
		path: "/",
		capabilities: {
			platformName: "mac",
			"appium:automationName": "mac2",
			"appium:bundleId": BUNDLE_ID,
			"appium:appPath": APP_PATH,
			"appium:noReset": true,
			"appium:skipAppKill": false,
			"appium:newCommandTimeout": 120,
		} as Record<string, unknown>,
		logLevel: "warn",
	});
}

export async function typeText(
	driver: WebdriverIO.Browser,
	text: string,
): Promise<void> {
	const keys = text.split("").map((char) => ({ key: char }));
	await driver.executeScript("macos: keys", [{ keys }]);
}

async function sendVirtualKey(
	driver: WebdriverIO.Browser,
	virtualKeyCode: number,
	modifierFlags?: number,
): Promise<void> {
	const keyObj: { virtualKeyCode: number; modifierFlags?: number } = {
		virtualKeyCode,
	};
	if (modifierFlags !== undefined) {
		keyObj.modifierFlags = modifierFlags;
	}
	await driver.executeScript("macos: keys", [{ keys: [keyObj] }]);
}

export async function pressTab(driver: WebdriverIO.Browser): Promise<void> {
	await sendVirtualKey(driver, VKey.TAB);
}

export async function pressEnter(driver: WebdriverIO.Browser): Promise<void> {
	await sendVirtualKey(driver, VKey.ENTER);
}

export async function pressEscape(driver: WebdriverIO.Browser): Promise<void> {
	await sendVirtualKey(driver, VKey.ESCAPE);
}

/**
 * Select all (Cmd+A) + Backspace. Leaves the input empty without changing
 * which provider tab is active.
 */
export async function clearInput(driver: WebdriverIO.Browser): Promise<void> {
	await driver.executeScript("macos: keys", [
		{
			keys: [{ key: "a", modifierFlags: ModifierFlag.COMMAND }],
		},
	]);
	await sendVirtualKey(driver, VKey.BACKSPACE);
}

/**
 * Cycle the provider selector forward until `targetIndex` is active. Caller
 * is responsible for tracking `currentIndex`. Cycles through a known-size
 * provider list (`Providers.length` in constants.ts).
 */
export async function tabToProvider(
	driver: WebdriverIO.Browser,
	currentIndex: number,
	targetIndex: number,
	providerCount: number,
): Promise<void> {
	const distance = (targetIndex - currentIndex + providerCount) % providerCount;
	for (let i = 0; i < distance; i++) {
		await pressTab(driver);
		await new Promise((r) => setTimeout(r, Timing.POST_TAB));
	}
}

let swiftHelperPath: string | null = null;

export function compileSwiftHelper(): string {
	if (swiftHelperPath) return swiftHelperPath;

	const srcPath = path.join(SCREENSHOTS_DIR, ".helper.swift");
	const binPath = path.join(SCREENSHOTS_DIR, ".helper");

	const src = `
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count > 1 else { exit(1) }

switch args[1] {
case "activate":
    let down = CGEvent(keyboardEventSource: nil, virtualKey: 49, keyDown: true)!
    down.flags = [.maskCommand, .maskShift]
    down.post(tap: .cghidEventTap)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: 49, keyDown: false)!
    up.flags = [.maskCommand, .maskShift]
    up.post(tap: .cghidEventTap)

case "bounds":
    let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String:Any]] ?? []
    for w in list {
        if (w["kCGWindowOwnerName"] as? String) == "ptolomeu-dev",
           (w["kCGWindowName"] as? String) == "Ptolomeu",
           let b = w["kCGWindowBounds"] as? [String:Any] {
            let x = b["X"] as? Int ?? 0
            let y = b["Y"] as? Int ?? 0
            let w = b["Width"] as? Int ?? 0
            let h = b["Height"] as? Int ?? 0
            print("\\(x),\\(y),\\(w),\\(h)")
            break
        }
    }

case "crop":
    guard args.count >= 5 else { exit(1) }
    let inputPath = args[2]
    let outputPath = args[3]
    let parts = args[4].split(separator: ",").compactMap { Int($0) }
    let scale = args.count > 5 ? (Int(args[5]) ?? 2) : 2
    guard parts.count == 4 else { exit(1) }

    let url = URL(fileURLWithPath: inputPath)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fputs("Falha ao ler imagem\\n", stderr); exit(1)
    }

    let rect = CGRect(
        x: parts[0] * scale, y: parts[1] * scale,
        width: parts[2] * scale, height: parts[3] * scale
    )
    guard let cropped = image.cropping(to: rect) else {
        fputs("Falha ao cortar imagem\\n", stderr); exit(1)
    }

    let outUrl = URL(fileURLWithPath: outputPath)
    guard let dest = CGImageDestinationCreateWithURL(
        outUrl as CFURL, UTType.png.identifier as CFString, 1, nil
    ) else { exit(1) }
    CGImageDestinationAddImage(dest, cropped, nil)
    CGImageDestinationFinalize(dest)

default:
    break
}
`;

	execSync(`mkdir -p "${SCREENSHOTS_DIR}"`);
	writeFileSync(srcPath, src);
	execSync(`swiftc -O -o "${binPath}" "${srcPath}"`, {
		timeout: 30_000,
	});

	swiftHelperPath = binPath;
	return binPath;
}

export function activateWindow(): void {
	const bin = compileSwiftHelper();
	execSync(`"${bin}" activate`);
}

export async function saveScreenshot(
	driver: WebdriverIO.Browser,
	filename: string,
): Promise<string> {
	const filePath = path.join(SCREENSHOTS_DIR, filename);
	await driver.saveScreenshot(filePath);
	return filePath;
}

export function wait(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

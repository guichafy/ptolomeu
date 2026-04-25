/**
 * E2E screenshot spec for the in-conversation model selector.
 *
 * Status: SCAFFOLD. The existing E2E suite (`test/e2e/screenshots.test.ts`)
 * covers the command palette only — there is no chat-window automation
 * infrastructure yet. This file lays out the test cases and is intended to
 * be filled in once: (a) the local Xcode dependency is unblocked, and
 * (b) `helpers/appium.ts` gains chat-window helpers (open by clicking a
 * Claude session, query the chat header, click the model selector trigger).
 *
 * Until then, the human verification path is documented in
 * `docs/plans/2026-04-25-chat-model-selector.md` (Task 5.6).
 *
 * How to open the chat window via the palette (for when this is fleshed out):
 *   1. Tab to the "claude" provider (index 4 in Providers).
 *   2. Type any non-empty string — the provider returns a single result:
 *      title=<query>, subtitle="Iniciar nova sessão" (src/mainview/providers/claude-provider.ts).
 *   3. Press Enter — `claudeCreateSession` is called and the backend
 *      auto-opens the chat window (no separate claudeOpenChat needed).
 *   4. Wait for the chat window to appear and its header to show the model
 *      badge (e.g. "claude-sonnet-4-5" or similar dynamic label).
 *   5. Locate the model selector trigger button and click it to open the
 *      popover, then snapshot the list of available models.
 *
 * Rerun `bun run screenshots` to regenerate `docs/screenshots/` once the
 * chat-window helpers are in place.
 */
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
	createDriver,
	startAppiumServer,
	stopAppiumServer,
	wait,
} from "./helpers/appium";
import { Timing } from "./helpers/constants";

describe.skip("Chat — Model selector", () => {
	let appiumProcess: ChildProcess;
	let driver: WebdriverIO.Browser;

	beforeAll(async () => {
		appiumProcess = await startAppiumServer();
		driver = await createDriver();
		await wait(Timing.APP_STARTUP);
		// TODO: call activateWindow() once helpers expose it cleanly from here,
		// or import it directly:
		//   import { activateWindow } from "./helpers/appium";
		//   activateWindow();
		await wait(Timing.SETTLE_LOCAL);
	});

	afterAll(async () => {
		if (driver) {
			try {
				await driver.deleteSession();
			} catch {
				/* already closed */
			}
		}
		if (appiumProcess) stopAppiumServer(appiumProcess);
	});

	it.todo(
		// Steps:
		//   1. tabToProvider(driver, 0, Providers.indexOf("claude"), Providers.length)
		//   2. typeText(driver, "hello") — any non-empty prompt
		//   3. pressEnter(driver) — triggers claudeCreateSession + auto-opens chat window
		//   4. wait(Timing.SETTLE_NETWORK) — let session init and window render
		//   5. waitForResults(driver, ["claude-"], Timing.RESULTS_WAIT, Timing.RESULTS_POLL)
		//      — poll until a model id token appears in the accessibility tree
		//      (exact substring TBD after introspecting the chat header a11y tree)
		//   6. saveScreenshot(driver, "chat-model-badge.png")
		"opens chat from palette and snapshots the dynamic header model badge",
	);

	it.todo(
		// Steps (continuing from the state left by the previous test, or
		// re-opening the chat window if tests are fully isolated):
		//   1. Locate the model selector trigger element. Two candidate strategies:
		//      a. driver.$('~ModelSelectorTrigger')  — if accessibilityIdentifier is set
		//      b. driver.$('//XCUIElementTypeButton[contains(@label,"claude-")]')
		//      (exact query TBD after running `getPageSource` against the live tree)
		//   2. await trigger.click()
		//   3. waitForResults(driver, ["claude-opus", "claude-sonnet", "claude-haiku"],
		//        Timing.SETTLE_LOCAL, Timing.RESULTS_POLL)
		//      — at least one model family name should be visible in the popover
		//   4. saveScreenshot(driver, "chat-model-selector-popover.png")
		"opens the model selector popover and snapshots the list",
	);
});

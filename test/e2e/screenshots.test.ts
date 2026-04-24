import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
	activateWindow,
	clearInput,
	createDriver,
	pressEscape,
	saveScreenshot,
	startAppiumServer,
	stopAppiumServer,
	tabToProvider,
	typeText,
	wait,
} from "./helpers/appium";
import { Providers, Screenshots, Timing } from "./helpers/constants";

/**
 * End-to-end smoke tests that double as screenshot generators for docs.
 *
 * Each test is independent: before every case we clear the input and cycle
 * the provider selector back to "apps" so no state leaks between runs.
 * Previously tests chained state through `pressTab` without clearing, which
 * accumulated typed text and left every screenshot on the wrong provider.
 */
describe("Ptolomeu Screenshots", () => {
	let appiumProcess: ChildProcess;
	let driver: WebdriverIO.Browser;

	// We only know the starting provider index (0 = apps) on first run.
	// Each test that navigates must update this so the next `beforeEach`
	// can rotate back without guessing.
	let currentProviderIndex = 0;

	beforeAll(async () => {
		appiumProcess = await startAppiumServer();
		driver = await createDriver();
		await wait(Timing.APP_STARTUP);

		activateWindow();
		await wait(Timing.SETTLE_LOCAL);
	});

	afterAll(async () => {
		if (driver) {
			try {
				await driver.deleteSession();
			} catch {
				// Sessão já pode ter sido fechada
			}
		}
		if (appiumProcess) {
			stopAppiumServer(appiumProcess);
		}
	});

	beforeEach(async () => {
		// Ensure every test starts with an empty input on the Apps provider.
		await pressEscape(driver);
		await wait(Timing.POST_TAB);
		await clearInput(driver);
		await tabToProvider(driver, currentProviderIndex, 0, Providers.length);
		currentProviderIndex = 0;
		await wait(Timing.SETTLE_LOCAL);
	});

	it("Screenshot 1: Estado inicial — command palette vazia", async () => {
		const filePath = await saveScreenshot(driver, Screenshots.INITIAL);
		console.log(`Salvo: ${filePath}`);
	});

	it("Screenshot 2: Busca GitHub — resultados de busca", async () => {
		const githubIndex = Providers.indexOf("github");
		await tabToProvider(
			driver,
			currentProviderIndex,
			githubIndex,
			Providers.length,
		);
		currentProviderIndex = githubIndex;

		await typeText(driver, "bun");
		// Don't press Enter — that opens the first result's URL in Safari,
		// which in CI triggers network I/O and flakes the run.
		await wait(Timing.SETTLE_NETWORK);

		const filePath = await saveScreenshot(driver, Screenshots.GITHUB);
		console.log(`Salvo: ${filePath}`);
	});

	it("Screenshot 3: Calculadora — expressão com resultado", async () => {
		const calcIndex = Providers.indexOf("calc");
		await tabToProvider(
			driver,
			currentProviderIndex,
			calcIndex,
			Providers.length,
		);
		currentProviderIndex = calcIndex;

		await typeText(driver, "245 * 3 + 17");
		await wait(Timing.SETTLE_LOCAL);

		const filePath = await saveScreenshot(driver, Screenshots.CALCULATOR);
		console.log(`Salvo: ${filePath}`);
	});

	it("Screenshot 4: Busca de apps — apps locais encontrados", async () => {
		// beforeEach already left us on the Apps provider, no Tab needed.
		await typeText(driver, "Safari");
		await wait(Timing.SETTLE_LOCAL);

		const filePath = await saveScreenshot(driver, Screenshots.APPS);
		console.log(`Salvo: ${filePath}`);
	});
});

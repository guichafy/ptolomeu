import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
	activateWindow,
	createDriver,
	pressEnter,
	pressEscape,
	pressTab,
	saveScreenshot,
	startAppiumServer,
	stopAppiumServer,
	typeText,
	wait,
} from "./helpers/appium";
import { Screenshots, Timing } from "./helpers/constants";

describe("Ptolomeu Screenshots", () => {
	let appiumProcess: ChildProcess;
	let driver: WebdriverIO.Browser;

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

	it("Screenshot 1: Estado inicial — command palette vazia", async () => {
		await wait(Timing.SETTLE_LOCAL);
		const filePath = await saveScreenshot(driver, Screenshots.INITIAL);
		console.log(`Salvo: ${filePath}`);
	});

	it("Screenshot 2: Busca GitHub — resultados de busca", async () => {
		await pressTab(driver);
		await wait(Timing.POST_TAB);

		await typeText(driver, "bun");
		await pressEnter(driver);
		await wait(Timing.SETTLE_NETWORK);

		const filePath = await saveScreenshot(driver, Screenshots.GITHUB);
		console.log(`Salvo: ${filePath}`);

		await pressEscape(driver);
		await wait(Timing.SETTLE_LOCAL);
	});

	it("Screenshot 3: Calculadora — expressão com resultado", async () => {
		await pressTab(driver);
		await wait(Timing.POST_TAB);

		await typeText(driver, "245 * 3 + 17");
		await wait(Timing.SETTLE_LOCAL);

		const filePath = await saveScreenshot(driver, Screenshots.CALCULATOR);
		console.log(`Salvo: ${filePath}`);

		await pressEscape(driver);
		await wait(Timing.SETTLE_LOCAL);
	});

	it("Screenshot 4: Busca de apps — apps locais encontrados", async () => {
		await pressTab(driver);
		await wait(Timing.POST_TAB);
		await pressTab(driver);
		await wait(Timing.POST_TAB);

		await typeText(driver, "Safari");
		await wait(Timing.SETTLE_LOCAL);

		const filePath = await saveScreenshot(driver, Screenshots.APPS);
		console.log(`Salvo: ${filePath}`);
	});
});

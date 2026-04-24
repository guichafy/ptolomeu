/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 120_000,
		// beforeAll does: start Appium (~30s cap), open WDIO session (launches
		// the .app via XCUITest, often 30-60s cold on CI), warm-up waits. Give
		// it plenty of runway so CI flakes don't kill us at 60s.
		hookTimeout: 180_000,
		fileParallelism: false,
	},
});

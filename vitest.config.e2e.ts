/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 120_000,
		hookTimeout: 60_000,
		fileParallelism: false,
	},
});

/// <reference types="vitest" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), react()],
	root: "src/mainview",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
		minify: mode !== "development",
		sourcemap: mode === "development",
	},
	server: {
		port: 5173,
		strictPort: true,
	},
	test: {
		globals: true,
		environment: "node",
		root: ".",
		include: ["src/**/*.test.ts"],
	},
}));

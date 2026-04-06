import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
	plugins: [react()],
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
}));

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
		emptyOutDir: mode !== "development",
		minify: mode !== "development",
		sourcemap: mode === "development",
		chunkSizeWarningLimit: 700,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;
					if (id.includes("@radix-ui")) return "vendor-radix";
					if (id.includes("@dnd-kit")) return "vendor-dnd";
					if (id.includes("cmdk")) return "vendor-cmdk";
					if (id.includes("posthog-js")) return "vendor-posthog";
					if (
						id.includes("/react-dom/") ||
						id.includes("/react/") ||
						id.includes("/scheduler/")
					) {
						return "vendor-react";
					}
				},
			},
		},
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom/client",
			"react/jsx-runtime",
			"cmdk",
			"lucide-react",
			"clsx",
			"tailwind-merge",
			"class-variance-authority",
			"posthog-js/dist/module.full.no-external",
			"@radix-ui/react-dialog",
			"@radix-ui/react-popover",
			"@radix-ui/react-scroll-area",
			"@radix-ui/react-select",
			"@radix-ui/react-separator",
			"@radix-ui/react-slot",
			"@radix-ui/react-switch",
			"@dnd-kit/core",
			"@dnd-kit/sortable",
			"@dnd-kit/utilities",
		],
		noDiscovery: true,
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

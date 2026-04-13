import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), react()],
	root: "src/chatview",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "../../dist-chat",
		emptyOutDir: mode !== "development",
		minify: mode !== "development",
		sourcemap: mode === "development",
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom/client",
			"react/jsx-runtime",
			"react-markdown",
			"react-syntax-highlighter",
			"react-syntax-highlighter/dist/esm/styles/prism",
			"lucide-react",
			"clsx",
			"tailwind-merge",
			"class-variance-authority",
			"@radix-ui/react-collapsible",
			"@radix-ui/react-scroll-area",
			"@radix-ui/react-separator",
			"@radix-ui/react-slot",
			"@radix-ui/react-tooltip",
		],
		noDiscovery: true,
	},
	server: {
		port: 5174,
		strictPort: true,
	},
}));

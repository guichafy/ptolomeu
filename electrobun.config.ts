import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "ptolomeu",
		identifier: "com.ptolomeu.app",
		version: "1.2.0",
	},
	runtime: {
		exitOnLastWindowClosed: false,
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"src/bun/native/liboverlay.dylib": "native/liboverlay.dylib",
			"src/bun/tray-icon.png": "native/tray-icon.png",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			icons: "ptolomeu.iconset",
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;

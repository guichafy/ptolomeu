import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "ptolomeu",
		identifier: "com.ptolomeu.app",
		version: "0.0.1",
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
			"icone.png": "views/icone.png",
			"splash.png": "views/splash.png",
			"src/mainview/splash.html": "views/splash.html",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;

import { AppWindow } from "lucide-react";
import { createElement, useEffect, useState } from "react";
import { rpc } from "./rpc";
import type { SearchProvider, SearchResult } from "./types";

function AppIcon({ appPath }: { appPath: string }) {
	const [src, setSrc] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		rpc.request
			.getAppIcon({ path: appPath })
			.then(({ icon }) => {
				if (!cancelled && icon) {
					setSrc(`data:image/png;base64,${icon}`);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [appPath]);

	if (!src) {
		return createElement(AppWindow, {
			className: "h-5 w-5 text-muted-foreground",
		});
	}
	return createElement("img", { src, className: "h-5 w-5 rounded", alt: "" });
}

type AppEntry = { name: string; path: string };

// Apps list is cached for the palette session so typing filters synchronously
// over a stable array instead of racing one RPC per keystroke.
let cachedApps: AppEntry[] | null = null;
let inFlightLoad: Promise<AppEntry[]> | null = null;

function loadApps(): Promise<AppEntry[]> {
	if (cachedApps) return Promise.resolve(cachedApps);
	if (inFlightLoad) return inFlightLoad;
	inFlightLoad = rpc.request
		.listApps()
		.then((apps) => {
			cachedApps = apps;
			return apps;
		})
		.finally(() => {
			inFlightLoad = null;
		});
	return inFlightLoad;
}

function appToResult(app: AppEntry): SearchResult {
	return {
		id: app.path,
		title: app.name,
		subtitle: app.path,
		icon: createElement(AppIcon, { appPath: app.path }),
		onSelect: () => {
			rpc.request.openApp({ path: app.path });
		},
	};
}

export const appsProvider: SearchProvider = {
	id: "apps",
	label: "Apps",
	icon: AppWindow,
	placeholder: "Buscar aplicativos...",
	search: async (
		query: string,
		signal?: AbortSignal,
	): Promise<SearchResult[]> => {
		if (signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}
		try {
			const apps = await loadApps();
			if (signal?.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}

			if (!query.trim()) {
				return apps.slice(0, 20).map(appToResult);
			}

			const lowerQuery = query.toLowerCase().trim();
			return apps
				.filter((app) => app.name.toLowerCase().includes(lowerQuery))
				.map(appToResult);
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				throw err;
			}
			return [
				{
					id: "error",
					title: "Erro ao listar apps",
					subtitle: "Verifique a conexão RPC",
					onSelect: () => {},
				},
			];
		}
	},
};

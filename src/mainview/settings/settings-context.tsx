import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { KNOWN_PLUGIN_IDS } from "../providers/registry";
import {
	rpc,
	type Settings,
	setOpenPreferencesHandler,
} from "../providers/rpc";

interface SettingsContextValue {
	settings: Settings | null;
	enabledOrder: string[];
	updateEnabledOrder: (next: string[]) => void;
	isOpen: boolean;
	openDialog: () => void;
	closeDialog: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 150;
const MIN_ACTIVE = 1;
const MAX_ACTIVE = 5;

function sanitizeOrder(order: string[]): string[] {
	const seen = new Set<string>();
	const clean: string[] = [];
	for (const id of order) {
		if (!KNOWN_PLUGIN_IDS.includes(id)) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		clean.push(id);
	}
	if (clean.length < MIN_ACTIVE) {
		for (const fallback of KNOWN_PLUGIN_IDS) {
			if (clean.length >= MIN_ACTIVE) break;
			if (!seen.has(fallback)) {
				clean.push(fallback);
				seen.add(fallback);
			}
		}
	}
	return clean.slice(0, MAX_ACTIVE);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<Settings | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		rpc.request
			.loadSettings()
			.then((loaded) => {
				if (!cancelled) {
					setSettings({
						...loaded,
						plugins: {
							...loaded.plugins,
							enabledOrder: sanitizeOrder(loaded.plugins.enabledOrder),
						},
					});
				}
			})
			.catch(() => {
				if (!cancelled) {
					setSettings({
						version: 1,
						plugins: {
							enabledOrder: [...KNOWN_PLUGIN_IDS],
						},
					});
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setOpenPreferencesHandler(() => setIsOpen(true));
		return () => setOpenPreferencesHandler(null);
	}, []);

	const updateEnabledOrder = useCallback((next: string[]) => {
		const clean = sanitizeOrder(next);
		setSettings((prev) => {
			const base: Settings = prev ?? {
				version: 1,
				plugins: { enabledOrder: clean },
			};
			const updated: Settings = {
				...base,
				plugins: { ...base.plugins, enabledOrder: clean },
			};
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			saveTimerRef.current = setTimeout(() => {
				rpc.request.saveSettings(updated).catch(() => {});
			}, SAVE_DEBOUNCE_MS);
			return updated;
		});
	}, []);

	const openDialog = useCallback(() => setIsOpen(true), []);
	const closeDialog = useCallback(() => setIsOpen(false), []);

	const enabledOrder = settings?.plugins.enabledOrder ?? [];

	return (
		<SettingsContext.Provider
			value={{
				settings,
				enabledOrder,
				updateEnabledOrder,
				isOpen,
				openDialog,
				closeDialog,
			}}
		>
			{children}
		</SettingsContext.Provider>
	);
}

export function useSettings() {
	const ctx = useContext(SettingsContext);
	if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
	return ctx;
}

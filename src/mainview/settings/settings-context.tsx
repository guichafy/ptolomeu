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
	type CustomFilter,
	rpc,
	type Settings,
	type SettingsSection,
	setOpenPreferencesHandler,
} from "../providers/rpc";

interface SettingsContextValue {
	settings: Settings | null;
	enabledOrder: string[];
	updateEnabledOrder: (next: string[]) => void;
	customFilters: CustomFilter[];
	updateCustomFilters: (next: CustomFilter[]) => void;
	isOpen: boolean;
	initialSection: SettingsSection | null;
	openDialog: (section?: SettingsSection) => void;
	closeDialog: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 150;
const MIN_ACTIVE = 1;
const MAX_ACTIVE = 5;

const DEFAULT_GITHUB = {
	customFilters: [] as CustomFilter[],
	hasToken: false,
};

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

function normalizeSettings(loaded: Settings): Settings {
	return {
		...loaded,
		plugins: {
			...loaded.plugins,
			enabledOrder: sanitizeOrder(loaded.plugins.enabledOrder),
		},
		github: loaded.github ?? DEFAULT_GITHUB,
	};
}

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<Settings | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [initialSection, setInitialSection] = useState<SettingsSection | null>(
		null,
	);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		rpc.request
			.loadSettings()
			.then((loaded) => {
				if (!cancelled) setSettings(normalizeSettings(loaded));
			})
			.catch(() => {
				if (!cancelled) {
					setSettings({
						version: 1,
						plugins: { enabledOrder: [...KNOWN_PLUGIN_IDS] },
						github: DEFAULT_GITHUB,
					});
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setOpenPreferencesHandler((args) => {
			setInitialSection(args?.section ?? null);
			setIsOpen(true);
		});
		return () => setOpenPreferencesHandler(null);
	}, []);

	const scheduleSave = useCallback((next: Settings) => {
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			rpc.request.saveSettings(next).catch(() => {});
		}, SAVE_DEBOUNCE_MS);
	}, []);

	const updateEnabledOrder = useCallback(
		(next: string[]) => {
			const clean = sanitizeOrder(next);
			setSettings((prev) => {
				const base = prev ?? {
					version: 1 as const,
					plugins: { enabledOrder: clean },
					github: DEFAULT_GITHUB,
				};
				const updated: Settings = {
					...base,
					plugins: { ...base.plugins, enabledOrder: clean },
				};
				scheduleSave(updated);
				return updated;
			});
		},
		[scheduleSave],
	);

	const updateCustomFilters = useCallback(
		(next: CustomFilter[]) => {
			setSettings((prev) => {
				const base = prev ?? {
					version: 1 as const,
					plugins: { enabledOrder: [...KNOWN_PLUGIN_IDS] },
					github: DEFAULT_GITHUB,
				};
				const updated: Settings = {
					...base,
					github: { ...base.github, customFilters: next },
				};
				scheduleSave(updated);
				return updated;
			});
		},
		[scheduleSave],
	);

	const openDialog = useCallback((section?: SettingsSection) => {
		setInitialSection(section ?? null);
		setIsOpen(true);
	}, []);
	const closeDialog = useCallback(() => {
		setIsOpen(false);
		setInitialSection(null);
	}, []);

	const enabledOrder = settings?.plugins.enabledOrder ?? [];
	const customFilters = settings?.github.customFilters ?? [];

	return (
		<SettingsContext.Provider
			value={{
				settings,
				enabledOrder,
				updateEnabledOrder,
				customFilters,
				updateCustomFilters,
				isOpen,
				initialSection,
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

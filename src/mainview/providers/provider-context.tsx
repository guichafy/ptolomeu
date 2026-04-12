import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useSettings } from "../settings/settings-context";
import { PLUGIN_REGISTRY } from "./registry";
import type { SearchProvider } from "./types";

interface ProviderContextValue {
	providers: SearchProvider[];
	activeProvider: SearchProvider;
	activeIndex: number;
	setIndex: (i: number) => void;
	cycleNext: () => void;
	cyclePrev: () => void;
}

const ProviderContext = createContext<ProviderContextValue | null>(null);

export function ProviderContextProvider({ children }: { children: ReactNode }) {
	const { enabledOrder } = useSettings();

	const providers = useMemo<SearchProvider[]>(() => {
		return enabledOrder
			.map((id) => PLUGIN_REGISTRY[id])
			.filter((p): p is SearchProvider => Boolean(p));
	}, [enabledOrder]);

	const [activeIndex, setActiveIndex] = useState(0);
	const prevProviderIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (providers.length === 0) {
			prevProviderIdRef.current = null;
			if (activeIndex !== 0) setActiveIndex(0);
			return;
		}
		const prevId = prevProviderIdRef.current;
		if (prevId) {
			const next = providers.findIndex((p) => p.id === prevId);
			if (next >= 0) {
				if (next !== activeIndex) setActiveIndex(next);
				prevProviderIdRef.current = providers[next].id;
				return;
			}
		}
		const clamped = Math.min(activeIndex, providers.length - 1);
		if (clamped !== activeIndex) setActiveIndex(clamped);
		prevProviderIdRef.current = providers[clamped]?.id ?? null;
	}, [providers, activeIndex]);

	const cycleNext = useCallback(() => {
		if (providers.length === 0) return;
		setActiveIndex((i) => {
			const next = (i + 1) % providers.length;
			prevProviderIdRef.current = providers[next].id;
			return next;
		});
	}, [providers]);

	const cyclePrev = useCallback(() => {
		if (providers.length === 0) return;
		setActiveIndex((i) => {
			const next = (i - 1 + providers.length) % providers.length;
			prevProviderIdRef.current = providers[next].id;
			return next;
		});
	}, [providers]);

	const setIndex = useCallback(
		(i: number) => {
			if (i < 0 || i >= providers.length) return;
			prevProviderIdRef.current = providers[i].id;
			setActiveIndex(i);
		},
		[providers],
	);

	const activeProvider = providers[activeIndex];
	if (!activeProvider) return null;

	return (
		<ProviderContext.Provider
			value={{
				providers,
				activeProvider,
				activeIndex,
				setIndex,
				cycleNext,
				cyclePrev,
			}}
		>
			{children}
		</ProviderContext.Provider>
	);
}

export function useProvider() {
	const ctx = useContext(ProviderContext);
	if (!ctx)
		throw new Error("useProvider must be used within ProviderContextProvider");
	return ctx;
}

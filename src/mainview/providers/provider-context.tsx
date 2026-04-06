import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";
import type { SearchProvider } from "./types";

interface ProviderContextValue {
	providers: SearchProvider[];
	activeProvider: SearchProvider;
	activeIndex: number;
	cycleNext: () => void;
	cyclePrev: () => void;
}

const ProviderContext = createContext<ProviderContextValue | null>(null);

export function ProviderContextProvider({
	providers,
	children,
}: {
	providers: SearchProvider[];
	children: ReactNode;
}) {
	const [activeIndex, setActiveIndex] = useState(0);

	const cycleNext = useCallback(() => {
		setActiveIndex((i) => (i + 1) % providers.length);
	}, [providers.length]);

	const cyclePrev = useCallback(() => {
		setActiveIndex((i) => (i - 1 + providers.length) % providers.length);
	}, [providers.length]);

	return (
		<ProviderContext.Provider
			value={{
				providers,
				activeProvider: providers[activeIndex],
				activeIndex,
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

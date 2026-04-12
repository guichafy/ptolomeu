import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useSettings } from "../settings/settings-context";
import type { CustomFilter, GitHubSubType, TokenStatus } from "./github/types";
import { rpc } from "./rpc";

interface GitHubContextValue {
	activeSubType: GitHubSubType;
	setSubType: (s: GitHubSubType) => void;
	customFilters: CustomFilter[];
	tokenStatus: TokenStatus;
	refreshTokenStatus: () => Promise<void>;
	lastSearchCached: boolean | null;
	setLastSearchCached: (cached: boolean | null) => void;
}

const GitHubContext = createContext<GitHubContextValue | null>(null);

const DEFAULT_SUBTYPE: GitHubSubType = { kind: "native", type: "repos" };

export function GitHubProvider({ children }: { children: ReactNode }) {
	const { settings } = useSettings();
	const customFilters = useMemo(
		() => settings?.github?.customFilters ?? [],
		[settings],
	);
	const [activeSubType, setActiveSubType] =
		useState<GitHubSubType>(DEFAULT_SUBTYPE);
	const [tokenStatus, setTokenStatus] = useState<TokenStatus>({
		hasToken: false,
	});
	const [lastSearchCached, setLastSearchCached] = useState<boolean | null>(
		null,
	);

	const refreshTokenStatus = useCallback(async () => {
		try {
			const status = await rpc.request.githubGetTokenStatus();
			setTokenStatus(status);
		} catch {
			setTokenStatus({ hasToken: false });
		}
	}, []);

	useEffect(() => {
		refreshTokenStatus();
	}, [refreshTokenStatus]);

	// Se o filtro ativo foi deletado, volta ao default
	useEffect(() => {
		if (activeSubType.kind !== "custom") return;
		const stillExists = customFilters.some(
			(f) => f.id === activeSubType.filter.id,
		);
		if (!stillExists) setActiveSubType(DEFAULT_SUBTYPE);
	}, [activeSubType, customFilters]);

	const setSubType = useCallback((s: GitHubSubType) => {
		setActiveSubType(s);
	}, []);

	return (
		<GitHubContext.Provider
			value={{
				activeSubType,
				setSubType,
				customFilters,
				tokenStatus,
				refreshTokenStatus,
				lastSearchCached,
				setLastSearchCached,
			}}
		>
			{children}
		</GitHubContext.Provider>
	);
}

export function useGitHub() {
	const ctx = useContext(GitHubContext);
	if (!ctx) throw new Error("useGitHub must be used within GitHubProvider");
	return ctx;
}

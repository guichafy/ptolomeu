import { useEffect, useMemo, useRef, useState } from "react";
import type { GitHubItem, GitHubSubType } from "../rpc";
import { rpc } from "../rpc";

export interface DebouncedSearchResult {
	items: GitHubItem[];
	loading: boolean;
	error: string | null;
}

/**
 * Debounced GitHub search via RPC with automatic cancellation.
 * Pass `null` as args to skip fetching (e.g. when inputs are incomplete).
 */
export function useDebouncedSearch(
	args: { subType: GitHubSubType; query: string } | null,
	delay: number,
): DebouncedSearchResult {
	const [state, setState] = useState<DebouncedSearchResult>({
		items: [],
		loading: false,
		error: null,
	});
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Stable serialization to avoid re-triggering on object identity changes
	const argsKey = useMemo(() => (args ? JSON.stringify(args) : null), [args]);

	useEffect(() => {
		let cancelled = false;

		if (!argsKey) {
			setState({ items: [], loading: false, error: null });
			return;
		}

		const parsedArgs = JSON.parse(argsKey) as {
			subType: GitHubSubType;
			query: string;
		};

		setState((s) => ({ ...s, loading: true, error: null }));

		if (timerRef.current) clearTimeout(timerRef.current);

		timerRef.current = setTimeout(async () => {
			try {
				const result = await rpc.request.githubFetchSearch(parsedArgs);
				if (!cancelled) {
					setState({
						items: result.items,
						loading: false,
						error: null,
					});
				}
			} catch (err) {
				if (!cancelled) {
					setState({
						items: [],
						loading: false,
						error: err instanceof Error ? err.message : "Erro na busca",
					});
				}
			}
		}, delay);

		return () => {
			cancelled = true;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [argsKey, delay]);

	return state;
}

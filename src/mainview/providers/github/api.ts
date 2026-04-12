import { rpc } from "../rpc";
import type { SearchResult } from "../types";
import { toSearchResult } from "./renderers";
import type { GitHubSubType } from "./types";

export interface GitHubSearchOptions {
	onCacheStatus?: (cached: boolean) => void;
}

export async function githubSearch(
	query: string,
	subType: GitHubSubType,
	signal?: AbortSignal,
	options?: GitHubSearchOptions,
): Promise<SearchResult[]> {
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
	const response = await rpc.request.githubFetchSearch({ subType, query });
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
	options?.onCacheStatus?.(response.cached);
	return response.items.map(toSearchResult);
}

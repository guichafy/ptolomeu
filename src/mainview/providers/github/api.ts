import { rpc } from "../rpc";
import type { SearchResult } from "../types";
import { toSearchResult } from "./renderers";
import type { GitHubSubType } from "./types";

export async function githubSearch(
	query: string,
	subType: GitHubSubType,
	signal?: AbortSignal,
): Promise<SearchResult[]> {
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
	const items = await rpc.request.githubFetchSearch({ subType, query });
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
	return items.map(toSearchResult);
}

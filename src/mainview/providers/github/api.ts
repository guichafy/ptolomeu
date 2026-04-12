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
	const label =
		subType.kind === "native"
			? subType.type
			: `custom:${subType.filter.kind}:${subType.filter.name}`;
	const started = performance.now();
	try {
		const response = await rpc.request.githubFetchSearch({ subType, query });
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		options?.onCacheStatus?.(response.cached);
		console.log(
			`[github] ${label} "${query}" → ${response.items.length} items ${
				response.cached
					? "(cache)"
					: `(${Math.round(performance.now() - started)}ms)`
			}`,
		);
		return response.items.map(toSearchResult);
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") throw err;
		console.error(
			`[github] ${label} "${query}" failed after ${Math.round(
				performance.now() - started,
			)}ms:`,
			err,
		);
		throw err;
	}
}

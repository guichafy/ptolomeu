import type { GitHubItem, GitHubSubType } from "./github-fetch";

export const MAX_ENTRIES = 3;

interface CacheEntry {
	key: string;
	value: GitHubItem[];
}

const entries: CacheEntry[] = [];

function keyOf(subType: GitHubSubType, query: string): string {
	return JSON.stringify({ subType, query: query.trim().toLowerCase() });
}

export function getCached(
	subType: GitHubSubType,
	query: string,
): GitHubItem[] | null {
	const key = keyOf(subType, query);
	const idx = entries.findIndex((e) => e.key === key);
	if (idx < 0) return null;
	const [entry] = entries.splice(idx, 1);
	entries.push(entry);
	return entry.value;
}

export function setCached(
	subType: GitHubSubType,
	query: string,
	value: GitHubItem[],
): void {
	const key = keyOf(subType, query);
	const existing = entries.findIndex((e) => e.key === key);
	if (existing >= 0) entries.splice(existing, 1);
	entries.push({ key, value });
	while (entries.length > MAX_ENTRIES) entries.shift();
}

export function invalidateAll(): void {
	entries.length = 0;
}

export function getCachedKeys(): string[] {
	return entries.map((e) => e.key);
}

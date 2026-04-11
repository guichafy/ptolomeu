export interface TeamRepo {
	id: number;
	name: string;
	fullName: string;
	description: string | null;
	stars: number;
	language: string | null;
	url: string;
}

interface CacheEntry {
	fetchedAt: number;
	repos: TeamRepo[];
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(org: string, team: string): string {
	return `${org}/${team}`;
}

interface GithubTeamRepo {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	stargazers_count: number;
	language: string | null;
	html_url: string;
}

function parseNextUrl(linkHeader: string | null): string | null {
	if (!linkHeader) return null;
	const parts = linkHeader.split(",");
	for (const part of parts) {
		const match = part.match(/<([^>]+)>;\s*rel="next"/);
		if (match) return match[1];
	}
	return null;
}

async function fetchAllTeamRepos(
	org: string,
	team: string,
	token: string | null,
): Promise<TeamRepo[]> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "Ptolomeu",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	let url: string | null = `https://api.github.com/orgs/${encodeURIComponent(
		org,
	)}/teams/${encodeURIComponent(team)}/repos?per_page=100`;
	const all: TeamRepo[] = [];
	while (url) {
		const res = await fetch(url, { headers });
		if (!res.ok) {
			throw new Error(`GitHub ${res.status}: ${res.statusText}`);
		}
		const data = (await res.json()) as GithubTeamRepo[];
		for (const r of data) {
			all.push({
				id: r.id,
				name: r.name,
				fullName: r.full_name,
				description: r.description,
				stars: r.stargazers_count,
				language: r.language,
				url: r.html_url,
			});
		}
		url = parseNextUrl(res.headers.get("Link"));
	}
	return all;
}

export async function getFiltered(
	org: string,
	team: string,
	query: string,
	token: string | null,
): Promise<TeamRepo[]> {
	const key = cacheKey(org, team);
	let entry = cache.get(key);
	if (!entry || Date.now() - entry.fetchedAt > TTL_MS) {
		entry = {
			fetchedAt: Date.now(),
			repos: await fetchAllTeamRepos(org, team, token),
		};
		cache.set(key, entry);
	}
	const q = query.trim().toLowerCase();
	if (!q) return entry.repos;
	return entry.repos.filter(
		(r) =>
			r.name.toLowerCase().includes(q) ||
			(r.description?.toLowerCase().includes(q) ?? false),
	);
}

export function invalidate(org: string, team: string): void {
	cache.delete(cacheKey(org, team));
}

export function _resetCache(): void {
	cache.clear();
}

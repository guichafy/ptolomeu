import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as githubToken from "../github-token";
import { githubFetchSearch } from "./github-fetch";
import { _resetCache } from "./team-repos-cache";

const originalFetch = globalThis.fetch;

beforeEach(() => {
	_resetCache();
	vi.spyOn(githubToken, "getToken").mockResolvedValue("tok");
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("githubFetchSearch", () => {
	it("repos nativo → /search/repositories", async () => {
		const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
			expect(String(url)).toContain("/search/repositories");
			expect(String(url)).toContain("q=react");
			const headers = new Headers(init?.headers);
			expect(headers.get("Authorization")).toBe("Bearer tok");
			return new Response(
				JSON.stringify({
					items: [
						{
							id: 1,
							full_name: "a/b",
							description: null,
							stargazers_count: 0,
							language: null,
							html_url: "u",
						},
					],
				}),
				{ status: 200 },
			);
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const items = await githubFetchSearch({
			subType: { kind: "native", type: "repos" },
			query: "react",
		});
		expect(items).toHaveLength(1);
		expect(items[0].kind).toBe("repo");
	});

	it("code nativo → /search/code", async () => {
		globalThis.fetch = vi.fn(async (url: string | URL) => {
			expect(String(url)).toContain("/search/code");
			return new Response(JSON.stringify({ items: [] }), { status: 200 });
		}) as unknown as typeof fetch;
		const items = await githubFetchSearch({
			subType: { kind: "native", type: "code" },
			query: "useState",
		});
		expect(items).toEqual([]);
	});

	it("issues nativo → /search/issues normaliza PR vs issue", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						items: [
							{
								id: 10,
								number: 1,
								title: "bug",
								state: "open",
								pull_request: null,
								repository_url: "https://api.github.com/repos/a/b",
								html_url: "",
							},
							{
								id: 11,
								number: 2,
								title: "feat",
								state: "closed",
								pull_request: { url: "x" },
								repository_url: "https://api.github.com/repos/a/b",
								html_url: "",
							},
						],
					}),
					{ status: 200 },
				),
		) as unknown as typeof fetch;
		const items = await githubFetchSearch({
			subType: { kind: "native", type: "issues" },
			query: "bug",
		});
		expect(items).toHaveLength(2);
		expect(items[0].kind).toBe("issue");
		expect((items[1] as { isPR: boolean }).isPR).toBe(true);
		expect((items[0] as { isPR: boolean }).isPR).toBe(false);
	});

	it("users nativo → /search/users", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						items: [
							{ id: 1, login: "guichafy", avatar_url: "a", html_url: "u" },
						],
					}),
					{ status: 200 },
				),
		) as unknown as typeof fetch;
		const items = await githubFetchSearch({
			subType: { kind: "native", type: "users" },
			query: "guichafy",
		});
		expect(items[0].kind).toBe("user");
	});

	it("custom search-query prefixa qualifiers", async () => {
		globalThis.fetch = vi.fn(async (url: string | URL) => {
			const u = new URL(String(url));
			expect(u.pathname).toBe("/search/issues");
			expect(u.searchParams.get("q")).toBe("is:pr is:open author:@me fix");
			return new Response(JSON.stringify({ items: [] }), { status: 200 });
		}) as unknown as typeof fetch;
		await githubFetchSearch({
			subType: {
				kind: "custom",
				filter: {
					id: "f1",
					kind: "search",
					name: "PRs",
					baseType: "issues",
					qualifiers: "is:pr is:open author:@me",
				},
			},
			query: "fix",
		});
	});

	it("custom team-repos chama team-repos-cache e devolve repo items", async () => {
		globalThis.fetch = vi.fn(async (url: string | URL) => {
			expect(String(url)).toContain("/orgs/Chafy-Studio/teams/chafy/repos");
			return new Response(
				JSON.stringify([
					{
						id: 99,
						name: "ptolomeu",
						full_name: "Chafy-Studio/ptolomeu",
						description: "d",
						stargazers_count: 0,
						language: "TS",
						html_url: "u",
					},
				]),
				{ status: 200, headers: { Link: "" } },
			);
		}) as unknown as typeof fetch;
		const items = await githubFetchSearch({
			subType: {
				kind: "custom",
				filter: {
					id: "f2",
					kind: "team-repos",
					name: "x",
					org: "Chafy-Studio",
					team: "chafy",
				},
			},
			query: "ptolomeu",
		});
		expect(items).toHaveLength(1);
		expect(items[0].kind).toBe("repo");
	});

	it("propaga erro quando rate limit (403)", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response("", {
					status: 403,
					headers: { "x-ratelimit-reset": "1700000000" },
				}),
		) as unknown as typeof fetch;
		await expect(
			githubFetchSearch({
				subType: { kind: "native", type: "repos" },
				query: "x",
			}),
		).rejects.toThrow(/rate limit/i);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	_resetCache,
	getFiltered,
	invalidate,
	type TeamRepo,
} from "./team-repos-cache";

const originalFetch = globalThis.fetch;

beforeEach(() => {
	_resetCache();
	vi.useFakeTimers();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.useRealTimers();
});

describe("team-repos-cache", () => {
	it("busca e cacheia repos do endpoint team", async () => {
		const fetchMock = vi.fn(async (url: string | URL) => {
			expect(String(url)).toContain("/orgs/Chafy-Studio/teams/chafy/repos");
			return new Response(
				JSON.stringify([
					{
						id: 1,
						name: "ptolomeu",
						full_name: "Chafy-Studio/ptolomeu",
						description: "menu bar app",
						stargazers_count: 5,
						language: "TypeScript",
						html_url: "https://github.com/x",
					},
				]),
				{ status: 200, headers: { Link: "" } },
			);
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const results = await getFiltered("Chafy-Studio", "chafy", "", "tok");
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("ptolomeu");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("reaproveita cache dentro do TTL", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify([
						{
							id: 1,
							name: "a",
							full_name: "o/a",
							description: null,
							stargazers_count: 0,
							language: null,
							html_url: "",
						},
					]),
					{ status: 200, headers: { Link: "" } },
				),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		await getFiltered("o", "t", "", "tok");
		await getFiltered("o", "t", "", "tok");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("expira após 5 minutos e refaz fetch", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify([
						{
							id: 1,
							name: "a",
							full_name: "o/a",
							description: null,
							stargazers_count: 0,
							language: null,
							html_url: "",
						},
					]),
					{ status: 200, headers: { Link: "" } },
				),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		await getFiltered("o", "t", "", "tok");
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		await getFiltered("o", "t", "", "tok");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("filtra por query case-insensitive em name e description", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify([
						{
							id: 1,
							name: "ptolomeu",
							full_name: "o/ptolomeu",
							description: "menu BAR",
							stargazers_count: 0,
							language: null,
							html_url: "",
						},
						{
							id: 2,
							name: "other",
							full_name: "o/other",
							description: "not relevant",
							stargazers_count: 0,
							language: null,
							html_url: "",
						},
						{
							id: 3,
							name: "bar-service",
							full_name: "o/bar-service",
							description: null,
							stargazers_count: 0,
							language: null,
							html_url: "",
						},
					]),
					{ status: 200, headers: { Link: "" } },
				),
		) as unknown as typeof fetch;
		const results = await getFiltered("o", "t", "bar", "tok");
		expect(results.map((r: TeamRepo) => r.name).sort()).toEqual([
			"bar-service",
			"ptolomeu",
		]);
	});

	it("invalidate força refetch na próxima chamada", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify([
						{
							id: 1,
							name: "a",
							full_name: "o/a",
							description: null,
							stargazers_count: 0,
							language: null,
							html_url: "",
						},
					]),
					{ status: 200, headers: { Link: "" } },
				),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		await getFiltered("o", "t", "", "tok");
		invalidate("o", "t");
		await getFiltered("o", "t", "", "tok");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("inclui Authorization quando token fornecido", async () => {
		const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(headers.get("Authorization")).toBe("Bearer tok123");
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { Link: "" },
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		await getFiltered("o", "t", "", "tok123");
	});
});

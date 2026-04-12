import { beforeEach, describe, expect, it } from "vitest";
import type { GitHubItem, GitHubSubType } from "./github-fetch";
import {
	getCached,
	getCachedKeys,
	invalidateAll,
	MAX_ENTRIES,
	setCached,
} from "./search-cache";

const repos: GitHubSubType = { kind: "native", type: "repos" };
const code: GitHubSubType = { kind: "native", type: "code" };
const issues: GitHubSubType = { kind: "native", type: "issues" };
const users: GitHubSubType = { kind: "native", type: "users" };

const items = (id: number): GitHubItem[] => [
	{
		kind: "repo",
		id,
		fullName: `o/r${id}`,
		description: null,
		stars: id,
		language: null,
		url: "",
	},
];

beforeEach(() => {
	invalidateAll();
});

describe("search-cache LRU", () => {
	it("retorna null quando key não existe", () => {
		expect(getCached(repos, "foo")).toBeNull();
	});

	it("armazena e retorna o mesmo termo", () => {
		setCached(repos, "foo", items(1));
		expect(getCached(repos, "foo")).toEqual(items(1));
	});

	it("trata query case-insensitive e com whitespace", () => {
		setCached(repos, "Foo", items(1));
		expect(getCached(repos, "  foo  ")).toEqual(items(1));
		expect(getCached(repos, "FOO")).toEqual(items(1));
	});

	it("cache miss para termo diferente", () => {
		setCached(repos, "foo", items(1));
		expect(getCached(repos, "bar")).toBeNull();
	});

	it("cache miss para subType diferente com mesmo termo", () => {
		setCached(repos, "foo", items(1));
		expect(getCached(code, "foo")).toBeNull();
	});

	it("evicta a entrada menos recentemente usada quando atinge MAX_ENTRIES", () => {
		expect(MAX_ENTRIES).toBe(3);
		setCached(repos, "a", items(1));
		setCached(repos, "b", items(2));
		setCached(repos, "c", items(3));
		setCached(repos, "d", items(4)); // deve evictar "a"
		expect(getCached(repos, "a")).toBeNull();
		expect(getCached(repos, "b")).not.toBeNull();
		expect(getCached(repos, "c")).not.toBeNull();
		expect(getCached(repos, "d")).not.toBeNull();
	});

	it("hit promove para most-recent (LRU)", () => {
		setCached(repos, "a", items(1));
		setCached(repos, "b", items(2));
		setCached(repos, "c", items(3));
		// Hit em "a" promove ela
		getCached(repos, "a");
		setCached(repos, "d", items(4)); // agora "b" deve ser evictado
		expect(getCached(repos, "b")).toBeNull();
		expect(getCached(repos, "a")).not.toBeNull();
	});

	it("setCached no mesmo key substitui o valor sem crescer o cache", () => {
		setCached(repos, "a", items(1));
		setCached(repos, "a", items(2));
		expect(getCached(repos, "a")).toEqual(items(2));
		expect(getCachedKeys()).toHaveLength(1);
	});

	it("chaves diferentes para os 4 tipos nativos com mesmo termo", () => {
		setCached(repos, "x", items(1));
		setCached(code, "x", items(2));
		setCached(issues, "x", items(3));
		setCached(users, "x", items(4));
		// MAX_ENTRIES=3, então o primeiro (repos) foi evictado
		expect(getCached(repos, "x")).toBeNull();
		expect(getCached(code, "x")).toEqual(items(2));
		expect(getCached(issues, "x")).toEqual(items(3));
		expect(getCached(users, "x")).toEqual(items(4));
	});

	it("invalidateAll limpa tudo", () => {
		setCached(repos, "a", items(1));
		setCached(repos, "b", items(2));
		invalidateAll();
		expect(getCached(repos, "a")).toBeNull();
		expect(getCached(repos, "b")).toBeNull();
		expect(getCachedKeys()).toHaveLength(0);
	});
});

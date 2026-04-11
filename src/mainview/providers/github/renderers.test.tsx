import { describe, expect, it } from "vitest";
import { toSearchResult } from "./renderers";
import type { GitHubItem } from "./types";

describe("toSearchResult", () => {
	it("repo", () => {
		const item: GitHubItem = {
			kind: "repo",
			id: 1,
			fullName: "facebook/react",
			description: "The library",
			stars: 228000,
			language: "TypeScript",
			url: "https://github.com/facebook/react",
		};
		const r = toSearchResult(item);
		expect(r.title).toBe("facebook/react");
		expect(r.subtitle).toBe("The library");
		expect(r.badge).toBe("⭐ 228.0k · TypeScript");
		expect(r.id).toBe("repo-1");
	});

	it("repo sem language", () => {
		const r = toSearchResult({
			kind: "repo",
			id: 2,
			fullName: "a/b",
			description: null,
			stars: 5,
			language: null,
			url: "",
		});
		expect(r.badge).toBe("⭐ 5");
		expect(r.subtitle).toBeUndefined();
	});

	it("code", () => {
		const r = toSearchResult({
			kind: "code",
			id: "abc",
			path: "src/index.ts",
			repoFullName: "a/b",
			url: "",
		});
		expect(r.title).toBe("src/index.ts");
		expect(r.subtitle).toBe("a/b");
		expect(r.id).toBe("code-abc");
	});

	it("issue open", () => {
		const r = toSearchResult({
			kind: "issue",
			id: 10,
			number: 42,
			title: "Bug",
			state: "open",
			isPR: false,
			repoFullName: "a/b",
			url: "",
		});
		expect(r.title).toBe("#42 Bug");
		expect(r.subtitle).toBe("a/b");
		expect(r.badge).toBe("🟢 issue");
	});

	it("PR closed", () => {
		const r = toSearchResult({
			kind: "issue",
			id: 11,
			number: 7,
			title: "Feat",
			state: "closed",
			isPR: true,
			repoFullName: "a/b",
			url: "",
		});
		expect(r.badge).toBe("🟣 PR");
	});

	it("user", () => {
		const r = toSearchResult({
			kind: "user",
			id: 1,
			login: "guichafy",
			name: "Guilherme",
			avatarUrl: "a",
			url: "https://github.com/guichafy",
		});
		expect(r.title).toBe("guichafy");
		expect(r.subtitle).toBe("Guilherme");
	});
});

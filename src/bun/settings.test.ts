import { describe, expect, it } from "vitest";
import { DEFAULT_GITHUB_SETTINGS, validateSettings } from "./settings";

describe("validateSettings", () => {
	it("aceita settings válidas sem github (retro-compat)", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["apps", "github"] },
		});
		expect(result.ok).toBe(true);
		expect(result.value?.github).toEqual(DEFAULT_GITHUB_SETTINGS);
	});

	it("aceita settings com github.customFilters vazio", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["apps", "github", "calc", "web"] },
			github: { customFilters: [], hasToken: false },
		});
		expect(result.ok).toBe(true);
		expect(result.value?.github.customFilters).toEqual([]);
	});

	it("aceita filtro team-repos válido", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["github"] },
			github: {
				hasToken: true,
				customFilters: [
					{
						id: "f1",
						kind: "team-repos",
						name: "Chafy · chafy",
						icon: "⭐",
						org: "Chafy-Studio",
						team: "chafy",
					},
				],
			},
		});
		expect(result.ok).toBe(true);
	});

	it("aceita filtro search válido", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["github"] },
			github: {
				hasToken: false,
				customFilters: [
					{
						id: "f2",
						kind: "search",
						name: "Meus PRs",
						baseType: "issues",
						qualifiers: "is:pr is:open author:@me",
					},
				],
			},
		});
		expect(result.ok).toBe(true);
	});

	it("rejeita filtro team-repos sem org", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["github"] },
			github: {
				hasToken: false,
				customFilters: [
					{ id: "f3", kind: "team-repos", name: "x", team: "chafy" },
				],
			},
		});
		expect(result.ok).toBe(false);
	});

	it("rejeita filtro com kind desconhecido", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["github"] },
			github: {
				hasToken: false,
				customFilters: [{ id: "f4", kind: "mystery", name: "x" }],
			},
		});
		expect(result.ok).toBe(false);
	});

	it("rejeita filtros com ids duplicados", () => {
		const result = validateSettings({
			version: 1,
			plugins: { enabledOrder: ["github"] },
			github: {
				hasToken: false,
				customFilters: [
					{ id: "dup", kind: "team-repos", name: "a", org: "o", team: "t" },
					{
						id: "dup",
						kind: "search",
						name: "b",
						baseType: "repos",
						qualifiers: "",
					},
				],
			},
		});
		expect(result.ok).toBe(false);
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { webSearchProvider } from "./web-search-provider";

describe("webSearchProvider", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: { open: vi.fn() },
			configurable: true,
		});
	});

	it("identifies itself as 'web'", () => {
		expect(webSearchProvider.id).toBe("web");
		expect(webSearchProvider.label).toBe("Web");
	});

	it("returns empty list for empty query", async () => {
		expect(await webSearchProvider.search("")).toEqual([]);
		expect(await webSearchProvider.search("   ")).toEqual([]);
	});

	it("returns one result per engine (google, ddg, SO, youtube)", async () => {
		const results = await webSearchProvider.search("react hooks");
		expect(results).toHaveLength(4);
		expect(results.map((r) => r.id)).toEqual([
			"google",
			"duckduckgo",
			"stackoverflow",
			"youtube",
		]);
	});

	it("builds URLs with encoded query", async () => {
		const results = await webSearchProvider.search("a b & c");
		expect(results[0].subtitle).toBe(
			"https://www.google.com/search?q=a%20b%20%26%20c",
		);
		expect(results[1].subtitle).toBe(
			"https://duckduckgo.com/?q=a%20b%20%26%20c",
		);
		expect(results[2].subtitle).toBe(
			"https://stackoverflow.com/search?q=a%20b%20%26%20c",
		);
		expect(results[3].subtitle).toBe(
			"https://www.youtube.com/results?search_query=a%20b%20%26%20c",
		);
	});

	it("trims the query before encoding", async () => {
		const results = await webSearchProvider.search("  foo  ");
		expect(results[0].subtitle).toBe("https://www.google.com/search?q=foo");
	});

	it("uses Portuguese titles", async () => {
		const results = await webSearchProvider.search("x");
		expect(results[0].title).toBe("Buscar no Google");
		expect(results[1].title).toBe("Buscar no DuckDuckGo");
		expect(results[2].title).toBe("Buscar no Stack Overflow");
		expect(results[3].title).toBe("Buscar no YouTube");
	});

	it("onSelect opens the URL in a new tab via window.open", async () => {
		const results = await webSearchProvider.search("foo");
		const open = (globalThis.window as { open: ReturnType<typeof vi.fn> }).open;
		results[0].onSelect();
		expect(open).toHaveBeenCalledWith(
			"https://www.google.com/search?q=foo",
			"_blank",
		);
	});
});

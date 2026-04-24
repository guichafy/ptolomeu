import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listApps = vi.fn();
const openApp = vi.fn();
const getAppIcon = vi.fn();

vi.mock("./rpc", () => ({
	rpc: { request: { listApps, openApp, getAppIcon } },
}));

// Re-import the module between tests to reset its internal caches
// (cachedApps / inFlightLoad).
async function loadProvider() {
	vi.resetModules();
	const mod = await import("./apps-provider");
	return mod.appsProvider;
}

describe("appsProvider", () => {
	beforeEach(() => {
		listApps.mockReset();
		openApp.mockReset();
		getAppIcon.mockReset();
	});

	afterEach(() => {
		vi.resetModules();
	});

	it("identifies itself as 'apps'", async () => {
		listApps.mockResolvedValue([]);
		const provider = await loadProvider();
		expect(provider.id).toBe("apps");
		expect(provider.label).toBe("Apps");
	});

	it("returns first 20 apps when query is empty", async () => {
		const apps = Array.from({ length: 30 }, (_, i) => ({
			name: `App${i}`,
			path: `/A${i}.app`,
		}));
		listApps.mockResolvedValue(apps);
		const provider = await loadProvider();

		const results = await provider.search("");
		expect(results).toHaveLength(20);
		expect(results[0].title).toBe("App0");
		expect(results[0].subtitle).toBe("/A0.app");
	});

	it("filters apps case-insensitively by name substring", async () => {
		listApps.mockResolvedValue([
			{ name: "Safari", path: "/Safari.app" },
			{ name: "Chrome", path: "/Chrome.app" },
			{ name: "Firefox", path: "/Firefox.app" },
		]);
		const provider = await loadProvider();

		const results = await provider.search("fox");
		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("Firefox");
	});

	it("caches the app list across calls (listApps invoked only once)", async () => {
		listApps.mockResolvedValue([{ name: "Safari", path: "/Safari.app" }]);
		const provider = await loadProvider();

		await provider.search("");
		await provider.search("safari");
		await provider.search("");
		expect(listApps).toHaveBeenCalledTimes(1);
	});

	it("deduplicates concurrent in-flight loads", async () => {
		let resolveLoad: (v: { name: string; path: string }[]) => void = () => {};
		listApps.mockReturnValue(
			new Promise((resolve) => {
				resolveLoad = resolve;
			}),
		);
		const provider = await loadProvider();

		const p1 = provider.search("");
		const p2 = provider.search("");
		resolveLoad([{ name: "Safari", path: "/Safari.app" }]);
		await Promise.all([p1, p2]);

		expect(listApps).toHaveBeenCalledTimes(1);
	});

	it("onSelect triggers openApp with the app path", async () => {
		listApps.mockResolvedValue([{ name: "Safari", path: "/Safari.app" }]);
		const provider = await loadProvider();

		const [result] = await provider.search("");
		result.onSelect();
		expect(openApp).toHaveBeenCalledWith({ path: "/Safari.app" });
	});

	it("returns an error result when listApps rejects", async () => {
		listApps.mockRejectedValue(new Error("RPC down"));
		const provider = await loadProvider();

		const results = await provider.search("anything");
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("error");
		expect(results[0].title).toMatch(/Erro ao listar apps/);
	});

	it("throws AbortError when signal is aborted before load", async () => {
		listApps.mockResolvedValue([]);
		const provider = await loadProvider();
		const controller = new AbortController();
		controller.abort();

		await expect(provider.search("", controller.signal)).rejects.toMatchObject({
			name: "AbortError",
		});
	});

	it("throws AbortError when signal aborts during load", async () => {
		let resolveLoad: (v: { name: string; path: string }[]) => void = () => {};
		listApps.mockReturnValue(
			new Promise((resolve) => {
				resolveLoad = resolve;
			}),
		);
		const provider = await loadProvider();
		const controller = new AbortController();

		const pending = provider.search("", controller.signal);
		controller.abort();
		resolveLoad([{ name: "Safari", path: "/Safari.app" }]);

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});
});

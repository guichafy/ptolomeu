import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Integration test: real SettingsProvider + real ProviderContextProvider
// composed together. The RPC boundary is mocked with an in-memory fake, but
// the React state flow (load settings → provider list derived → reorder →
// active provider index preserved) runs for real.

const state = vi.hoisted(() => ({
	stored: null as unknown as {
		version: 1;
		plugins: { enabledOrder: string[] };
		github: { customFilters: unknown[]; hasToken: boolean };
		analytics: { consentGiven: boolean; anonymousId: string };
		claude: {
			authMode: "anthropic" | "bedrock";
			model: string;
			permissionMode: "dontAsk" | "acceptEdits" | "bypassPermissions" | "plan";
		};
		proxy: { mode: "auto" | "system" | "env" | "none" | "manual" };
	},
}));

const rpcRequest = {
	loadSettings: vi.fn(async () => state.stored),
	saveSettings: vi.fn(async (next) => {
		state.stored = structuredClone(next);
		return true;
	}),
	setAnalyticsConsent: vi.fn(async () => true),
	saveManualProxy: vi.fn(async () => ({ ok: true })),
	clearManualProxy: vi.fn(async () => true),
	testProxyConnection: vi.fn(async () => ({ ok: true, latencyMs: 5 })),
	githubGetTokenStatus: vi.fn(async () => ({ hasToken: false })),
	getAppIcon: vi.fn(async () => ({ icon: null })),
	listApps: vi.fn(async () => []),
};

vi.mock("./rpc", () => ({
	rpc: { request: rpcRequest },
	setOpenPreferencesHandler: vi.fn(),
	setClaudeSessionsUpdateHandler: vi.fn(),
}));

vi.mock("../settings/claude-section", () => ({ ClaudeSection: () => null }));

const { SettingsProvider, useSettings } = await import(
	"../settings/settings-context"
);
const { ProviderContextProvider, useProvider } = await import(
	"./provider-context"
);

function defaultSettings() {
	return {
		version: 1 as const,
		plugins: {
			enabledOrder: ["apps", "github", "calc", "web", "claude"] as string[],
		},
		github: { customFilters: [] as unknown[], hasToken: false },
		analytics: { consentGiven: false, anonymousId: "anon-1" },
		claude: {
			authMode: "anthropic" as const,
			model: "claude-sonnet-4-6",
			permissionMode: "acceptEdits" as const,
		},
		proxy: { mode: "auto" as const },
	};
}

function wrapper({ children }: { children: ReactNode }) {
	return (
		<SettingsProvider>
			<ProviderContextProvider>{children}</ProviderContextProvider>
		</SettingsProvider>
	);
}

describe("SettingsProvider + ProviderContextProvider (integration)", () => {
	beforeEach(() => {
		state.stored = defaultSettings();
		for (const fn of Object.values(rpcRequest)) {
			(fn as ReturnType<typeof vi.fn>).mockClear();
		}
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function useCombined() {
		return { settings: useSettings(), provider: useProvider() };
	}

	it("provider list reflects the enabledOrder loaded from settings", async () => {
		const { result } = renderHook(() => useCombined(), { wrapper });

		await waitFor(() => {
			expect(result.current.provider.providers.length).toBe(5);
		});
		expect(result.current.provider.providers.map((p) => p.id)).toEqual([
			"apps",
			"github",
			"calc",
			"web",
			"claude",
		]);
		expect(result.current.provider.activeProvider.id).toBe("apps");
	});

	it("reordering plugins via settings keeps the active provider by identity", async () => {
		const { result } = renderHook(() => useCombined(), { wrapper });
		await waitFor(() => {
			expect(result.current.provider.providers.length).toBe(5);
		});

		// Move to github
		act(() => result.current.provider.setIndex(1));
		expect(result.current.provider.activeProvider.id).toBe("github");

		// Reorder settings so github is now position 3
		vi.useFakeTimers({ shouldAdvanceTime: true });
		act(() => {
			result.current.settings.updateEnabledOrder([
				"apps",
				"calc",
				"web",
				"github",
				"claude",
			]);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});
		vi.useRealTimers();

		// github should still be the active provider even though its index moved
		await waitFor(() => {
			expect(result.current.provider.activeProvider.id).toBe("github");
		});
		expect(result.current.provider.activeIndex).toBe(3);
	});

	it("removing active provider from settings clamps the index", async () => {
		const { result } = renderHook(() => useCombined(), { wrapper });
		await waitFor(() => {
			expect(result.current.provider.providers.length).toBe(5);
		});

		act(() => result.current.provider.setIndex(4)); // claude
		expect(result.current.provider.activeProvider.id).toBe("claude");

		// Drop claude from enabledOrder
		vi.useFakeTimers({ shouldAdvanceTime: true });
		act(() => {
			result.current.settings.updateEnabledOrder([
				"apps",
				"github",
				"calc",
				"web",
			]);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});
		vi.useRealTimers();

		await waitFor(() => {
			expect(result.current.provider.providers.length).toBe(4);
		});
		// Previous active ("claude") gone → index clamped to last ("web")
		expect(result.current.provider.activeProvider.id).toBe("web");
	});

	it("settings changes round-trip through the in-memory RPC fake", async () => {
		const { result } = renderHook(() => useCombined(), { wrapper });
		await waitFor(() => {
			expect(result.current.provider.providers.length).toBe(5);
		});

		vi.useFakeTimers({ shouldAdvanceTime: true });
		act(() => {
			result.current.settings.updateEnabledOrder(["github", "calc"]);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});
		vi.useRealTimers();

		expect(rpcRequest.saveSettings).toHaveBeenCalled();
		expect(state.stored.plugins.enabledOrder).toEqual(["github", "calc"]);
		await waitFor(() => {
			expect(result.current.provider.providers.map((p) => p.id)).toEqual([
				"github",
				"calc",
			]);
		});
	});
});

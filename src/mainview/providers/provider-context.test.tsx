import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./rpc", () => ({
	rpc: { request: {} },
	setOpenPreferencesHandler: vi.fn(),
	setClaudeSessionsUpdateHandler: vi.fn(),
}));
vi.mock("../settings/claude-section", () => ({ ClaudeSection: () => null }));

const enabledOrderMock = vi.hoisted(() => ({
	current: ["github", "calc", "web"],
}));
vi.mock("../settings/settings-context", () => ({
	useSettings: () => ({ enabledOrder: enabledOrderMock.current }),
}));

const { ProviderContextProvider, useProvider } = await import(
	"./provider-context"
);

function wrapper({ children }: { children: ReactNode }) {
	return <ProviderContextProvider>{children}</ProviderContextProvider>;
}

describe("ProviderContextProvider", () => {
	it("maps enabledOrder to provider instances and defaults to index 0", () => {
		enabledOrderMock.current = ["github", "calc", "web"];
		const { result } = renderHook(() => useProvider(), { wrapper });

		expect(result.current.providers.map((p) => p.id)).toEqual([
			"github",
			"calc",
			"web",
		]);
		expect(result.current.activeIndex).toBe(0);
		expect(result.current.activeProvider.id).toBe("github");
	});

	it("cycleNext wraps around at the end", () => {
		enabledOrderMock.current = ["github", "calc"];
		const { result } = renderHook(() => useProvider(), { wrapper });

		act(() => result.current.cycleNext());
		expect(result.current.activeIndex).toBe(1);
		act(() => result.current.cycleNext());
		expect(result.current.activeIndex).toBe(0);
	});

	it("cyclePrev wraps around at the start", () => {
		enabledOrderMock.current = ["github", "calc", "web"];
		const { result } = renderHook(() => useProvider(), { wrapper });

		act(() => result.current.cyclePrev());
		expect(result.current.activeIndex).toBe(2);
		expect(result.current.activeProvider.id).toBe("web");
	});

	it("setIndex jumps directly to the given position", () => {
		enabledOrderMock.current = ["github", "calc", "web"];
		const { result } = renderHook(() => useProvider(), { wrapper });

		act(() => result.current.setIndex(2));
		expect(result.current.activeProvider.id).toBe("web");
	});

	it("setIndex ignores out-of-range values", () => {
		enabledOrderMock.current = ["github", "calc"];
		const { result } = renderHook(() => useProvider(), { wrapper });

		act(() => result.current.setIndex(42));
		expect(result.current.activeIndex).toBe(0);
		act(() => result.current.setIndex(-1));
		expect(result.current.activeIndex).toBe(0);
	});

	it("filters out unknown ids present in enabledOrder", () => {
		enabledOrderMock.current = ["github", "does-not-exist", "calc"];
		const { result } = renderHook(() => useProvider(), { wrapper });

		expect(result.current.providers.map((p) => p.id)).toEqual([
			"github",
			"calc",
		]);
	});

	it("renders nothing when no providers are enabled (hook throws)", () => {
		enabledOrderMock.current = [];

		function Consumer() {
			useProvider();
			return <div data-testid="consumer" />;
		}

		// With an empty provider list the provider returns null, so the consumer
		// never renders and useProvider would throw if it mounted.
		render(
			<ProviderContextProvider>
				<Consumer />
			</ProviderContextProvider>,
		);
		expect(screen.queryByTestId("consumer")).toBeNull();
	});

	it("useProvider throws when used outside the provider", () => {
		expect(() => renderHook(() => useProvider())).toThrow(
			/useProvider must be used within ProviderContextProvider/,
		);
	});
});

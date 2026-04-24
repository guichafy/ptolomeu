import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomFilter } from "./github/types";

const githubGetTokenStatus = vi.fn();

vi.mock("./rpc", () => ({
	rpc: { request: { githubGetTokenStatus } },
}));

const settingsMock = vi.hoisted(() => ({
	current: { github: { customFilters: [] as CustomFilter[] } },
}));
vi.mock("../settings/settings-context", () => ({
	useSettings: () => ({ settings: settingsMock.current }),
}));

const { GitHubProvider, useGitHub } = await import("./github-context");

function wrapper({ children }: { children: ReactNode }) {
	return <GitHubProvider>{children}</GitHubProvider>;
}

describe("GitHubProvider", () => {
	beforeEach(() => {
		githubGetTokenStatus.mockReset();
		settingsMock.current = { github: { customFilters: [] } };
	});

	it("defaults to native repos subtype", () => {
		githubGetTokenStatus.mockResolvedValue({ hasToken: false });
		const { result } = renderHook(() => useGitHub(), { wrapper });
		expect(result.current.activeSubType).toEqual({
			kind: "native",
			type: "repos",
		});
	});

	it("loads token status on mount", async () => {
		githubGetTokenStatus.mockResolvedValue({
			hasToken: true,
			login: "guichafy",
		});
		const { result } = renderHook(() => useGitHub(), { wrapper });

		await waitFor(() => {
			expect(result.current.tokenStatus.hasToken).toBe(true);
		});
		expect(result.current.tokenStatus.login).toBe("guichafy");
	});

	it("falls back to hasToken=false when RPC rejects", async () => {
		githubGetTokenStatus.mockRejectedValue(new Error("offline"));
		const { result } = renderHook(() => useGitHub(), { wrapper });

		await waitFor(() => {
			expect(githubGetTokenStatus).toHaveBeenCalled();
		});
		expect(result.current.tokenStatus).toEqual({ hasToken: false });
	});

	it("refreshTokenStatus re-queries the backend", async () => {
		githubGetTokenStatus.mockResolvedValue({ hasToken: false });
		const { result } = renderHook(() => useGitHub(), { wrapper });

		await waitFor(() => {
			expect(result.current.tokenStatus.hasToken).toBe(false);
		});

		githubGetTokenStatus.mockResolvedValue({
			hasToken: true,
			login: "user2",
		});
		await act(async () => {
			await result.current.refreshTokenStatus();
		});

		expect(result.current.tokenStatus.login).toBe("user2");
	});

	it("setSubType switches to a custom filter", () => {
		githubGetTokenStatus.mockResolvedValue({ hasToken: false });
		const filter: CustomFilter = {
			id: "f1",
			kind: "team-repos",
			name: "My team",
			org: "acme",
			team: "frontend",
		};
		settingsMock.current = { github: { customFilters: [filter] } };
		const { result } = renderHook(() => useGitHub(), { wrapper });

		act(() => {
			result.current.setSubType({ kind: "custom", filter });
		});
		expect(result.current.activeSubType).toEqual({ kind: "custom", filter });
	});

	it("reverts to default subtype when active custom filter is deleted", async () => {
		githubGetTokenStatus.mockResolvedValue({ hasToken: false });
		const filter: CustomFilter = {
			id: "f1",
			kind: "team-repos",
			name: "My team",
			org: "acme",
			team: "frontend",
		};
		settingsMock.current = { github: { customFilters: [filter] } };
		const { result, rerender } = renderHook(() => useGitHub(), { wrapper });

		act(() => {
			result.current.setSubType({ kind: "custom", filter });
		});
		expect(result.current.activeSubType.kind).toBe("custom");

		// Simulate the filter being removed from settings
		settingsMock.current = { github: { customFilters: [] } };
		rerender();

		await waitFor(() => {
			expect(result.current.activeSubType).toEqual({
				kind: "native",
				type: "repos",
			});
		});
	});

	it("setLastSearchCached mirrors the value", () => {
		githubGetTokenStatus.mockResolvedValue({ hasToken: false });
		const { result } = renderHook(() => useGitHub(), { wrapper });
		act(() => result.current.setLastSearchCached(true));
		expect(result.current.lastSearchCached).toBe(true);
	});

	it("useGitHub throws outside provider", () => {
		expect(() => renderHook(() => useGitHub())).toThrow(
			/useGitHub must be used within GitHubProvider/,
		);
	});
});

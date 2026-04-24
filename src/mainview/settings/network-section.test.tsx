import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the RPC boundary — the section drives the UI from rpc.request.*
const getProxyStatusMock = vi.fn();
const reloadProxyFromSystemMock = vi.fn();
const saveManualProxyRpcMock = vi.fn();

vi.mock("../providers/rpc", () => ({
	rpc: {
		request: {
			getProxyStatus: getProxyStatusMock,
			reloadProxyFromSystem: reloadProxyFromSystemMock,
			saveManualProxy: saveManualProxyRpcMock,
		},
	},
	setOpenPreferencesHandler: vi.fn(),
	setClaudeSessionsUpdateHandler: vi.fn(),
}));

const settingsState = vi.hoisted(() => ({
	proxySettings: { mode: "auto" as string },
	updateProxyMode: vi.fn() as ReturnType<typeof vi.fn>,
	saveManualProxy: vi.fn() as ReturnType<typeof vi.fn>,
	clearManualProxy: vi.fn() as ReturnType<typeof vi.fn>,
	testProxyConnection: vi.fn() as ReturnType<typeof vi.fn>,
}));

vi.mock("./settings-context", () => ({
	useSettings: () => settingsState,
}));

const { NetworkSection } = await import("./network-section");

function okStatus(overrides = {}) {
	return {
		mode: "auto",
		source: "scutil",
		httpsProxy: null,
		httpProxy: null,
		noProxyCount: 0,
		resolvedAt: Date.now(),
		...overrides,
	};
}

describe("<NetworkSection />", () => {
	beforeEach(() => {
		getProxyStatusMock.mockReset().mockResolvedValue(okStatus());
		reloadProxyFromSystemMock.mockReset().mockResolvedValue(okStatus());
		settingsState.proxySettings = { mode: "auto" };
		settingsState.updateProxyMode.mockReset();
	});

	it("renders all proxy mode options", async () => {
		render(<NetworkSection />);
		await waitFor(() => {
			expect(getProxyStatusMock).toHaveBeenCalled();
		});
		expect(screen.getByText("Auto")).toBeInTheDocument();
		expect(
			screen.getByText("Sistema (Preferências do macOS)"),
		).toBeInTheDocument();
		expect(screen.getByText("Variáveis de ambiente")).toBeInTheDocument();
		expect(screen.getByText("Manual")).toBeInTheDocument();
		expect(screen.getByText("Sem proxy")).toBeInTheDocument();
	});

	it("marks the persisted mode as selected (aria-pressed=true)", async () => {
		settingsState.proxySettings = { mode: "system" };
		render(<NetworkSection />);
		await waitFor(() => {
			expect(getProxyStatusMock).toHaveBeenCalled();
		});

		const selected = screen.getByRole("button", {
			name: /Sistema \(Preferências do macOS\)/i,
		});
		expect(selected).toHaveAttribute("aria-pressed", "true");
	});

	it("clicking a mode calls updateProxyMode", async () => {
		const user = userEvent.setup();
		render(<NetworkSection />);
		await waitFor(() => {
			expect(getProxyStatusMock).toHaveBeenCalled();
		});

		// The "env" mode button is uniquely identified by its description, which
		// mentions "HTTPS_PROXY" — other buttons don't have this text.
		const envBtn = screen.getByRole("button", { name: /HTTPS_PROXY/i });
		await user.click(envBtn);

		expect(settingsState.updateProxyMode).toHaveBeenCalledWith("env");
	});

	it("loads proxy status on mount", async () => {
		render(<NetworkSection />);
		await waitFor(() => {
			expect(getProxyStatusMock).toHaveBeenCalledTimes(1);
		});
	});

	it("survives a failing getProxyStatus without crashing", async () => {
		getProxyStatusMock.mockRejectedValue(new Error("offline"));
		render(<NetworkSection />);
		// Should still render the mode list even when status RPC fails.
		expect(screen.getByText("Auto")).toBeInTheDocument();
	});
});

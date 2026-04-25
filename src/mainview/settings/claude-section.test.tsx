import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeSection } from "./claude-section";

const claudeGetAuthStatusMock = vi.hoisted(() => vi.fn());
const claudeOpenLoginMock = vi.hoisted(() => vi.fn());
const claudeInstallCliMock = vi.hoisted(() => vi.fn());
const claudeListSessionsMock = vi.hoisted(() => vi.fn());
const claudeListSupportedModelsMock = vi.hoisted(() => vi.fn());
const onAgentEventMock = vi.hoisted(() => vi.fn(() => () => {}));

vi.mock("../providers/rpc", () => ({
	rpc: {
		request: {
			claudeGetAuthStatus: claudeGetAuthStatusMock,
			claudeOpenLogin: claudeOpenLoginMock,
			claudeInstallCli: claudeInstallCliMock,
			claudeListSessions: claudeListSessionsMock,
			claudeListSupportedModels: claudeListSupportedModelsMock,
			loadSettings: vi.fn().mockResolvedValue({ claude: {} }),
			saveSettings: vi.fn().mockResolvedValue(undefined),
			claudeDeleteSession: vi.fn(),
			claudeSetBedrock: vi.fn(),
		},
	},
	onAgentEvent: onAgentEventMock,
}));

vi.mock("./settings-context", () => ({
	useSettings: () => ({
		settings: {
			claude: {
				authMode: "anthropic",
				model: "claude-sonnet-4-6",
				permissionMode: "acceptEdits",
			},
		},
		isOpen: true,
	}),
}));

vi.mock("./mcp-servers", () => ({ McpServersSection: () => null }));

beforeEach(() => {
	claudeGetAuthStatusMock.mockReset();
	claudeOpenLoginMock.mockReset();
	claudeInstallCliMock.mockReset();
	claudeListSessionsMock.mockResolvedValue([]);
	claudeListSupportedModelsMock.mockResolvedValue({ models: [] });
});

afterEach(() => {
	vi.useRealTimers();
});

describe("ClaudeSection — auth states", () => {
	it("renders Install button when CLI is not installed", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "none",
			anthropic: { cliStatus: "not-installed" },
		});
		render(<ClaudeSection />);
		expect(
			await screen.findByRole("button", { name: /Instalar Claude Code/i }),
		).toBeInTheDocument();
	});

	it("renders Connect button when CLI is installed but not authenticated", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "none",
			anthropic: { cliStatus: "not-authenticated" },
		});
		render(<ClaudeSection />);
		expect(
			await screen.findByRole("button", {
				name: /Abrir Claude Code para conectar/i,
			}),
		).toBeInTheDocument();
	});

	it("shows error and resets loading state when install fails", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "none",
			anthropic: { cliStatus: "not-installed" },
		});
		claudeInstallCliMock.mockResolvedValue({
			ok: false,
			error: "Falha ao abrir o Terminal",
		});

		render(<ClaudeSection />);
		const btn = await screen.findByRole("button", {
			name: /Instalar Claude Code/i,
		});
		fireEvent.click(btn);

		await waitFor(() => expect(claudeInstallCliMock).toHaveBeenCalledTimes(1));
		expect(
			await screen.findByText("Falha ao abrir o Terminal"),
		).toBeInTheDocument();
		// button is no longer in loading state — text is back
		expect(
			screen.getByRole("button", { name: /Instalar Claude Code/i }),
		).toBeInTheDocument();
	});

	it("renders connected badge when authenticated", async () => {
		claudeGetAuthStatusMock.mockResolvedValue({
			mode: "anthropic",
			anthropic: { cliStatus: "authenticated" },
		});
		render(<ClaudeSection />);
		expect(
			await screen.findByText(/Conectado via Claude Code/i),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Desconectar/i }),
		).not.toBeInTheDocument();
	});
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ProtocolModelInfo } from "@/shared/agent-protocol";
import { ModelPicker } from "./model-picker";

const MODELS: ProtocolModelInfo[] = [
	{
		value: "claude-sonnet-4-6",
		displayName: "Sonnet 4.6",
		description: "Balanceado",
	},
	{
		value: "claude-opus-4-6",
		displayName: "Opus 4.6",
		description: "Mais capaz",
	},
];

describe("<ModelPicker>", () => {
	test("renders the current value's displayName on the trigger", () => {
		render(
			<ModelPicker
				variant="session"
				value="claude-opus-4-6"
				models={MODELS}
				onChange={() => {}}
			/>,
		);
		expect(
			screen.getByRole("button", { name: /selecionar modelo/i }),
		).toHaveTextContent("Opus 4.6");
	});

	test("opens the dialog and calls onChange when an item is selected", async () => {
		const onChange = vi.fn();
		render(
			<ModelPicker
				variant="session"
				value="claude-sonnet-4-6"
				models={MODELS}
				onChange={onChange}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /selecionar modelo/i }));
		// Dialog open — find the Opus item by accessible name and click it.
		const opusItem = await screen.findByText("Opus 4.6");
		fireEvent.click(opusItem);
		expect(onChange).toHaveBeenCalledWith("claude-opus-4-6");
	});

	test("disables the trigger when `disabled` is true", () => {
		render(
			<ModelPicker
				variant="session"
				value="claude-sonnet-4-6"
				models={MODELS}
				onChange={() => {}}
				disabled
			/>,
		);
		expect(
			screen.getByRole("button", { name: /selecionar modelo/i }),
		).toBeDisabled();
	});

	test("shows loading state when models is empty", () => {
		render(
			<ModelPicker
				variant="session"
				value={null}
				models={[]}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByText(/carregando modelos/i)).toBeInTheDocument();
	});

	test("turn-override variant shows clear button when value differs from sessionDefault", () => {
		const onChange = vi.fn();
		render(
			<ModelPicker
				variant="turn-override"
				value="claude-opus-4-6"
				sessionDefault="claude-sonnet-4-6"
				models={MODELS}
				onChange={onChange}
			/>,
		);
		const clear = screen.getByRole("button", {
			name: /voltar ao modelo da sessão/i,
		});
		fireEvent.click(clear);
		expect(onChange).toHaveBeenCalledWith("claude-sonnet-4-6");
	});

	test("turn-override variant hides clear button when value === sessionDefault", () => {
		render(
			<ModelPicker
				variant="turn-override"
				value="claude-sonnet-4-6"
				sessionDefault="claude-sonnet-4-6"
				models={MODELS}
				onChange={() => {}}
			/>,
		);
		expect(
			screen.queryByRole("button", { name: /voltar ao modelo da sessão/i }),
		).toBeNull();
	});
});

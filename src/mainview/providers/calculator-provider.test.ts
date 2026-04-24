import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculatorProvider } from "./calculator-provider";

describe("calculatorProvider", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "navigator", {
			value: { clipboard: { writeText: vi.fn() } },
			configurable: true,
		});
	});

	it("identifies itself as 'calc'", () => {
		expect(calculatorProvider.id).toBe("calc");
		expect(calculatorProvider.label).toBe("Calc");
	});

	it("returns empty list for empty query", async () => {
		expect(await calculatorProvider.search("")).toEqual([]);
		expect(await calculatorProvider.search("   ")).toEqual([]);
	});

	it("evaluates addition and subtraction", async () => {
		const [res] = await calculatorProvider.search("2 + 3 - 1");
		expect(res.title).toBe("4");
		expect(res.subtitle).toBe("2 + 3 - 1");
	});

	it("respects operator precedence (* and / before + and -)", async () => {
		const [res] = await calculatorProvider.search("2 + 3 * 4");
		expect(res.title).toBe("14");
	});

	it("handles parentheses", async () => {
		const [res] = await calculatorProvider.search("(2 + 3) * 4");
		expect(res.title).toBe("20");
	});

	it("handles unary minus", async () => {
		const [res] = await calculatorProvider.search("-5 + 2");
		expect(res.title).toBe("-3");
	});

	it("handles decimals", async () => {
		const [res] = await calculatorProvider.search("0.1 + 0.2");
		// evaluator formats via toFixed(10) then strips trailing zeros
		expect(res.title).toBe("0.3");
	});

	it("handles modulo", async () => {
		const [res] = await calculatorProvider.search("10 % 3");
		expect(res.title).toBe("1");
	});

	it("division by zero is reported as an invalid expression", async () => {
		const [res] = await calculatorProvider.search("1/0");
		expect(res.id).toBe("calc-error");
	});

	it("0/0 (NaN) is reported as an invalid expression", async () => {
		const [res] = await calculatorProvider.search("0/0");
		expect(res.id).toBe("calc-error");
	});

	it("returns error result for invalid characters", async () => {
		const [res] = await calculatorProvider.search("abc");
		expect(res.id).toBe("calc-error");
		expect(res.title).toBe("Expressão inválida");
	});

	it("returns error result for malformed expression", async () => {
		const [res] = await calculatorProvider.search("2 +");
		expect(res.id).toBe("calc-error");
	});

	it("onSelect writes formatted result to clipboard", async () => {
		const [res] = await calculatorProvider.search("6 * 7");
		const writeText = (
			globalThis.navigator as {
				clipboard: { writeText: ReturnType<typeof vi.fn> };
			}
		).clipboard.writeText;
		res.onSelect();
		expect(writeText).toHaveBeenCalledWith("42");
	});

	it("onSelect of error result is a noop", async () => {
		const [res] = await calculatorProvider.search("??");
		expect(() => res.onSelect()).not.toThrow();
	});
});

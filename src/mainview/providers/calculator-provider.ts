import { Calculator } from "lucide-react";
import type { SearchProvider, SearchResult } from "./types";

function evaluateMath(expr: string): number {
	const cleaned = expr.replace(/\s+/g, "");
	if (!cleaned) throw new Error("Expressão vazia");
	if (!/^[\d+\-*/%().]+$/.test(cleaned)) {
		throw new Error("Caractere inválido");
	}

	const tokens: (number | string)[] = [];
	let i = 0;
	while (i < cleaned.length) {
		if (
			/\d/.test(cleaned[i]) ||
			(cleaned[i] === "." &&
				i + 1 < cleaned.length &&
				/\d/.test(cleaned[i + 1]))
		) {
			let num = "";
			while (
				i < cleaned.length &&
				(/\d/.test(cleaned[i]) || cleaned[i] === ".")
			) {
				num += cleaned[i++];
			}
			tokens.push(parseFloat(num));
		} else {
			tokens.push(cleaned[i++]);
		}
	}

	let pos = 0;

	function parseExpr(): number {
		let left = parseTerm();
		while (
			pos < tokens.length &&
			(tokens[pos] === "+" || tokens[pos] === "-")
		) {
			const op = tokens[pos++];
			const right = parseTerm();
			left = op === "+" ? left + right : left - right;
		}
		return left;
	}

	function parseTerm(): number {
		let left = parseFactor();
		while (
			pos < tokens.length &&
			(tokens[pos] === "*" || tokens[pos] === "/" || tokens[pos] === "%")
		) {
			const op = tokens[pos++];
			const right = parseFactor();
			if (op === "*") left *= right;
			else if (op === "/") left /= right;
			else left %= right;
		}
		return left;
	}

	function parseFactor(): number {
		if (tokens[pos] === "-") {
			pos++;
			return -parseFactor();
		}
		if (tokens[pos] === "(") {
			pos++;
			const val = parseExpr();
			pos++;
			return val;
		}
		if (typeof tokens[pos] === "number") {
			return tokens[pos++] as number;
		}
		throw new Error("Expressão inválida");
	}

	const result = parseExpr();
	if (pos < tokens.length) throw new Error("Expressão inválida");
	return result;
}

function formatResult(n: number): string {
	if (Number.isInteger(n)) return String(n);
	return parseFloat(n.toFixed(10)).toString();
}

export const calculatorProvider: SearchProvider = {
	id: "calc",
	label: "Calc",
	icon: Calculator,
	placeholder: "Digite uma expressão (ex: 245 * 3 + 17)...",
	search: async (query: string): Promise<SearchResult[]> => {
		if (!query.trim()) return [];

		try {
			const result = evaluateMath(query);
			if (!Number.isFinite(result)) {
				throw new Error("Resultado não é finito");
			}
			const formatted = formatResult(result);
			return [
				{
					id: "calc-result",
					title: formatted,
					subtitle: query,
					onSelect: () => {
						navigator.clipboard.writeText(formatted);
					},
				},
			];
		} catch {
			return [
				{
					id: "calc-error",
					title: "Expressão inválida",
					subtitle: "Suporta: + - * / % ( )",
					onSelect: () => {},
				},
			];
		}
	},
};

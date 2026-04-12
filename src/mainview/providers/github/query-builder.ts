import type { GitHubSearchType } from "../rpc";
import {
	QUALIFIER_REGISTRY,
	type QualifierValue,
	type QualifierValues,
} from "./qualifier-registry";

/**
 * Build a GitHub search query string from structured qualifier values.
 */
export function buildQuery(
	type: GitHubSearchType,
	values: QualifierValues,
): string {
	const defs = QUALIFIER_REGISTRY[type];
	const parts: string[] = [];

	for (const def of defs) {
		const val = values.get(def.key);
		if (val == null || val === "") continue;
		if (typeof val === "object" && val.value === "") continue;
		parts.push(def.toQuery(val));
	}

	return parts.join(" ");
}

/**
 * Parse a raw GitHub search query string into structured qualifier values.
 * Unrecognised tokens are collected into a "remainder" key.
 */
export function parseQuery(
	type: GitHubSearchType,
	raw: string,
): { values: QualifierValues; remainder: string } {
	const defs = QUALIFIER_REGISTRY[type];
	const values: QualifierValues = new Map<string, QualifierValue>();
	let remaining = raw.trim();

	for (const def of defs) {
		const match = remaining.match(def.pattern);
		if (match) {
			values.set(def.key, def.parseValue(match));
			remaining = remaining.replace(match[0], "").trim();
		}
	}

	// Collapse extra whitespace
	const remainder = remaining.replace(/\s+/g, " ").trim();

	return { values, remainder };
}

/**
 * Risk classifier for tool invocations. Runs before the HITL gate and
 * controls whether `always-allow-this-session` whitelist hits can bypass the
 * prompt. Dangerous tools always prompt — the whitelist is ignored for them.
 */

export type RiskLevel = "safe" | "caution" | "dangerous";

export interface RiskClassification {
	level: RiskLevel;
	/** When true, whitelist entries are ignored and the user must re-approve every time. */
	bypassWhitelist: boolean;
	reason?: string;
}

// Any command matching these regexes is classified as dangerous — even if
// the user previously granted always-allow for Bash.
const DANGEROUS_BASH_PATTERNS: readonly { pattern: RegExp; reason: string }[] =
	[
		{ pattern: /\brm\s+-[rRf]+\b/, reason: "rm recursivo ou força" },
		{ pattern: /\bsudo\b/, reason: "sudo requer privilégios elevados" },
		{
			pattern: /\bcurl\s+[^|]*\|\s*(?:ba)?sh\b/,
			reason: "curl | sh executa script remoto",
		},
		{
			pattern: /\bwget\s+[^|]*\|\s*(?:ba)?sh\b/,
			reason: "wget | sh executa script remoto",
		},
		{ pattern: /\bdd\s+if=/, reason: "dd pode corromper disco" },
		{ pattern: /\bmkfs\b/, reason: "mkfs formata partição" },
		{ pattern: /:\s*\(\s*\)\s*\{.*\}\s*;/, reason: "fork bomb" },
		{ pattern: />\s*\/dev\/sd[a-z]/, reason: "escreve direto em block device" },
		{ pattern: /\bchmod\s+-?[0-7]*7\d\d\b/, reason: "chmod world-writable" },
	];

function isRecordWithString(
	value: unknown,
	key: string,
): value is Record<string, string> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Record<string, unknown>)[key] === "string"
	);
}

export function classifyRisk(
	toolName: string,
	args: unknown,
): RiskClassification {
	if (toolName === "Bash") {
		if (isRecordWithString(args, "command")) {
			for (const { pattern, reason } of DANGEROUS_BASH_PATTERNS) {
				if (pattern.test(args.command)) {
					return {
						level: "dangerous",
						bypassWhitelist: true,
						reason,
					};
				}
			}
		}
		return { level: "caution", bypassWhitelist: false };
	}

	// Third-party MCP tools always prompt — we don't know what they do.
	if (toolName.startsWith("mcp__")) {
		return {
			level: "dangerous",
			bypassWhitelist: true,
			reason: "Ferramenta de servidor MCP externo",
		};
	}

	// Write/Edit are gated separately by the caller once it has cwd in context.
	if (toolName === "Write" || toolName === "Edit") {
		return { level: "caution", bypassWhitelist: false };
	}

	// Read-only default: safe.
	return { level: "safe", bypassWhitelist: false };
}

interface TurnMetaProps {
	cost?: number;
	durationMs?: number;
	tokenUsage?: { input: number; output: number };
}

function formatTokens(n: number): string {
	if (n >= 1000) {
		return `${(n / 1000).toFixed(1)}k`;
	}
	return String(n);
}

function formatDuration(ms: number): string {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	return `${Math.round(ms)}ms`;
}

export function TurnMeta({ cost, durationMs, tokenUsage }: TurnMetaProps) {
	const parts: string[] = [];

	if (cost != null) {
		parts.push(`$${cost.toFixed(3)}`);
	}

	if (durationMs != null) {
		parts.push(formatDuration(durationMs));
	}

	if (tokenUsage) {
		parts.push(
			`${formatTokens(tokenUsage.input)} in / ${formatTokens(tokenUsage.output)} out`,
		);
	}

	if (parts.length === 0) return null;

	return (
		<div className="my-1 text-center text-[10px] text-muted-foreground/40">
			{parts.join(" \u2022 ")}
		</div>
	);
}

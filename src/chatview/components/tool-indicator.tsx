interface ToolIndicatorProps {
	toolName: string;
	status: "running" | "done" | "error";
	detail?: string;
}

const TOOL_ICONS: Record<string, string> = {
	Read: "\u{1F4C4}",
	Write: "\u{1F4DD}",
	Edit: "\u26A1",
	Bash: "\u{1F5A5}\uFE0F",
	Glob: "\u{1F50D}",
	Grep: "\u{1F50D}",
	LS: "\u{1F4C1}",
};

export function ToolIndicator({
	toolName,
	status,
	detail,
}: ToolIndicatorProps) {
	const icon = TOOL_ICONS[toolName] ?? "\u{1F527}";
	const statusLabel =
		status === "running" ? "..." : status === "error" ? " \u2717" : "";

	return (
		<div className="my-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
			<span>{icon}</span>
			<span className={status === "running" ? "animate-pulse" : ""}>
				{toolName}
				{detail ? ` ${detail}` : ""}
				{statusLabel}
			</span>
		</div>
	);
}

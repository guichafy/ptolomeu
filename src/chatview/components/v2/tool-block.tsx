import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	Loader2,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AgentToolPart } from "../../hooks/agent-state";

function statusIcon(status: AgentToolPart["status"]) {
	switch (status) {
		case "completed":
			return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
		case "error":
			return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
		case "running":
			return (
				<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
			);
		default:
			return <Wrench className="h-3.5 w-3.5 text-muted-foreground" />;
	}
}

function formatArgs(part: AgentToolPart): string {
	if (part.args !== undefined) {
		try {
			return JSON.stringify(part.args, null, 2);
		} catch {
			return String(part.args);
		}
	}
	return part.argsStreaming || "";
}

function formatResult(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function ToolBlock({ part }: { part: AgentToolPart }) {
	const [open, setOpen] = useState(part.status === "error");
	const args = formatArgs(part);
	const result =
		part.status === "error"
			? (part.error?.message ?? "")
			: formatResult(part.result);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"rounded-md border border-border/60 bg-muted/30 text-xs",
				part.status === "error" && "border-destructive/40",
			)}
		>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-2 px-3 py-2 text-left",
					"[&[data-state=open]_svg.chev]:rotate-180",
				)}
			>
				{statusIcon(part.status)}
				<span className="font-mono text-[11px] font-semibold">
					{part.toolName}
				</span>
				{typeof part.elapsedSeconds === "number" &&
					part.status === "running" && (
						<span className="text-[10px] text-muted-foreground">
							{part.elapsedSeconds.toFixed(1)}s
						</span>
					)}
				<span className="flex-1" />
				<ChevronDown className="chev h-3.5 w-3.5 text-muted-foreground transition-transform" />
			</CollapsibleTrigger>
			<CollapsibleContent className="border-t border-border/60 px-3 py-2 font-mono text-[11px] leading-relaxed">
				{args && (
					<div className="mb-2">
						<div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
							Argumentos
						</div>
						<pre className="whitespace-pre-wrap text-foreground/90">{args}</pre>
					</div>
				)}
				{result && (
					<div>
						<div
							className={cn(
								"mb-1 text-[10px] uppercase tracking-wide",
								part.status === "error"
									? "text-destructive"
									: "text-muted-foreground",
							)}
						>
							{part.status === "error" ? "Erro" : "Resultado"}
						</div>
						<pre
							className={cn(
								"whitespace-pre-wrap",
								part.status === "error"
									? "text-destructive"
									: "text-foreground/90",
							)}
						>
							{result}
						</pre>
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

import {
	Check,
	ChevronRight,
	FileEdit,
	FilePlus,
	FileText,
	FolderOpen,
	Loader2,
	Search,
	Terminal,
	Wrench,
	X,
} from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolUseBlockProps {
	name: string;
	input: unknown;
	status: "running" | "done" | "error";
	elapsedSeconds?: number;
}

const TOOL_ICONS: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	Read: FileText,
	Write: FilePlus,
	Edit: FileEdit,
	Bash: Terminal,
	Glob: Search,
	Grep: Search,
	LS: FolderOpen,
};

function StatusIcon({ status }: { status: "running" | "done" | "error" }) {
	switch (status) {
		case "running":
			return <Loader2 className="h-3 w-3 shrink-0 animate-spin" />;
		case "done":
			return <Check className="h-3 w-3 shrink-0 text-green-500" />;
		case "error":
			return <X className="h-3 w-3 shrink-0 text-destructive" />;
	}
}

export function ToolUseBlock({
	name,
	input,
	status,
	elapsedSeconds,
}: ToolUseBlockProps) {
	const [open, setOpen] = useState(false);
	const ToolIcon = TOOL_ICONS[name] ?? Wrench;

	const elapsedLabel =
		status === "running" && elapsedSeconds != null
			? ` (${Math.round(elapsedSeconds)}s)`
			: "";

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className="my-1">
				<CollapsibleTrigger
					className={cn(
						"flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-muted/50",
						status === "error" ? "text-destructive" : "text-muted-foreground",
					)}
				>
					<ChevronRight
						className={cn(
							"h-2.5 w-2.5 shrink-0 transition-transform duration-200",
							open && "rotate-90",
						)}
					/>
					<StatusIcon status={status} />
					<ToolIcon className="h-3 w-3 shrink-0" />
					<span>
						{name}
						{elapsedLabel}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="ml-6 mt-1 max-h-[200px] overflow-auto rounded border border-border/30 bg-muted/20 p-2">
						<pre className="whitespace-pre-wrap text-[10px] text-muted-foreground/70 font-mono">
							{typeof input === "string"
								? input
								: JSON.stringify(input, null, 2)}
						</pre>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

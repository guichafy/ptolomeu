import { AlertCircle, ChevronRight, FileOutput } from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolResultBlockProps {
	content: string;
	isError?: boolean;
}

export function ToolResultBlock({ content, isError }: ToolResultBlockProps) {
	const [open, setOpen] = useState(false);

	const Icon = isError ? AlertCircle : FileOutput;
	const label = isError ? "Erro" : "Resultado";

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className="my-1">
				<CollapsibleTrigger
					className={cn(
						"flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-muted/50",
						isError ? "text-destructive" : "text-muted-foreground",
					)}
				>
					<ChevronRight
						className={cn(
							"h-2.5 w-2.5 shrink-0 transition-transform duration-200",
							open && "rotate-90",
						)}
					/>
					<Icon className="h-3 w-3 shrink-0" />
					<span>{label}</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div
						className={cn(
							"ml-6 mt-1 max-h-[300px] overflow-auto rounded border p-2",
							isError
								? "border-destructive/40 bg-destructive/10"
								: "border-border/30 bg-muted/20",
						)}
					>
						<pre
							className={cn(
								"whitespace-pre-wrap text-[10px] font-mono",
								isError ? "text-destructive" : "text-muted-foreground/70",
							)}
						>
							{content}
						</pre>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

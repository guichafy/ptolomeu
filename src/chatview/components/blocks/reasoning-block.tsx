import { Brain, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ReasoningBlockProps {
	thinking: string;
	durationMs?: number;
	isStreaming?: boolean;
}

export function ReasoningBlock({
	thinking,
	durationMs,
	isStreaming,
}: ReasoningBlockProps) {
	const [open, setOpen] = useState(isStreaming ?? false);

	const durationLabel = durationMs ? `${Math.round(durationMs / 1000)}s` : null;

	const headerText = isStreaming
		? "Pensando..."
		: `Raciocínio${durationLabel ? ` (${durationLabel})` : ""}`;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className="my-2 rounded-md bg-muted/30 border border-border/30">
				<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
					<ChevronRight
						className={cn(
							"h-3 w-3 shrink-0 transition-transform duration-200",
							open && "rotate-90",
						)}
					/>
					<Brain className="h-3 w-3 shrink-0" />
					<span className={cn(isStreaming && "animate-pulse")}>
						{headerText}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="max-h-[300px] overflow-auto border-t border-border/20 px-3 py-2">
						<p className="whitespace-pre-wrap text-xs text-muted-foreground/80 leading-relaxed">
							{thinking}
						</p>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

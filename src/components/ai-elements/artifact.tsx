/**
 * AI Elements `Artifact` — collapsible container for long tool output or
 * generated files. API mirrors https://elements.ai-sdk.dev/r/artifact.json.
 */

import { ChevronDown, FileText } from "lucide-react";
import { type ComponentProps, forwardRef, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface ArtifactProps extends ComponentProps<typeof Collapsible> {
	title: string;
	subtitle?: string;
	defaultOpen?: boolean;
}

export const Artifact = forwardRef<HTMLDivElement, ArtifactProps>(
	(
		{ title, subtitle, defaultOpen = false, className, children, ...props },
		ref,
	) => {
		const [open, setOpen] = useState(defaultOpen);
		return (
			<Collapsible
				ref={ref}
				open={open}
				onOpenChange={setOpen}
				className={cn(
					"rounded-md border border-border/60 bg-muted/20",
					className,
				)}
				{...props}
			>
				<CollapsibleTrigger
					className={cn(
						"flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
						"[&[data-state=open]_svg.chev]:rotate-180",
					)}
				>
					<FileText className="h-3.5 w-3.5 text-muted-foreground" />
					<div className="flex flex-1 flex-col gap-0.5">
						<span className="font-medium">{title}</span>
						{subtitle && (
							<span className="text-[10px] text-muted-foreground">
								{subtitle}
							</span>
						)}
					</div>
					<ChevronDown className="chev h-3.5 w-3.5 text-muted-foreground transition-transform" />
				</CollapsibleTrigger>
				<CollapsibleContent className="border-t border-border/60 p-2">
					{children}
				</CollapsibleContent>
			</Collapsible>
		);
	},
);
Artifact.displayName = "Artifact";

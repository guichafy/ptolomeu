/**
 * AI Elements `Reasoning` — collapsible block for extended thinking output.
 * API mirrors https://elements.ai-sdk.dev/r/reasoning.json.
 */

import { Brain, ChevronDown } from "lucide-react";
import {
	type ComponentProps,
	createContext,
	forwardRef,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ReasoningContextValue = {
	isStreaming: boolean;
	durationMs?: number;
};

const ReasoningContext = createContext<ReasoningContextValue>({
	isStreaming: false,
});

export interface ReasoningProps extends ComponentProps<typeof Collapsible> {
	isStreaming?: boolean;
	durationMs?: number;
	defaultOpen?: boolean;
}

export const Reasoning = forwardRef<HTMLDivElement, ReasoningProps>(
	(
		{
			isStreaming = false,
			durationMs,
			defaultOpen,
			className,
			children,
			...props
		},
		ref,
	) => {
		// Auto-open while streaming; collapse when streaming ends unless user
		// has toggled it open/closed themselves (controlled variant).
		const [open, setOpen] = useState<boolean>(defaultOpen ?? isStreaming);
		const [userToggled, setUserToggled] = useState(false);

		useEffect(() => {
			if (userToggled) return;
			setOpen(isStreaming);
		}, [isStreaming, userToggled]);

		return (
			<ReasoningContext.Provider value={{ isStreaming, durationMs }}>
				<Collapsible
					ref={ref}
					open={open}
					onOpenChange={(value) => {
						setUserToggled(true);
						setOpen(value);
					}}
					className={cn(
						"rounded-md border border-border/60 bg-muted/30 text-xs",
						className,
					)}
					{...props}
				>
					{children}
				</Collapsible>
			</ReasoningContext.Provider>
		);
	},
);
Reasoning.displayName = "Reasoning";

export const ReasoningTrigger = forwardRef<
	HTMLButtonElement,
	ComponentProps<typeof CollapsibleTrigger>
>(({ className, children, ...props }, ref) => {
	const { isStreaming, durationMs } = useContext(ReasoningContext);
	const label = isStreaming
		? "Pensando..."
		: typeof durationMs === "number"
			? `Raciocinou por ${(durationMs / 1000).toFixed(1)}s`
			: "Raciocínio";
	return (
		<CollapsibleTrigger
			ref={ref}
			className={cn(
				"flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-muted-foreground transition-colors hover:text-foreground",
				"[&[data-state=open]_svg.chev]:rotate-180",
				className,
			)}
			{...props}
		>
			<Brain className="h-3.5 w-3.5" />
			<span className="flex-1">{children ?? label}</span>
			<ChevronDown className="chev h-3.5 w-3.5 transition-transform" />
		</CollapsibleTrigger>
	);
});
ReasoningTrigger.displayName = "ReasoningTrigger";

export const ReasoningContent = forwardRef<
	HTMLDivElement,
	ComponentProps<typeof CollapsibleContent>
>(({ className, children, ...props }, ref) => (
	<CollapsibleContent
		ref={ref}
		className={cn(
			"border-t border-border/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap",
			className,
		)}
		{...props}
	>
		{children}
	</CollapsibleContent>
));
ReasoningContent.displayName = "ReasoningContent";

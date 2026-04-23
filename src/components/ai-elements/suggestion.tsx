/**
 * AI Elements `Suggestion` + `Suggestions` — horizontally-scrolling chip row
 * surfaced above the composer. API mirrors
 * https://elements.ai-sdk.dev/r/suggestion.json.
 */

import { type ComponentProps, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SuggestionsProps extends ComponentProps<"div"> {}

export const Suggestions = forwardRef<HTMLDivElement, SuggestionsProps>(
	({ className, children, ...props }, ref) => (
		<div
			ref={ref}
			className={cn(
				"flex w-full gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	),
);
Suggestions.displayName = "Suggestions";

export interface SuggestionProps extends ComponentProps<typeof Button> {
	suggestion: string;
	onSuggestionClick?: (suggestion: string) => void;
}

export const Suggestion = forwardRef<HTMLButtonElement, SuggestionProps>(
	({ suggestion, onSuggestionClick, className, onClick, ...props }, ref) => (
		<Button
			ref={ref}
			type="button"
			variant="outline"
			size="sm"
			onClick={(e) => {
				onClick?.(e);
				if (!e.defaultPrevented) onSuggestionClick?.(suggestion);
			}}
			className={cn(
				"shrink-0 rounded-full text-xs font-normal text-muted-foreground hover:text-foreground",
				className,
			)}
			{...props}
		>
			{suggestion}
		</Button>
	),
);
Suggestion.displayName = "Suggestion";

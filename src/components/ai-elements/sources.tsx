/**
 * AI Elements `Sources` + `InlineCitation` — chip row and inline link badge
 * for search/fetch tool results. API mirrors
 * https://elements.ai-sdk.dev/r/sources.json and
 * https://elements.ai-sdk.dev/r/inline-citation.json.
 */

import { ExternalLink } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface SourcesProps extends ComponentProps<"div"> {}

export const Sources = forwardRef<HTMLDivElement, SourcesProps>(
	({ className, children, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="sources"
			className={cn(
				"flex flex-wrap gap-1.5 text-[11px] text-muted-foreground",
				className,
			)}
			{...props}
		>
			<span className="mr-1 text-[10px] uppercase tracking-wide">Fontes:</span>
			{children}
		</div>
	),
);
Sources.displayName = "Sources";

export interface SourceProps extends ComponentProps<"a"> {
	href: string;
	title?: string;
}

export const Source = forwardRef<HTMLAnchorElement, SourceProps>(
	({ href, title, className, children, ...props }, ref) => {
		let hostname = href;
		try {
			hostname = new URL(href).hostname.replace(/^www\./, "");
		} catch {
			// Keep original href as display if URL parsing fails.
		}
		return (
			<a
				ref={ref}
				href={href}
				target="_blank"
				rel="noreferrer noopener"
				className={cn(
					"inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10.5px] text-foreground/80 transition-colors hover:border-primary/50 hover:text-foreground",
					className,
				)}
				title={title ?? href}
				{...props}
			>
				<ExternalLink className="h-2.5 w-2.5" />
				<span className="max-w-[160px] truncate">{children ?? hostname}</span>
			</a>
		);
	},
);
Source.displayName = "Source";

export interface InlineCitationProps extends ComponentProps<"a"> {
	href: string;
	index: number;
}

export const InlineCitation = forwardRef<
	HTMLAnchorElement,
	InlineCitationProps
>(({ href, index, className, ...props }, ref) => (
	<a
		ref={ref}
		href={href}
		target="_blank"
		rel="noreferrer noopener"
		className={cn(
			"mx-0.5 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-sm border border-border/60 bg-muted px-1 align-super text-[9px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground",
			className,
		)}
		{...props}
	>
		{index}
	</a>
));
InlineCitation.displayName = "InlineCitation";

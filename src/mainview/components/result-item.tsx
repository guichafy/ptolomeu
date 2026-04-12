import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { SearchResult } from "../providers/types";

interface ResultItemProps {
	result: SearchResult;
	isSelected: boolean;
}

export function ResultItem({ result, isSelected }: ResultItemProps) {
	const ref = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (isSelected) {
			ref.current?.scrollIntoView({ block: "nearest" });
		}
	}, [isSelected]);

	return (
		<button
			ref={ref}
			type="button"
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 w-full text-left rounded-md transition-colors",
				isSelected ? "bg-accent" : "hover:bg-accent/50",
			)}
			onClick={result.onSelect}
		>
			{result.icon && (
				<span className="shrink-0 text-muted-foreground">{result.icon}</span>
			)}
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate">
					{result.title}
				</p>
				{result.subtitle && (
					<p className="text-xs text-muted-foreground truncate mt-0.5">
						{result.subtitle}
					</p>
				)}
			</div>
			{result.badge && (
				<span className="text-xs text-muted-foreground shrink-0">
					{result.badge}
				</span>
			)}
		</button>
	);
}

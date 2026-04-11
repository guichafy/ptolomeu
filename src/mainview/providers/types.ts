import type { ComponentType, ReactNode, SVGProps } from "react";

export type IconComponent = ComponentType<
	SVGProps<SVGSVGElement> & { className?: string }
>;

export interface SearchResult {
	id: string;
	title: string;
	subtitle?: string;
	icon?: ReactNode;
	badge?: string;
	onSelect: () => void;
}

export interface SearchProvider<TContext = void> {
	id: string;
	label: string;
	icon: IconComponent;
	placeholder: string;
	useSearchContext?: () => TContext;
	search: (
		query: string,
		signal?: AbortSignal,
		context?: TContext,
	) => Promise<SearchResult[]>;
}

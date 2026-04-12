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

export interface SearchProvider {
	id: string;
	label: string;
	icon: IconComponent;
	placeholder: string;
	useSearchContext?: () => unknown;
	search: (
		query: string,
		signal?: AbortSignal,
		context?: unknown,
	) => Promise<SearchResult[]>;
	configComponent?: ComponentType;
}

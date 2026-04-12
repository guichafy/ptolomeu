import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toSearchResult } from "../providers/github/renderers";
import { useDebouncedSearch } from "../providers/github/use-debounced-search";
import type { GitHubSearchType } from "../providers/rpc";

interface Props {
	query: string;
	baseType: GitHubSearchType;
	onQueryEdit: (raw: string) => void;
}

export function QueryPreview({ query, baseType, onQueryEdit }: Props) {
	const searchArgs = query.trim()
		? {
				subType: { kind: "native" as const, type: baseType },
				query: query.trim(),
			}
		: null;

	const { items, loading, error } = useDebouncedSearch(searchArgs, 500);

	const [rawEdit, setRawEdit] = useState(query);
	const [isEditing, setIsEditing] = useState(false);

	useEffect(() => {
		if (!isEditing) {
			setRawEdit(query);
		}
	}, [query, isEditing]);

	function handleRawBlur() {
		setIsEditing(false);
		if (rawEdit !== query) {
			onQueryEdit(rawEdit);
		}
	}

	function handleRawKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			(e.target as HTMLInputElement).blur();
		}
	}

	const results = items.slice(0, 4).map(toSearchResult);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
				Preview
			</div>

			{/* Query editable */}
			<div className="rounded-md border border-border/50 bg-background p-2">
				<div className="mb-1 flex items-center justify-between">
					<span className="text-[10px] text-foreground/50">Query</span>
					<span className="text-[10px] text-blue-400/70">editável</span>
				</div>
				<input
					type="text"
					className="w-full bg-transparent font-mono text-xs text-green-400 outline-none placeholder:text-muted-foreground"
					value={rawEdit}
					onChange={(e) => {
						setRawEdit(e.target.value);
						setIsEditing(true);
					}}
					onBlur={handleRawBlur}
					onKeyDown={handleRawKeyDown}
					placeholder="Adicione qualifiers..."
				/>
			</div>

			{/* Results preview */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background p-2">
				<div className="mb-1 flex items-center justify-between">
					<span className="text-[10px] text-foreground/50">
						{loading
							? "Buscando..."
							: items.length > 0
								? `Resultados (${items.length})`
								: "Resultados"}
					</span>
				</div>

				{loading && (
					<div className="flex flex-1 items-center justify-center py-4">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
					</div>
				)}

				{error && (
					<div className="py-2 text-[11px] text-destructive">{error}</div>
				)}

				{!loading && !error && results.length === 0 && query.trim() && (
					<div className="flex flex-1 items-center justify-center py-4 text-[11px] text-muted-foreground">
						Nenhum resultado
					</div>
				)}

				{!loading && !error && results.length === 0 && !query.trim() && (
					<div className="flex flex-1 items-center justify-center py-4 text-[11px] text-muted-foreground">
						Adicione qualifiers para ver preview
					</div>
				)}

				{!loading && results.length > 0 && (
					<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
						{results.map((r) => (
							<div
								key={r.id}
								className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px]"
							>
								<span className="shrink-0 text-muted-foreground">{r.icon}</span>
								<span className="truncate text-blue-400">{r.title}</span>
							</div>
						))}
						{items.length > 4 && (
							<div className="pt-0.5 text-center text-[10px] text-muted-foreground">
								+{items.length - 4} resultados
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

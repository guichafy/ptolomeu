import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toSearchResult } from "../providers/github/renderers";
import type { GitHubItem, GitHubSearchType } from "../providers/rpc";
import { rpc } from "../providers/rpc";

interface Props {
	query: string;
	baseType: GitHubSearchType;
	onQueryEdit: (raw: string) => void;
}

interface PreviewState {
	items: GitHubItem[];
	loading: boolean;
	error: string | null;
	elapsed: number | null;
}

export function QueryPreview({ query, baseType, onQueryEdit }: Props) {
	const [state, setState] = useState<PreviewState>({
		items: [],
		loading: false,
		error: null,
		elapsed: null,
	});
	const [rawEdit, setRawEdit] = useState(query);
	const [isEditing, setIsEditing] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Sync external query → local raw edit (when not actively editing)
	useEffect(() => {
		if (!isEditing) {
			setRawEdit(query);
		}
	}, [query, isEditing]);

	// Debounced search
	useEffect(() => {
		let cancelled = false;

		if (!query.trim()) {
			setState({ items: [], loading: false, error: null, elapsed: null });
			return;
		}

		setState((s) => ({ ...s, loading: true, error: null }));

		if (timerRef.current) clearTimeout(timerRef.current);

		timerRef.current = setTimeout(async () => {
			const start = performance.now();
			try {
				const result = await rpc.request.githubFetchSearch({
					subType: { kind: "native", type: baseType },
					query: query.trim(),
				});
				if (!cancelled) {
					setState({
						items: result.items,
						loading: false,
						error: null,
						elapsed: Math.round(performance.now() - start),
					});
				}
			} catch (err) {
				if (!cancelled) {
					setState({
						items: [],
						loading: false,
						error: err instanceof Error ? err.message : "Erro na busca",
						elapsed: null,
					});
				}
			}
		}, 500);

		return () => {
			cancelled = true;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [query, baseType]);

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

	const results = state.items.slice(0, 4).map(toSearchResult);

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
						{state.loading
							? "Buscando..."
							: state.items.length > 0
								? `Resultados (${state.items.length})`
								: "Resultados"}
					</span>
					{state.elapsed != null && (
						<span className="text-[10px] text-amber-400/80">
							{state.elapsed}ms
						</span>
					)}
				</div>

				{state.loading && (
					<div className="flex flex-1 items-center justify-center py-4">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
					</div>
				)}

				{state.error && (
					<div className="py-2 text-[11px] text-destructive">{state.error}</div>
				)}

				{!state.loading &&
					!state.error &&
					results.length === 0 &&
					query.trim() && (
						<div className="flex flex-1 items-center justify-center py-4 text-[11px] text-muted-foreground">
							Nenhum resultado
						</div>
					)}

				{!state.loading &&
					!state.error &&
					results.length === 0 &&
					!query.trim() && (
						<div className="flex flex-1 items-center justify-center py-4 text-[11px] text-muted-foreground">
							Adicione qualifiers para ver preview
						</div>
					)}

				{!state.loading && results.length > 0 && (
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
						{state.items.length > 4 && (
							<div className="pt-0.5 text-center text-[10px] text-muted-foreground">
								+{state.items.length - 4} resultados
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

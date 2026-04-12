import { BookMarked, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GitHubItem } from "../providers/rpc";
import { rpc } from "../providers/rpc";

interface Props {
	org: string;
	team: string;
}

interface PreviewState {
	items: GitHubItem[];
	loading: boolean;
	error: string | null;
}

export function TeamReposPreview({ org, team }: Props) {
	const [state, setState] = useState<PreviewState>({
		items: [],
		loading: false,
		error: null,
	});
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;

		if (!org.trim() || !team.trim()) {
			setState({ items: [], loading: false, error: null });
			return;
		}

		setState((s) => ({ ...s, loading: true, error: null }));

		if (timerRef.current) clearTimeout(timerRef.current);

		timerRef.current = setTimeout(async () => {
			try {
				const result = await rpc.request.githubFetchSearch({
					subType: {
						kind: "custom",
						filter: {
							id: "_preview",
							kind: "team-repos",
							name: "preview",
							org: org.trim(),
							team: team.trim(),
						},
					},
					query: "",
				});
				if (!cancelled) {
					setState({ items: result.items, loading: false, error: null });
				}
			} catch (err) {
				if (!cancelled) {
					setState({
						items: [],
						loading: false,
						error: err instanceof Error ? err.message : "Erro ao buscar repos",
					});
				}
			}
		}, 800);

		return () => {
			cancelled = true;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [org, team]);

	if (!org.trim() || !team.trim()) {
		return (
			<div className="rounded-md border border-border/30 px-3 py-4 text-center text-[11px] text-foreground/40">
				Preencha organização e team para ver preview
			</div>
		);
	}

	return (
		<div className="rounded-md border border-border/30 p-2">
			<div className="mb-1.5 flex items-center justify-between">
				<span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
					Preview
				</span>
				{!state.loading && state.items.length > 0 && (
					<span className="text-[10px] text-foreground/40">
						{state.items.length} repos
					</span>
				)}
			</div>

			{state.loading && (
				<div className="flex items-center justify-center py-3">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			)}

			{state.error && (
				<div className="py-2 text-[11px] text-destructive">{state.error}</div>
			)}

			{!state.loading && !state.error && state.items.length === 0 && (
				<div className="py-2 text-center text-[11px] text-foreground/40">
					Nenhum repo encontrado
				</div>
			)}

			{!state.loading && state.items.length > 0 && (
				<div className="flex flex-col gap-0.5">
					{state.items.slice(0, 4).map((item) => (
						<div
							key={item.id}
							className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px]"
						>
							<BookMarked className="h-3 w-3 shrink-0 text-muted-foreground" />
							<span className="truncate text-blue-400">
								{item.kind === "repo" ? item.fullName : ""}
							</span>
						</div>
					))}
					{state.items.length > 4 && (
						<div className="pt-0.5 text-center text-[10px] text-muted-foreground">
							+{state.items.length - 4} repos
						</div>
					)}
				</div>
			)}
		</div>
	);
}

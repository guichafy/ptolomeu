import { BookMarked, Loader2 } from "lucide-react";
import { useDebouncedSearch } from "../providers/github/use-debounced-search";

interface Props {
	org: string;
	team: string;
}

export function TeamReposPreview({ org, team }: Props) {
	const ready = org.trim() !== "" && team.trim() !== "";

	const searchArgs = ready
		? {
				subType: {
					kind: "custom" as const,
					filter: {
						id: "_preview",
						kind: "team-repos" as const,
						name: "preview",
						org: org.trim(),
						team: team.trim(),
					},
				},
				query: "",
			}
		: null;

	const { items, loading, error } = useDebouncedSearch(searchArgs, 800);

	if (!ready) {
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
				{!loading && items.length > 0 && (
					<span className="text-[10px] text-foreground/40">
						{items.length} repos
					</span>
				)}
			</div>

			{loading && (
				<div className="flex items-center justify-center py-3">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			)}

			{error && (
				<div className="py-2 text-[11px] text-destructive">{error}</div>
			)}

			{!loading && !error && items.length === 0 && (
				<div className="py-2 text-center text-[11px] text-foreground/40">
					Nenhum repo encontrado
				</div>
			)}

			{!loading && items.length > 0 && (
				<div className="flex flex-col gap-0.5">
					{items.slice(0, 4).map((item) => (
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
					{items.length > 4 && (
						<div className="pt-0.5 text-center text-[10px] text-muted-foreground">
							+{items.length - 4} repos
						</div>
					)}
				</div>
			)}
		</div>
	);
}

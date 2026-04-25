import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "../components/emoji-picker";
import { QueryBuilderPanel } from "../components/query-builder-panel";
import { TeamReposPreview } from "../components/team-repos-preview";
import type { CustomFilter, GitHubSearchType } from "../providers/github/types";
import { rpc } from "../providers/rpc";

const SETTINGS_HEIGHT = 760;
const SETTINGS_WIDTH = 1080;
const FILTER_DIALOG_HEIGHT_TEAM = 740;
const FILTER_DIALOG_HEIGHT_SEARCH = 780;

interface Props {
	open: boolean;
	initial?: CustomFilter;
	onClose: () => void;
	onSave: (filter: CustomFilter) => void;
}

type Kind = "team-repos" | "search";

const BASE_TYPES: { value: GitHubSearchType; label: string }[] = [
	{ value: "repos", label: "Repos" },
	{ value: "code", label: "Code" },
	{ value: "issues", label: "Issues" },
	{ value: "users", label: "Users" },
];

export function CustomFilterDialog({ open, initial, onClose, onSave }: Props) {
	const [kind, setKind] = useState<Kind>("team-repos");
	const [name, setName] = useState("");
	const [icon, setIcon] = useState("⭐");
	const [org, setOrg] = useState("");
	const [team, setTeam] = useState("");
	const [baseType, setBaseType] = useState<GitHubSearchType>("repos");
	const [qualifiers, setQualifiers] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		if (initial) {
			setKind(initial.kind);
			setName(initial.name);
			setIcon(initial.icon ?? "⭐");
			if (initial.kind === "team-repos") {
				setOrg(initial.org);
				setTeam(initial.team);
			} else {
				setBaseType(initial.baseType);
				setQualifiers(initial.qualifiers);
			}
		} else {
			setKind("team-repos");
			setName("");
			setIcon("⭐");
			setOrg("");
			setTeam("");
			setBaseType("repos");
			setQualifiers("");
		}
		setError(null);
	}, [open, initial]);

	function handleSave() {
		if (!name.trim()) {
			setError("Nome é obrigatório");
			return;
		}
		const id = initial?.id ?? crypto.randomUUID();
		if (kind === "team-repos") {
			if (!org.trim() || !team.trim()) {
				setError("Organização e Team são obrigatórios");
				return;
			}
			onSave({
				id,
				kind: "team-repos",
				name: name.trim(),
				icon: icon || undefined,
				org: org.trim(),
				team: team.trim(),
			});
		} else {
			onSave({
				id,
				kind: "search",
				name: name.trim(),
				icon: icon || undefined,
				baseType,
				qualifiers: qualifiers.trim(),
			});
		}
		onClose();
	}

	// Resize window to fit dialog content
	useEffect(() => {
		if (!open) return;
		const height =
			kind === "search"
				? FILTER_DIALOG_HEIGHT_SEARCH
				: FILTER_DIALOG_HEIGHT_TEAM;
		rpc.request.resizeWindow({ height, width: SETTINGS_WIDTH }).catch(() => {});
		return () => {
			rpc.request
				.resizeWindow({ height: SETTINGS_HEIGHT, width: SETTINGS_WIDTH })
				.catch(() => {});
		};
	}, [open, kind]);

	const handleQualifiersChange = useCallback((q: string) => {
		setQualifiers(q);
	}, []);

	const isSearch = kind === "search";

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				className={cn(
					"transition-[max-width]",
					isSearch ? "max-w-[680px]" : "max-w-[460px]",
				)}
			>
				<DialogHeader>
					<DialogTitle>{initial ? "Editar filtro" : "Novo filtro"}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					{/* Kind selector */}
					<div>
						<div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
							Tipo do filtro
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className={cn(
									"rounded-full border px-3 py-1 text-xs font-medium transition-colors",
									kind === "team-repos"
										? "border-blue-500/50 bg-blue-500/15 text-blue-400"
										: "border-border text-foreground/50 hover:text-foreground/70",
								)}
								onClick={() => setKind("team-repos")}
							>
								Team repos
							</button>
							<button
								type="button"
								className={cn(
									"rounded-full border px-3 py-1 text-xs font-medium transition-colors",
									kind === "search"
										? "border-blue-500/50 bg-blue-500/15 text-blue-400"
										: "border-border text-foreground/50 hover:text-foreground/70",
								)}
								onClick={() => setKind("search")}
							>
								Search query
							</button>
						</div>
					</div>

					{/* Name + Icon + BaseType (shared top bar) */}
					<div
						className={cn(
							"gap-2",
							isSearch ? "flex items-end" : "grid grid-cols-[1fr_80px]",
						)}
					>
						<div className="flex flex-1 flex-col gap-1">
							<label
								htmlFor="filter-name"
								className="text-[11px] font-medium text-foreground/70"
							>
								Nome
							</label>
							<Input
								id="filter-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="flex w-[60px] flex-col gap-1">
							<span className="text-[11px] font-medium text-foreground/70">
								Ícone
							</span>
							<EmojiPicker value={icon} onChange={setIcon} />
						</div>
						{isSearch && (
							<div className="flex flex-col gap-1">
								<div className="text-[11px] font-medium text-foreground/70">
									Tipo base
								</div>
								<div className="flex gap-1">
									{BASE_TYPES.map((b) => (
										<button
											key={b.value}
											type="button"
											className={cn(
												"rounded-md border px-2 py-1 text-xs font-medium transition-colors",
												baseType === b.value
													? "border-blue-500/50 bg-blue-500/15 text-blue-400"
													: "border-border text-foreground/50 hover:text-foreground/70",
											)}
											onClick={() => setBaseType(b.value)}
										>
											{b.label}
										</button>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Kind-specific content */}
					{kind === "team-repos" ? (
						<>
							<div className="flex flex-col gap-3 rounded-md border border-border/30 p-3">
								<div className="flex items-center gap-2">
									<div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10">
										<span className="text-sm">🏢</span>
									</div>
									<div className="text-[11px] font-medium text-foreground/70">
										Configuração do Team
									</div>
								</div>
								<div className="flex flex-col gap-1">
									<label
										htmlFor="filter-org"
										className="text-[11px] font-medium text-foreground/70"
									>
										Organização
									</label>
									<Input
										id="filter-org"
										value={org}
										onChange={(e) => setOrg(e.target.value)}
										placeholder="Chafy-Studio"
									/>
								</div>
								<div className="flex flex-col gap-1">
									<label
										htmlFor="filter-team"
										className="text-[11px] font-medium text-foreground/70"
									>
										Team slug
									</label>
									<Input
										id="filter-team"
										value={team}
										onChange={(e) => setTeam(e.target.value)}
										placeholder="chafy"
									/>
								</div>
								<div className="rounded-md bg-muted/30 px-3 py-2">
									<p className="font-mono text-[10px] text-foreground/50">
										GET /orgs/
										<span className="text-blue-400">{org || "{org}"}</span>
										/teams/
										<span className="text-blue-400">{team || "{team}"}</span>
										/repos
									</p>
								</div>
							</div>
							<TeamReposPreview org={org} team={team} />
						</>
					) : (
						<QueryBuilderPanel
							baseType={baseType}
							initialQualifiers={qualifiers}
							onChange={handleQualifiersChange}
						/>
					)}

					{error && <p className="text-xs text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={handleSave}>Salvar</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

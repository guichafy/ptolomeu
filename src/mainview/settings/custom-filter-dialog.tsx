import { useEffect, useState } from "react";
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
import type { CustomFilter, GitHubSearchType } from "../providers/github/types";

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

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-[460px]">
				<DialogHeader>
					<DialogTitle>{initial ? "Editar filtro" : "Novo filtro"}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					<div>
						<div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
							Tipo do filtro
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className={cn(
									"rounded-full border px-3 py-1 text-xs",
									kind === "team-repos"
										? "border-primary bg-primary/20 text-primary-foreground"
										: "border-border text-muted-foreground",
								)}
								onClick={() => setKind("team-repos")}
							>
								Team repos
							</button>
							<button
								type="button"
								className={cn(
									"rounded-full border px-3 py-1 text-xs",
									kind === "search"
										? "border-primary bg-primary/20 text-primary-foreground"
										: "border-border text-muted-foreground",
								)}
								onClick={() => setKind("search")}
							>
								Search query
							</button>
						</div>
					</div>
					<div className="grid grid-cols-[1fr_80px] gap-2">
						<div className="flex flex-col gap-1">
							<label
								htmlFor="filter-name"
								className="text-xs text-muted-foreground"
							>
								Nome
							</label>
							<Input
								id="filter-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label
								htmlFor="filter-icon"
								className="text-xs text-muted-foreground"
							>
								Ícone
							</label>
							<Input
								id="filter-icon"
								value={icon}
								onChange={(e) => setIcon(e.target.value)}
								maxLength={2}
							/>
						</div>
					</div>
					{kind === "team-repos" ? (
						<>
							<div className="flex flex-col gap-1">
								<label
									htmlFor="filter-org"
									className="text-xs text-muted-foreground"
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
									className="text-xs text-muted-foreground"
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
							<p className="text-[11px] text-muted-foreground">
								Busca via /orgs/{"{org}"}/teams/{"{team}"}/repos com filtro
								client-side.
							</p>
						</>
					) : (
						<>
							<div className="flex flex-col gap-1">
								<div className="text-xs text-muted-foreground">Tipo base</div>
								<div className="flex gap-1">
									{BASE_TYPES.map((b) => (
										<button
											key={b.value}
											type="button"
											className={cn(
												"rounded-md border px-2 py-1 text-xs",
												baseType === b.value
													? "border-primary bg-primary/20"
													: "border-border text-muted-foreground",
											)}
											onClick={() => setBaseType(b.value)}
										>
											{b.label}
										</button>
									))}
								</div>
							</div>
							<div className="flex flex-col gap-1">
								<label
									htmlFor="filter-qualifiers"
									className="text-xs text-muted-foreground"
								>
									Qualificadores extras
								</label>
								<Input
									id="filter-qualifiers"
									value={qualifiers}
									onChange={(e) => setQualifiers(e.target.value)}
									placeholder="is:pr is:open author:@me"
								/>
								<p className="text-[11px] text-muted-foreground">
									Prefixados à query do usuário na busca.
								</p>
							</div>
						</>
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

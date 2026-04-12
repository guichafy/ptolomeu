import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { rpc, type TokenStatus } from "../providers/rpc";

export function TokenField() {
	const [status, setStatus] = useState<TokenStatus>({ hasToken: false });
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const s = await rpc.request.githubGetTokenStatus();
			setStatus(s);
		} catch {
			setStatus({ hasToken: false });
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleSave() {
		setError(null);
		setSaving(true);
		try {
			const result = await rpc.request.githubSetToken({ token: value });
			if (!result.ok) {
				setError(result.error ?? "Falha ao validar token");
				return;
			}
			setValue("");
			setEditing(false);
			await refresh();
		} finally {
			setSaving(false);
		}
	}

	async function handleRemove() {
		await rpc.request.githubDeleteToken();
		await refresh();
	}

	const StatusIcon = status.hasToken ? CheckCircle2 : XCircle;

	return (
		<div className="flex flex-col gap-2.5">
			<h3 className="text-sm font-semibold">Autenticação</h3>
			<div
				className={cn(
					"flex items-center gap-3 rounded-lg border p-3",
					status.hasToken
						? "border-emerald-500/20 bg-emerald-500/5"
						: "border-border/50 bg-card",
				)}
			>
				<StatusIcon
					className={cn(
						"h-4 w-4 shrink-0",
						status.hasToken ? "text-emerald-400" : "text-muted-foreground/60",
					)}
				/>
				<div className="flex flex-1 flex-col gap-0.5">
					{status.hasToken ? (
						<>
							<span className="text-sm">Token armazenado no Keychain</span>
							<span className="text-xs text-muted-foreground">
								{status.login
									? `Logado como @${status.login}`
									: "Validação offline — revalide quando possível"}
							</span>
						</>
					) : (
						<>
							<span className="text-sm">Nenhum token configurado</span>
							<span className="text-xs text-muted-foreground">
								Sem token: 60 req/h. Com token: 5.000 req/h + Code search.
							</span>
						</>
					)}
				</div>
				{status.hasToken ? (
					<div className="flex gap-1.5">
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							onClick={() => setEditing(true)}
						>
							Reconfigurar
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="h-7 text-xs text-muted-foreground"
							onClick={handleRemove}
						>
							Remover
						</Button>
					</div>
				) : (
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={() => setEditing(true)}
					>
						Configurar
					</Button>
				)}
			</div>
			{editing && (
				<div className="flex flex-col gap-2.5 rounded-lg border border-border/50 bg-card/50 p-3">
					<label
						htmlFor="pat-input"
						className="text-xs font-medium text-muted-foreground"
					>
						Personal Access Token (classic ou fine-grained)
					</label>
					<Input
						id="pat-input"
						type="password"
						placeholder="ghp_..."
						value={value}
						onChange={(e) => setValue(e.target.value)}
						autoFocus
					/>
					{error && <p className="text-xs text-destructive">{error}</p>}
					<div className="flex gap-2">
						<Button
							size="sm"
							className="h-7 text-xs"
							onClick={handleSave}
							disabled={saving || !value}
						>
							{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="h-7 text-xs"
							onClick={() => {
								setEditing(false);
								setValue("");
								setError(null);
							}}
						>
							Cancelar
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

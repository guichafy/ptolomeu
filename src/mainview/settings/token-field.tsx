import { KeyRound, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

	return (
		<div className="flex flex-col gap-2">
			<h3 className="text-sm font-semibold">Autenticação</h3>
			<div className="flex items-center gap-3 rounded-md border border-border/50 bg-card p-3">
				<KeyRound className="h-4 w-4 text-muted-foreground" />
				<div className="flex flex-1 flex-col">
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
								Sem token: 60 req/h. Com token: 5000 req/h + Code search.
							</span>
						</>
					)}
				</div>
				{status.hasToken ? (
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setEditing(true)}
						>
							Reconfigurar
						</Button>
						<Button size="sm" variant="ghost" onClick={handleRemove}>
							Remover
						</Button>
					</div>
				) : (
					<Button size="sm" onClick={() => setEditing(true)}>
						Configurar
					</Button>
				)}
			</div>
			{editing && (
				<div className="flex flex-col gap-2 rounded-md border border-border/50 p-3">
					<label htmlFor="pat-input" className="text-xs text-muted-foreground">
						Personal Access Token (classic ou fine-grained)
					</label>
					<Input
						id="pat-input"
						type="password"
						placeholder="ghp_..."
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
					{error && <p className="text-xs text-destructive">{error}</p>}
					<div className="flex gap-2">
						<Button size="sm" onClick={handleSave} disabled={saving || !value}>
							{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
						</Button>
						<Button
							size="sm"
							variant="ghost"
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

import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ProxyMode, type ProxyStatus, rpc } from "../providers/rpc";
import { useSettings } from "./settings-context";

interface ModeOption {
	value: ProxyMode;
	title: string;
	description: string;
	badge?: string;
}

const MODE_OPTIONS: readonly ModeOption[] = [
	{
		value: "auto",
		title: "Auto",
		description:
			"Tenta variáveis de ambiente; se ausentes, usa as Preferências do Sistema; senão, conexão direta.",
		badge: "Recomendado",
	},
	{
		value: "system",
		title: "Sistema (Preferências do macOS)",
		description:
			"Lê o proxy via `scutil --proxy` e ignora as variáveis de ambiente.",
	},
	{
		value: "env",
		title: "Variáveis de ambiente",
		description: "Usa apenas HTTPS_PROXY, HTTP_PROXY, ALL_PROXY e NO_PROXY.",
	},
	{
		value: "none",
		title: "Sem proxy",
		description:
			"Conexão direta. Limpa as variáveis de proxy do processo — subprocessos iniciados a partir daqui também não usarão proxy.",
	},
] as const;

const SOURCE_LABEL: Record<ProxyStatus["source"], string> = {
	env: "Variáveis de ambiente",
	scutil: "Preferências do Sistema",
	none: "Nenhum",
};

function formatRelative(timestamp: number, now: number): string {
	if (!timestamp) return "—";
	const diffMs = now - timestamp;
	if (diffMs < 0) return "agora";
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 5) return "agora";
	if (seconds < 60) return `há ${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return `há ${hours}h`;
}

export function NetworkSection() {
	const { proxySettings, updateProxyMode } = useSettings();
	const [status, setStatus] = useState<ProxyStatus | null>(null);
	const [reloading, setReloading] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	// Contador monotônico para descartar respostas de RPC obsoletas quando o
	// componente é remontado ou quando múltiplos reloads se sobrepõem.
	const requestCounterRef = useRef(0);

	useEffect(() => {
		const requestId = ++requestCounterRef.current;
		rpc.request
			.getProxyStatus()
			.then((next) => {
				if (requestId === requestCounterRef.current) setStatus(next);
			})
			.catch(() => {});
		return () => {
			requestCounterRef.current += 1;
		};
	}, []);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const handleReload = useCallback(async () => {
		const requestId = ++requestCounterRef.current;
		setReloading(true);
		try {
			const next = await rpc.request.reloadProxyFromSystem();
			if (requestId === requestCounterRef.current) setStatus(next);
		} catch {
			// ignora — UI não muda em caso de falha
		} finally {
			if (requestId === requestCounterRef.current) setReloading(false);
		}
	}, []);

	// "Em uso" reflete o modo efetivo em runtime (status.mode), caindo para o
	// modo persistido apenas antes da primeira resposta do RPC.
	const activeMode = status?.mode ?? proxySettings.mode;
	const pendingRestart = status !== null && status.mode !== proxySettings.mode;
	// Recarregar só faz sentido quando o modo ATIVO (não o pendente) é auto ou
	// system. Se o usuário selecionou "none"/"env" mas ainda não reiniciou, o
	// proxy em runtime pode continuar em system e o reload ainda é útil.
	const canReload = status?.mode === "auto" || status?.mode === "system";

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold">Rede</h2>
				<p className="text-xs text-muted-foreground/80">
					Como o aplicativo resolve o proxy para chamadas externas (GitHub,
					Claude, análises).
				</p>
			</div>

			<div className="flex flex-col gap-2">
				{MODE_OPTIONS.map((option) => {
					const selected = proxySettings.mode === option.value;
					return (
						<button
							type="button"
							key={option.value}
							onClick={() => updateProxyMode(option.value)}
							aria-pressed={selected}
							className={cn(
								"flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
								selected
									? "border-primary/70 bg-primary/5"
									: "border-border/50 hover:border-border hover:bg-accent/40",
							)}
						>
							<span
								className={cn(
									"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
									selected
										? "border-primary bg-primary text-primary-foreground"
										: "border-border",
								)}
							>
								{selected ? <Check className="h-3 w-3" /> : null}
							</span>
							<div className="flex flex-1 flex-col gap-0.5">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium">{option.title}</span>
									{option.badge ? (
										<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
											{option.badge}
										</span>
									) : null}
									{activeMode === option.value ? (
										<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
											Em uso
										</span>
									) : null}
								</div>
								<span className="text-xs text-muted-foreground">
									{option.description}
								</span>
							</div>
						</button>
					);
				})}
			</div>

			{pendingRestart ? (
				<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
					<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>
						Reinicie o aplicativo para aplicar o novo modo de proxy.
						Subprocessos em execução (como o Claude CLI) continuam usando o modo
						anterior até serem reiniciados.
					</span>
				</div>
			) : null}

			<div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<span className="text-sm font-medium">Status atual</span>
					{status?.resolvedAt ? (
						<span className="text-[10px] text-muted-foreground">
							atualizado {formatRelative(status.resolvedAt, now)}
						</span>
					) : null}
				</div>
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
					<dt className="text-muted-foreground">Origem</dt>
					<dd className="font-mono">
						{status ? SOURCE_LABEL[status.source] : "—"}
					</dd>
					<dt className="text-muted-foreground">HTTPS</dt>
					<dd className="font-mono break-all">{status?.httpsProxy ?? "—"}</dd>
					<dt className="text-muted-foreground">HTTP</dt>
					<dd className="font-mono break-all">{status?.httpProxy ?? "—"}</dd>
					<dt className="text-muted-foreground">Exceções</dt>
					<dd className="font-mono">{status?.noProxyCount ?? 0}</dd>
				</dl>
				{canReload ? (
					<div className="flex items-center gap-2 pt-1">
						<Button
							size="sm"
							variant="outline"
							onClick={handleReload}
							disabled={reloading}
						>
							<RefreshCw
								className={cn("h-3.5 w-3.5", reloading && "animate-spin")}
							/>
							Recarregar do sistema
						</Button>
						<span className="text-[11px] text-muted-foreground">
							Re-lê `scutil --proxy` sem reiniciar o app. Em modo Auto, só afeta
							a resolução quando HTTPS_PROXY/HTTP_PROXY estão ausentes.
						</span>
					</div>
				) : null}
			</div>
		</div>
	);
}

import {
	AlertTriangle,
	Check,
	Eye,
	EyeOff,
	Loader2,
	RefreshCw,
	Wifi,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
	type ManualProxyProtocol,
	type ProxyMode,
	type ProxySource,
	type ProxyStatus,
	rpc,
} from "../providers/rpc";
import {
	type ManualProxyDraft,
	type TestProxyResult,
	useSettings,
} from "./settings-context";

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
		value: "manual",
		title: "Manual",
		description:
			"Informe host, porta e credenciais manualmente. A senha é armazenada no macOS Keychain. Use quando o app for aberto via Finder/Dock e as variáveis de ambiente do shell não forem herdadas.",
	},
	{
		value: "none",
		title: "Sem proxy",
		description:
			"Conexão direta. Limpa as variáveis de proxy do processo — subprocessos iniciados a partir daqui também não usarão proxy.",
	},
] as const;

const SOURCE_LABEL: Record<ProxySource, string> = {
	env: "Variáveis de ambiente",
	scutil: "Preferências do Sistema",
	"scutil+pac": "Sistema + PAC",
	pac: "PAC do Sistema",
	manual: "Configuração manual",
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

function emptyDraft(): ManualProxyDraft {
	return {
		protocol: "http",
		host: "",
		port: 8080,
		username: "",
		password: "",
		noProxy: "",
	};
}

interface ManualProxyFormProps {
	onSaved: () => void;
}

function ManualProxyForm({ onSaved }: ManualProxyFormProps) {
	const {
		proxySettings,
		saveManualProxy,
		clearManualProxy,
		testProxyConnection,
	} = useSettings();
	const existing = proxySettings.manual;
	const [draft, setDraft] = useState<ManualProxyDraft>(() => {
		if (!existing) return emptyDraft();
		return {
			protocol: existing.protocol,
			host: existing.host,
			port: existing.port,
			username: existing.username ?? "",
			password: "",
			noProxy: existing.noProxy.join("\n"),
		};
	});
	const [showPassword, setShowPassword] = useState(false);
	const [changePassword, setChangePassword] = useState(!existing?.hasPassword);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [savedFlash, setSavedFlash] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<TestProxyResult | null>(null);
	const [clearing, setClearing] = useState(false);

	const hasSavedPassword = !!existing?.hasPassword;

	const handleSave = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			setSaveError(null);
			setSavedFlash(false);
			setSaving(true);
			try {
				const result = await saveManualProxy({ ...draft, changePassword });
				if (!result.ok) {
					setSaveError(result.error ?? "Falha ao salvar");
					return;
				}
				setSavedFlash(true);
				setChangePassword(false);
				setDraft((d) => ({ ...d, password: "" }));
				onSaved();
				setTimeout(() => setSavedFlash(false), 2000);
			} finally {
				setSaving(false);
			}
		},
		[draft, changePassword, saveManualProxy, onSaved],
	);

	const handleTest = useCallback(async () => {
		setTesting(true);
		setTestResult(null);
		try {
			const result = await testProxyConnection();
			setTestResult(result);
		} finally {
			setTesting(false);
		}
	}, [testProxyConnection]);

	const handleClear = useCallback(async () => {
		setClearing(true);
		try {
			await clearManualProxy();
			setDraft(emptyDraft());
			setChangePassword(true);
			setTestResult(null);
			onSaved();
		} finally {
			setClearing(false);
		}
	}, [clearManualProxy, onSaved]);

	return (
		<form
			onSubmit={handleSave}
			className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
		>
			<div className="flex items-center gap-2">
				<Wifi className="h-3.5 w-3.5 text-primary" />
				<span className="text-sm font-medium">Configuração manual</span>
			</div>

			<div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2 items-center">
				<label
					htmlFor="proxy-protocol"
					className="text-xs text-muted-foreground"
				>
					Protocolo
				</label>
				<select
					id="proxy-protocol"
					value={draft.protocol}
					onChange={(e) =>
						setDraft((d) => ({
							...d,
							protocol: e.target.value as ManualProxyProtocol,
						}))
					}
					className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
				>
					<option value="http">http</option>
					<option value="https">https</option>
				</select>
				<label htmlFor="proxy-port" className="text-xs text-muted-foreground">
					Porta
				</label>
				<Input
					id="proxy-port"
					type="number"
					min={1}
					max={65535}
					value={draft.port}
					onChange={(e) =>
						setDraft((d) => ({
							...d,
							port: Math.max(1, Math.min(65535, Number(e.target.value) || 0)),
						}))
					}
					className="h-9"
					required
				/>
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor="proxy-host" className="text-xs text-muted-foreground">
					Host
				</label>
				<Input
					id="proxy-host"
					type="text"
					placeholder="proxy.corp.example"
					value={draft.host}
					onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))}
					required
				/>
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor="proxy-user" className="text-xs text-muted-foreground">
					Usuário <span className="text-muted-foreground/60">(opcional)</span>
				</label>
				<Input
					id="proxy-user"
					type="text"
					autoComplete="username"
					placeholder="ex.: guichafy"
					value={draft.username}
					onChange={(e) =>
						setDraft((d) => ({ ...d, username: e.target.value }))
					}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<label htmlFor="proxy-pass" className="text-xs text-muted-foreground">
						Senha
					</label>
					{hasSavedPassword && !changePassword ? (
						<button
							type="button"
							onClick={() => setChangePassword(true)}
							className="text-[11px] text-primary hover:underline"
						>
							Alterar senha
						</button>
					) : null}
				</div>
				{hasSavedPassword && !changePassword ? (
					<div className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground">
						<Check className="h-3 w-3" />
						Senha salva no Keychain (preservada ao salvar)
					</div>
				) : (
					<div className="relative">
						<Input
							id="proxy-pass"
							type={showPassword ? "text" : "password"}
							autoComplete="current-password"
							placeholder={
								hasSavedPassword
									? "Nova senha (deixe vazio para remover)"
									: "Senha do proxy"
							}
							value={draft.password}
							onChange={(e) =>
								setDraft((d) => ({ ...d, password: e.target.value }))
							}
							className="pr-9"
						/>
						<button
							type="button"
							onClick={() => setShowPassword((v) => !v)}
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						>
							{showPassword ? (
								<EyeOff className="h-3.5 w-3.5" />
							) : (
								<Eye className="h-3.5 w-3.5" />
							)}
						</button>
					</div>
				)}
				<p className="text-[11px] text-muted-foreground">
					A senha é armazenada no macOS Keychain (service:{" "}
					<code className="font-mono">com.ptolomeu.app.proxy</code>). Nunca é
					gravada em arquivos de configuração.
				</p>
			</div>

			<div className="flex flex-col gap-1">
				<label
					htmlFor="proxy-noproxy"
					className="text-xs text-muted-foreground"
				>
					Exceções (NO_PROXY){" "}
					<span className="text-muted-foreground/60">
						— uma por linha ou separadas por vírgula
					</span>
				</label>
				<textarea
					id="proxy-noproxy"
					rows={3}
					value={draft.noProxy}
					onChange={(e) => setDraft((d) => ({ ...d, noProxy: e.target.value }))}
					placeholder="*.local&#10;localhost&#10;127.0.0.1"
					className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
				/>
			</div>

			{saveError ? (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{saveError}
				</div>
			) : null}

			{testResult ? (
				testResult.ok ? (
					<div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
						Conexão ok (HTTP {testResult.status}) — {testResult.latencyMs}ms
					</div>
				) : (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						Falha após {testResult.latencyMs}ms:{" "}
						{testResult.error ?? `HTTP ${testResult.status ?? "?"}`}
					</div>
				)
			) : null}

			<div className="flex flex-wrap items-center gap-2 pt-1">
				<Button type="submit" size="sm" disabled={saving}>
					{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
					Salvar
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={handleTest}
					disabled={testing || !existing}
					title={
						existing
							? "Testa uma requisição real via o proxy configurado"
							: "Salve primeiro para testar"
					}
				>
					{testing ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Wifi className="h-3.5 w-3.5" />
					)}
					Testar conexão
				</Button>
				{existing ? (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={handleClear}
						disabled={clearing}
						className="text-destructive hover:text-destructive"
					>
						Remover proxy manual
					</Button>
				) : null}
				{savedFlash ? (
					<span className="text-[11px] text-emerald-600 dark:text-emerald-400">
						Salvo
					</span>
				) : null}
			</div>
		</form>
	);
}

export function NetworkSection() {
	const { proxySettings, updateProxyMode } = useSettings();
	const [status, setStatus] = useState<ProxyStatus | null>(null);
	const [reloading, setReloading] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	// Contador monotônico para descartar respostas de RPC obsoletas quando o
	// componente é remontado ou quando múltiplos reloads se sobrepõem.
	const requestCounterRef = useRef(0);

	const refreshStatus = useCallback(async () => {
		const requestId = ++requestCounterRef.current;
		try {
			const next = await rpc.request.getProxyStatus();
			if (requestId === requestCounterRef.current) setStatus(next);
		} catch {
			/* noop */
		}
	}, []);

	useEffect(() => {
		refreshStatus();
		return () => {
			requestCounterRef.current += 1;
		};
	}, [refreshStatus]);

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

			{proxySettings.mode === "manual" ? (
				<ManualProxyForm onSaved={refreshStatus} />
			) : null}

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
					{status?.pacUrl ? (
						<>
							<dt className="text-muted-foreground">PAC</dt>
							<dd className="font-mono break-all">{status.pacUrl}</dd>
						</>
					) : null}
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
				{status?.pacUrl ? (
					<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
						O sistema declara um arquivo PAC (Proxy Auto-Config). O app detecta
						a URL mas ainda não executa scripts PAC — use o modo Manual para
						informar um proxy fixo.
					</div>
				) : null}
			</div>
		</div>
	);
}

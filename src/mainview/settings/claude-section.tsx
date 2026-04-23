import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
	type ClaudeAuthMode,
	type ClaudeAuthStatus,
	type ClaudePermissionMode,
	rpc,
} from "../providers/rpc";
import { McpServersSection } from "./mcp-servers";
import { useSettings } from "./settings-context";

export function ClaudeSection() {
	const { settings } = useSettings();

	// Auth state
	const [authStatus, setAuthStatus] = useState<ClaudeAuthStatus | null>(null);
	const [authLoading, setAuthLoading] = useState(true);
	const [ssoLoading, setSsoLoading] = useState(false);
	const [ssoError, setSsoError] = useState<string | null>(null);

	// Auth mode toggle (local, synced to settings)
	const [authMode, setAuthMode] = useState<ClaudeAuthMode>(
		settings?.claude?.authMode ?? "anthropic",
	);

	// Bedrock fields
	const [bedrockEndpoint, setBedrockEndpoint] = useState("");
	const [bedrockProfile, setBedrockProfile] = useState("");
	const [bedrockRegion, setBedrockRegion] = useState("");
	const [bedrockSaving, setBedrockSaving] = useState(false);

	// Model & permissions (synced to settings)
	const [model, setModel] = useState(
		settings?.claude?.model ?? "claude-sonnet-4-6",
	);
	const [permissionMode, setPermissionMode] = useState<ClaudePermissionMode>(
		settings?.claude?.permissionMode ?? "acceptEdits",
	);
	const [useAiElements, setUseAiElements] = useState<boolean>(
		settings?.claude?.useAiElements ?? false,
	);

	// Sessions
	const [sessionCount, setSessionCount] = useState(0);
	const [clearingHistory, setClearingHistory] = useState(false);

	// Sync from settings when they load
	useEffect(() => {
		if (settings?.claude) {
			setAuthMode(settings.claude.authMode);
			setModel(settings.claude.model);
			setPermissionMode(settings.claude.permissionMode);
			setUseAiElements(settings.claude.useAiElements ?? false);
		}
	}, [settings?.claude]);

	const refreshAuth = useCallback(async () => {
		try {
			const status = await rpc.request.claudeGetAuthStatus();
			setAuthStatus(status);
			// If bedrock config exists, populate fields
			if (status.bedrock) {
				setBedrockEndpoint(status.bedrock.endpoint);
				setBedrockProfile(status.bedrock.profile);
				setBedrockRegion(status.bedrock.region);
			}
		} catch {
			setAuthStatus({ mode: "none" });
		} finally {
			setAuthLoading(false);
		}
	}, []);

	const refreshSessions = useCallback(async () => {
		try {
			const sessions = await rpc.request.claudeListSessions();
			setSessionCount(sessions.length);
		} catch {
			setSessionCount(0);
		}
	}, []);

	useEffect(() => {
		refreshAuth();
		refreshSessions();
	}, [refreshAuth, refreshSessions]);

	// Persist a claude settings change
	async function persistClaudeSetting(
		patch: Partial<{
			authMode: ClaudeAuthMode;
			model: string;
			permissionMode: ClaudePermissionMode;
			useAiElements: boolean;
		}>,
	) {
		try {
			const current = await rpc.request.loadSettings();
			const updated = {
				...current,
				claude: { ...current.claude, ...patch },
			};
			await rpc.request.saveSettings(updated);
		} catch {
			// silent
		}
	}

	function handleAuthModeChange(mode: ClaudeAuthMode) {
		setAuthMode(mode);
		persistClaudeSetting({ authMode: mode });
	}

	async function handleSSOLogin() {
		setSsoError(null);
		setSsoLoading(true);
		try {
			const result = await rpc.request.claudeLoginSSO();
			if (!result.ok) {
				setSsoError(result.error ?? "Falha ao conectar");
				return;
			}
			await refreshAuth();
		} finally {
			setSsoLoading(false);
		}
	}

	async function handleSSOLogout() {
		await rpc.request.claudeLogoutSSO();
		await refreshAuth();
	}

	async function handleBedrockSave() {
		setBedrockSaving(true);
		try {
			await rpc.request.claudeSetBedrock({
				endpoint: bedrockEndpoint,
				profile: bedrockProfile,
				region: bedrockRegion,
			});
			await refreshAuth();
		} finally {
			setBedrockSaving(false);
		}
	}

	function handleModelChange(value: string) {
		setModel(value);
		persistClaudeSetting({ model: value });
	}

	function handlePermissionChange(value: ClaudePermissionMode) {
		setPermissionMode(value);
		persistClaudeSetting({ permissionMode: value });
	}

	function handleUseAiElementsChange(value: boolean) {
		setUseAiElements(value);
		persistClaudeSetting({ useAiElements: value });
	}

	async function handleClearHistory() {
		setClearingHistory(true);
		try {
			const sessions = await rpc.request.claudeListSessions();
			for (const session of sessions) {
				await rpc.request.claudeDeleteSession({ sessionId: session.id });
			}
			await refreshSessions();
		} finally {
			setClearingHistory(false);
		}
	}

	const isAnthropicConnected =
		authStatus?.mode === "anthropic" && authStatus.anthropic?.connected;

	return (
		<div className="flex flex-col gap-5">
			{/* Header */}
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold">Claude Code</h2>
				<p className="text-xs text-muted-foreground/80">
					Configuração de autenticação, modelo e permissões.
				</p>
			</div>

			{/* Autenticação */}
			<div className="flex flex-col gap-2.5">
				<h3 className="text-sm font-semibold">Autenticação</h3>

				{/* Auth mode toggle */}
				<div className="flex gap-1 rounded-lg border border-border/50 bg-card/50 p-1">
					<button
						type="button"
						className={cn(
							"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
							authMode === "anthropic"
								? "bg-primary text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => handleAuthModeChange("anthropic")}
					>
						Anthropic SSO
					</button>
					<button
						type="button"
						className={cn(
							"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
							authMode === "bedrock"
								? "bg-primary text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => handleAuthModeChange("bedrock")}
					>
						AWS Bedrock
					</button>
				</div>

				{/* Anthropic SSO panel */}
				{authMode === "anthropic" && (
					<div className="flex flex-col gap-2.5 rounded-lg border border-border/50 bg-card/50 p-3">
						{authLoading ? (
							<div className="flex items-center gap-2">
								<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
								<span className="text-xs text-muted-foreground">
									Verificando...
								</span>
							</div>
						) : (
							<>
								<div className="flex items-center gap-2">
									<span className="text-xs font-medium text-muted-foreground">
										Status:
									</span>
									<Badge
										className={cn(
											"text-[10px] px-1.5 py-0",
											isAnthropicConnected
												? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
												: "border-border bg-muted text-muted-foreground",
										)}
										variant="outline"
									>
										{isAnthropicConnected ? "Conectado" : "Desconectado"}
									</Badge>
								</div>

								{isAnthropicConnected ? (
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-foreground">
											{authStatus.anthropic?.email ?? "Conta conectada"}
										</span>
										<Button
											size="sm"
											variant="ghost"
											className="h-7 text-xs text-muted-foreground"
											onClick={handleSSOLogout}
										>
											Desconectar
										</Button>
									</div>
								) : (
									<div className="flex flex-col gap-2">
										<Button
											size="sm"
											className="h-7 text-xs w-fit"
											onClick={handleSSOLogin}
											disabled={ssoLoading}
										>
											{ssoLoading ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												"Conectar"
											)}
										</Button>
										{ssoError && (
											<p className="text-xs text-destructive">{ssoError}</p>
										)}
									</div>
								)}
							</>
						)}
					</div>
				)}

				{/* AWS Bedrock panel */}
				{authMode === "bedrock" && (
					<div className="flex flex-col gap-2.5 rounded-lg border border-border/50 bg-card/50 p-3">
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="bedrock-endpoint"
								className="text-xs font-medium text-muted-foreground"
							>
								Endpoint URL
							</label>
							<Input
								id="bedrock-endpoint"
								placeholder="https://bedrock-runtime.us-east-1.amazonaws.com"
								value={bedrockEndpoint}
								onChange={(e) => setBedrockEndpoint(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="bedrock-profile"
								className="text-xs font-medium text-muted-foreground"
							>
								Profile
							</label>
							<Input
								id="bedrock-profile"
								placeholder="default"
								value={bedrockProfile}
								onChange={(e) => setBedrockProfile(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="bedrock-region"
								className="text-xs font-medium text-muted-foreground"
							>
								Region
							</label>
							<Input
								id="bedrock-region"
								placeholder="us-east-1"
								value={bedrockRegion}
								onChange={(e) => setBedrockRegion(e.target.value)}
							/>
						</div>
						<Button
							size="sm"
							className="h-7 text-xs w-fit"
							onClick={handleBedrockSave}
							disabled={bedrockSaving}
						>
							{bedrockSaving ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								"Salvar"
							)}
						</Button>
					</div>
				)}
			</div>

			<Separator className="opacity-40" />

			{/* Modelo Padrão */}
			<div className="flex flex-col gap-2.5">
				<h3 className="text-sm font-semibold">Modelo Padrão</h3>
				<Select value={model} onValueChange={handleModelChange}>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="claude-opus-4-6">Claude Opus 4.6</SelectItem>
						<SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
						<SelectItem value="claude-haiku-4-5-20251001">
							Claude Haiku 4.5
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<Separator className="opacity-40" />

			{/* Permissões */}
			<div className="flex flex-col gap-2.5">
				<h3 className="text-sm font-semibold">Permissões</h3>
				<Select value={permissionMode} onValueChange={handlePermissionChange}>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="dontAsk">Não perguntar</SelectItem>
						<SelectItem value="acceptEdits">Aceitar edições</SelectItem>
						<SelectItem value="bypassPermissions">
							Automático completo
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<Separator className="opacity-40" />

			{/* UI experimental */}
			<div className="flex flex-col gap-2.5">
				<h3 className="text-sm font-semibold">Interface</h3>
				<div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-card/50 p-3">
					<div className="flex flex-col gap-0.5">
						<label
							htmlFor="claude-use-ai-elements"
							className="text-xs font-medium"
						>
							Nova interface (beta)
						</label>
						<span className="text-[11px] text-muted-foreground">
							Renderizar o chat com AI Elements e eventos tipados. Reabra a
							janela do chat para aplicar.
						</span>
					</div>
					<Switch
						id="claude-use-ai-elements"
						checked={useAiElements}
						onCheckedChange={handleUseAiElementsChange}
					/>
				</div>
			</div>

			<Separator className="opacity-40" />

			<McpServersSection />

			<Separator className="opacity-40" />

			{/* Sessões */}
			<div className="flex flex-col gap-2.5">
				<h3 className="text-sm font-semibold">Sessões</h3>
				<div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3">
					<span className="text-xs text-muted-foreground">
						{sessionCount === 1
							? "1 sessão armazenada"
							: `${sessionCount} sessões armazenadas`}
					</span>
					<Button
						size="sm"
						variant="destructive"
						className="h-7 text-xs"
						onClick={handleClearHistory}
						disabled={clearingHistory || sessionCount === 0}
					>
						{clearingHistory ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<>
								<Trash2 className="h-3 w-3" />
								Limpar Histórico
							</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}

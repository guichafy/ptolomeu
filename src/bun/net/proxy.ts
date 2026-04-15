/**
 * Resolução de configuração de proxy para o processo Bun.
 *
 * O modo é definido pelo usuário em Preferências (settings.proxy.mode):
 *   - "auto"   → tenta env vars; cai para `scutil --proxy`; senão, sem proxy.
 *   - "system" → ignora env e força a leitura via `scutil --proxy`.
 *   - "env"    → usa apenas HTTPS_PROXY/HTTP_PROXY/ALL_PROXY/NO_PROXY.
 *   - "none"   → desliga proxy e remove as env vars do processo, para que
 *                subprocessos (Claude CLI) e SDKs (PostHog) também não usem.
 *
 * O Bun fetch aceita a opção `proxy` (extensão específica do runtime) mas não
 * respeita automaticamente as env vars padrão. Por isso este módulo existe:
 * descobre a configuração uma vez, propaga env vars para subprocessos quando
 * resolvido via `scutil`, e expõe um wrapper `fetchWithProxy`.
 */

import { getPassword } from "../keychain";
import type { ManualProxySettings, ProxyMode } from "../settings";

export const PROXY_KEYCHAIN_SERVICE = "com.ptolomeu.app.proxy";

export function manualAccountId(m: ManualProxySettings): string {
	return `${m.protocol}://${m.host}:${m.port}`;
}

export type { ProxyMode };

export type ProxySource =
	| "env"
	| "scutil"
	| "scutil+pac"
	| "pac"
	| "manual"
	| "none";

export interface ProxyConfig {
	httpProxy: string | null;
	httpsProxy: string | null;
	noProxy: string[];
	source: ProxySource;
	mode: ProxyMode;
	resolvedAt: number;
	/** URL do PAC file quando detectado via scutil. */
	pacUrl?: string;
	/** Identificador do Keychain (sem senha) quando mode=manual. */
	manualAccount?: string;
}

export interface ProxyStatus {
	mode: ProxyMode;
	source: ProxySource;
	httpsProxy: string | null;
	httpProxy: string | null;
	noProxyCount: number;
	resolvedAt: number;
	pacUrl?: string;
	pacLoaded?: boolean;
}

const PROXY_ENV_KEYS = [
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"https_proxy",
	"http_proxy",
	"all_proxy",
	"no_proxy",
] as const;

let cached: ProxyConfig | null = null;

function normalizeProxyUrl(raw: string | undefined | null): string | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `http://${trimmed}`;
}

function readEnv(name: string): string | undefined {
	return process.env[name] ?? process.env[name.toLowerCase()];
}

function parseNoProxy(raw: string | undefined | null): string[] {
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter((s) => s.length > 0);
}

function readFromEnv(): Omit<ProxyConfig, "mode" | "resolvedAt"> | null {
	const httpsEnv = readEnv("HTTPS_PROXY");
	const httpEnv = readEnv("HTTP_PROXY");
	const allEnv = readEnv("ALL_PROXY");
	const noProxyEnv = readEnv("NO_PROXY");

	const httpsProxy = normalizeProxyUrl(httpsEnv ?? allEnv);
	const httpProxy = normalizeProxyUrl(httpEnv ?? allEnv);
	if (!httpsProxy && !httpProxy) return null;

	return {
		httpsProxy,
		httpProxy,
		noProxy: parseNoProxy(noProxyEnv),
		source: "env",
	};
}

/**
 * Parseia a saída textual de `scutil --proxy`. Formato típico:
 *
 *   <dictionary> {
 *     ExceptionsList : <array> {
 *       0 : *.local
 *       1 : 169.254/16
 *     }
 *     HTTPEnable : 1
 *     HTTPProxy : proxy.corp.example
 *     HTTPPort : 8080
 *     HTTPSEnable : 1
 *     HTTPSProxy : proxy.corp.example
 *     HTTPSPort : 8080
 *     ProxyAutoConfigEnable : 1
 *     ProxyAutoConfigURLString : http://wpad.corp/proxy.pac
 *   }
 *
 * Campos ausentes são tratados como desligados. Retorna `null` quando nenhum
 * proxy HTTP(S) estático nem PAC está habilitado.
 */
export function parseScutilProxy(
	output: string,
): Pick<
	ProxyConfig,
	"httpProxy" | "httpsProxy" | "noProxy" | "source" | "pacUrl"
> | null {
	const scalars: Record<string, string> = {};
	const exceptions: string[] = [];
	let inExceptions = false;
	let exceptionsBraceDepth = 0;

	for (const rawLine of output.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;

		if (line.startsWith("ExceptionsList")) {
			inExceptions = true;
			exceptionsBraceDepth = line.endsWith("{") ? 1 : 0;
			continue;
		}

		if (inExceptions) {
			if (line === "}") {
				exceptionsBraceDepth -= 1;
				if (exceptionsBraceDepth <= 0) {
					inExceptions = false;
				}
				continue;
			}
			if (line.endsWith("{")) {
				exceptionsBraceDepth += 1;
				continue;
			}
			const match = line.match(/^\d+\s*:\s*(.+)$/);
			if (match) exceptions.push(match[1].trim());
			continue;
		}

		const match = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.+)$/);
		if (!match) continue;
		scalars[match[1]] = match[2].trim();
	}

	const httpsEnabled = scalars.HTTPSEnable === "1";
	const httpEnabled = scalars.HTTPEnable === "1";
	const pacEnabled = scalars.ProxyAutoConfigEnable === "1";
	const pacUrl =
		pacEnabled && scalars.ProxyAutoConfigURLString
			? scalars.ProxyAutoConfigURLString
			: undefined;

	const httpsHost = httpsEnabled ? scalars.HTTPSProxy : undefined;
	const httpsPort = httpsEnabled ? scalars.HTTPSPort : undefined;
	const httpHost = httpEnabled ? scalars.HTTPProxy : undefined;
	const httpPort = httpEnabled ? scalars.HTTPPort : undefined;

	const httpsProxy = httpsHost
		? `http://${httpsHost}${httpsPort ? `:${httpsPort}` : ""}`
		: null;
	const httpProxy = httpHost
		? `http://${httpHost}${httpPort ? `:${httpPort}` : ""}`
		: null;

	if (!httpsProxy && !httpProxy && !pacUrl) return null;

	const hasStatic = !!(httpsProxy || httpProxy);
	const source: ProxySource = pacUrl
		? hasStatic
			? "scutil+pac"
			: "pac"
		: "scutil";

	return {
		httpsProxy,
		httpProxy,
		noProxy: exceptions.map((e) => e.toLowerCase()),
		source,
		pacUrl,
	};
}

// scutil normalmente responde em milissegundos. Timeout defensivo para não
// bloquear o boot indefinidamente em cenários patológicos (macOS com serviços
// de rede travados). Após o timeout retornamos null — o chamador trata como
// "sem proxy via sistema".
const SCUTIL_TIMEOUT_MS = 3000;

async function readFromScutil(): Promise<Omit<
	ProxyConfig,
	"mode" | "resolvedAt"
> | null> {
	const proc = Bun.spawn(["scutil", "--proxy"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		const stream = proc.stdout;
		const readStdout = stream
			? new Response(stream).text()
			: Promise.resolve("");
		const timeoutSignal = Symbol("scutil-timeout");
		const timeout = new Promise<typeof timeoutSignal>((resolve) => {
			setTimeout(() => resolve(timeoutSignal), SCUTIL_TIMEOUT_MS);
		});
		const exited = await Promise.race([proc.exited, timeout]);
		if (exited === timeoutSignal) {
			console.warn(
				`[proxy] scutil --proxy excedeu ${SCUTIL_TIMEOUT_MS}ms, abortando leitura`,
			);
			try {
				proc.kill();
			} catch {
				/* ignore */
			}
			return null;
		}
		if (exited !== 0) return null;
		const stdout = await readStdout;
		return parseScutilProxy(stdout);
	} catch {
		try {
			proc.kill();
		} catch {
			/* ignore */
		}
		return null;
	}
}

function matchesNoProxyPattern(host: string, pattern: string): boolean {
	const h = host.toLowerCase();
	const p = pattern.toLowerCase().replace(/^\./, "");
	if (!p || p === "*") return true;
	if (p.startsWith("*.")) {
		const suffix = p.slice(1); // ".example.com"
		return h.endsWith(suffix) || h === suffix.slice(1);
	}
	// CIDR ou prefixo numérico (ex.: "169.254/16") — comparação por prefixo.
	if (/^\d+(\.\d+){0,3}(\/\d+)?$/.test(p)) {
		const bare = p.split("/")[0];
		return h === bare || h.startsWith(`${bare}.`);
	}
	return h === p || h.endsWith(`.${p}`);
}

/**
 * Avalia NO_PROXY/ExceptionsList para um hostname. Retorna true quando o host
 * deve bypassar o proxy.
 */
export function shouldBypassProxy(host: string, noProxy: string[]): boolean {
	if (!host) return false;
	return noProxy.some((p) => matchesNoProxyPattern(host, p));
}

/**
 * Retorna a URL do proxy a ser usada para o alvo, ou null para conexão direta.
 * Leva em conta o protocolo (http vs https) e NO_PROXY.
 */
export function getProxyFor(url: string | URL): string | null {
	if (!cached) return null;
	let parsed: URL;
	try {
		parsed = url instanceof URL ? url : new URL(url);
	} catch {
		return null;
	}
	if (shouldBypassProxy(parsed.hostname, cached.noProxy)) return null;
	return parsed.protocol === "https:" ? cached.httpsProxy : cached.httpProxy;
}

function emptyConfig(mode: ProxyMode): ProxyConfig {
	return {
		httpsProxy: null,
		httpProxy: null,
		noProxy: [],
		source: "none",
		mode,
		resolvedAt: Date.now(),
	};
}

async function resolveManual(
	manual: ManualProxySettings | undefined,
): Promise<ProxyConfig> {
	if (!manual) return emptyConfig("manual");
	const account = manualAccountId(manual);
	let auth = "";
	if (manual.username) {
		const encUser = encodeURIComponent(manual.username);
		if (manual.hasPassword) {
			const pw = await getPassword({
				service: PROXY_KEYCHAIN_SERVICE,
				account,
			});
			if (pw) {
				auth = `${encUser}:${encodeURIComponent(pw)}@`;
			} else {
				// Senha marcada como existente mas Keychain retornou vazio. Seguir
				// sem credencial — o fetch vai falhar com 407 e o usuário vê o erro
				// na UI via testProxyConnection.
				auth = `${encUser}@`;
			}
		} else {
			auth = `${encUser}@`;
		}
	}
	const url = `${manual.protocol}://${auth}${manual.host}:${manual.port}`;
	const cfg: ProxyConfig = {
		httpsProxy: url,
		httpProxy: url,
		noProxy: manual.noProxy.map((s) => s.toLowerCase()),
		source: "manual",
		mode: "manual",
		resolvedAt: Date.now(),
		manualAccount: account,
	};
	propagateToEnv(cfg, { overwrite: true });
	return cfg;
}

async function resolveForMode(
	mode: ProxyMode,
	manual?: ManualProxySettings,
): Promise<ProxyConfig> {
	if (mode === "none") {
		clearProxyEnv();
		return emptyConfig("none");
	}

	if (mode === "manual") {
		return resolveManual(manual);
	}

	if (mode === "env") {
		const fromEnv = readFromEnv();
		if (fromEnv) {
			return { ...fromEnv, mode, resolvedAt: Date.now() };
		}
		return emptyConfig("env");
	}

	if (mode === "system") {
		const fromScutil = await readFromScutil();
		if (fromScutil) {
			const cfg: ProxyConfig = { ...fromScutil, mode, resolvedAt: Date.now() };
			propagateToEnv(cfg, { overwrite: true });
			return cfg;
		}
		return emptyConfig("system");
	}

	// auto
	const fromEnv = readFromEnv();
	if (fromEnv) {
		return { ...fromEnv, mode: "auto", resolvedAt: Date.now() };
	}
	const fromScutil = await readFromScutil();
	if (fromScutil) {
		const cfg: ProxyConfig = {
			...fromScutil,
			mode: "auto",
			resolvedAt: Date.now(),
		};
		propagateToEnv(cfg, { overwrite: false });
		return cfg;
	}
	return emptyConfig("auto");
}

/**
 * Remove credenciais de uma URL de proxy, substituindo password por `***`.
 * Usado em logs e no status exposto ao renderer — a senha nunca deve sair
 * do processo bun.
 */
export function redactProxyUrl(url: string | null): string | null {
	if (!url) return url;
	// Fast path: sem credenciais embutidas, não normaliza (WHATWG URL adiciona
	// trailing slash e reordena componentes — evita ruído para testes e logs).
	if (!url.includes("@")) return url;
	try {
		const u = new URL(url);
		if (u.password) u.password = "***";
		return u.toString();
	} catch {
		return url;
	}
}

function logResolved(cfg: ProxyConfig): void {
	console.log(
		`[proxy] mode=${cfg.mode} source=${cfg.source}` +
			` https=${redactProxyUrl(cfg.httpsProxy) ?? "-"}` +
			` http=${redactProxyUrl(cfg.httpProxy) ?? "-"}` +
			` no_proxy=${cfg.noProxy.length}` +
			(cfg.pacUrl ? ` pac=${cfg.pacUrl}` : ""),
	);
}

/**
 * Último `manual` efetivo — guardado para permitir `reloadFromSystem` /
 * re-resolver sem que o chamador precise buscar settings novamente.
 */
let lastManual: ManualProxySettings | undefined;

/**
 * Descobre e armazena a configuração de proxy. Chamar uma vez no startup
 * antes de qualquer fetch. Pode ser chamada novamente para trocar de modo,
 * mas subprocessos já vivos não enxergam a mudança. Nunca lança.
 *
 * `manualConfig` é obrigatório para `mode === "manual"`; nos demais modos é
 * ignorado mas preservado em cache para transições futuras.
 */
export async function initProxy(
	mode: ProxyMode = "auto",
	manualConfig?: ManualProxySettings,
): Promise<ProxyConfig> {
	if (manualConfig !== undefined) lastManual = manualConfig;
	const cfg = await resolveForMode(mode, manualConfig ?? lastManual);
	cached = cfg;
	logResolved(cfg);
	return cfg;
}

/**
 * Re-resolve via `scutil --proxy` quando o modo ativo é "system" ou "auto".
 * Útil quando o usuário troca o proxy do macOS com o app já rodando. Para
 * outros modos, retorna o status atual sem mudar nada.
 */
export async function reloadFromSystem(): Promise<ProxyStatus> {
	if (!cached) {
		return getProxyStatus();
	}
	if (cached.mode !== "system" && cached.mode !== "auto") {
		return getProxyStatus();
	}
	const cfg = await resolveForMode(cached.mode, lastManual);
	cached = cfg;
	logResolved(cfg);
	return getProxyStatus();
}

/**
 * Propaga os valores resolvidos para process.env. Quando o modo é "system",
 * sobrescreve para forçar subprocessos a usarem o proxy do sistema. Quando o
 * modo é "auto" (fallback), preserva valores já definidos pelo usuário.
 */
function propagateToEnv(
	config: ProxyConfig,
	{ overwrite }: { overwrite: boolean },
): void {
	if (config.httpsProxy && (overwrite || !readEnv("HTTPS_PROXY"))) {
		process.env.HTTPS_PROXY = config.httpsProxy;
	}
	if (config.httpProxy && (overwrite || !readEnv("HTTP_PROXY"))) {
		process.env.HTTP_PROXY = config.httpProxy;
	}
	if (config.noProxy.length > 0 && (overwrite || !readEnv("NO_PROXY"))) {
		process.env.NO_PROXY = config.noProxy.join(",");
	}
}

function clearProxyEnv(): void {
	for (const key of PROXY_ENV_KEYS) {
		if (process.env[key] !== undefined) delete process.env[key];
	}
}

/**
 * Retorna a configuração ativa. Útil para testes e diagnóstico.
 */
export function getProxyConfig(): ProxyConfig | null {
	return cached;
}

/**
 * Snapshot serializável para o renderer/UI. Credenciais de senha são
 * sempre redigidas (`user:***@host`) antes de serem expostas.
 */
export function getProxyStatus(): ProxyStatus {
	if (!cached) {
		return {
			mode: "auto",
			source: "none",
			httpsProxy: null,
			httpProxy: null,
			noProxyCount: 0,
			resolvedAt: 0,
		};
	}
	const status: ProxyStatus = {
		mode: cached.mode,
		source: cached.source,
		httpsProxy: redactProxyUrl(cached.httpsProxy),
		httpProxy: redactProxyUrl(cached.httpProxy),
		noProxyCount: cached.noProxy.length,
		resolvedAt: cached.resolvedAt,
	};
	if (cached.pacUrl) status.pacUrl = cached.pacUrl;
	return status;
}

/** Reset interno para testes. */
export function _resetProxyCache(): void {
	cached = null;
	lastManual = undefined;
}

export interface BunFetchInit extends RequestInit {
	proxy?: string;
	verbose?: boolean;
}

/**
 * Wrapper sobre fetch que injeta a opção `proxy` quando há proxy configurado
 * para o alvo. Chamadas via `globalThis.fetch` para preservar a mockabilidade
 * em testes existentes.
 */
export async function fetchWithProxy(
	input: string | URL,
	init?: BunFetchInit,
): Promise<Response> {
	const url = typeof input === "string" ? input : input.toString();
	const proxy = getProxyFor(url);
	const finalInit: BunFetchInit =
		proxy && !init?.proxy ? { ...(init ?? {}), proxy } : (init ?? {});

	try {
		return await globalThis.fetch(
			input as Parameters<typeof globalThis.fetch>[0],
			finalInit as Parameters<typeof globalThis.fetch>[1],
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/socket connection.*closed unexpectedly/i.test(message)) {
			const hint = proxy
				? `proxy configurado: ${proxy}`
				: "nenhum proxy configurado";
			throw new Error(
				`Falha de conexão ao acessar ${url} (${hint}). Verifique a configuração de proxy do sistema.`,
				{ cause: err },
			);
		}
		throw err;
	}
}

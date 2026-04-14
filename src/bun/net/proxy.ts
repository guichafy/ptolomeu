/**
 * Resolução de configuração de proxy para o processo Bun.
 *
 * Ordem de precedência:
 *   1. Variáveis de ambiente padrão Unix (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY,
 *      NO_PROXY — também nas variantes em caixa baixa).
 *   2. Preferências do Sistema macOS via `scutil --proxy`.
 *
 * O Bun fetch aceita a opção `proxy` (extensão específica do runtime) mas não
 * respeita automaticamente as env vars padrão. Por isso este módulo existe:
 * descobre a configuração uma vez, propaga env vars para subprocessos (Claude
 * CLI, SDKs que leem HTTPS_PROXY) e expõe um wrapper `fetchWithProxy` para as
 * chamadas diretas.
 */

export interface ProxyConfig {
	httpProxy: string | null;
	httpsProxy: string | null;
	noProxy: string[];
	source: "env" | "scutil" | "none";
}

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

function readFromEnv(): ProxyConfig | null {
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
 *   }
 *
 * Campos ausentes são tratados como desligados. Retorna `null` quando nenhum
 * proxy HTTP(S) está habilitado.
 */
export function parseScutilProxy(output: string): ProxyConfig | null {
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

	if (!httpsProxy && !httpProxy) return null;

	return {
		httpsProxy,
		httpProxy,
		noProxy: exceptions.map((e) => e.toLowerCase()),
		source: "scutil",
	};
}

async function readFromScutil(): Promise<ProxyConfig | null> {
	try {
		const proc = Bun.spawn(["scutil", "--proxy"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stream = proc.stdout;
		const stdout = stream ? await new Response(stream).text() : "";
		const code = await proc.exited;
		if (code !== 0) return null;
		return parseScutilProxy(stdout);
	} catch {
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

/**
 * Descobre e armazena a configuração de proxy. Chamar uma vez no startup
 * antes de qualquer fetch. Nunca lança.
 */
export async function initProxy(): Promise<ProxyConfig> {
	const fromEnv = readFromEnv();
	if (fromEnv) {
		cached = fromEnv;
		console.log(
			`[proxy] configurado via env vars: https=${fromEnv.httpsProxy ?? "-"} http=${fromEnv.httpProxy ?? "-"} no_proxy=${fromEnv.noProxy.length}`,
		);
		return cached;
	}

	const fromScutil = await readFromScutil();
	if (fromScutil) {
		cached = fromScutil;
		propagateToEnv(fromScutil);
		console.log(
			`[proxy] configurado via scutil: https=${fromScutil.httpsProxy ?? "-"} http=${fromScutil.httpProxy ?? "-"} no_proxy=${fromScutil.noProxy.length}`,
		);
		return cached;
	}

	cached = {
		httpsProxy: null,
		httpProxy: null,
		noProxy: [],
		source: "none",
	};
	console.log("[proxy] nenhum proxy configurado");
	return cached;
}

/**
 * Propaga os valores resolvidos para process.env para que subprocessos (Claude
 * CLI) e SDKs de terceiros (PostHog) que respeitam HTTPS_PROXY/HTTP_PROXY
 * também passem pelo proxy. Preserva valores já definidos pelo usuário.
 */
function propagateToEnv(config: ProxyConfig): void {
	if (config.httpsProxy && !readEnv("HTTPS_PROXY")) {
		process.env.HTTPS_PROXY = config.httpsProxy;
	}
	if (config.httpProxy && !readEnv("HTTP_PROXY")) {
		process.env.HTTP_PROXY = config.httpProxy;
	}
	if (config.noProxy.length > 0 && !readEnv("NO_PROXY")) {
		process.env.NO_PROXY = config.noProxy.join(",");
	}
}

/**
 * Retorna a configuração ativa. Útil para testes e diagnóstico.
 */
export function getProxyConfig(): ProxyConfig | null {
	return cached;
}

/** Reset interno para testes. */
export function _resetProxyCache(): void {
	cached = null;
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

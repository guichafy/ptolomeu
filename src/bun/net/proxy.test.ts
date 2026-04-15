import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	_resetProxyCache,
	fetchWithProxy,
	getProxyConfig,
	getProxyFor,
	getProxyStatus,
	initProxy,
	manualAccountId,
	PROXY_KEYCHAIN_SERVICE,
	parseScutilProxy,
	redactProxyUrl,
	reloadFromSystem,
	shouldBypassProxy,
} from "./proxy";

const originalFetch = globalThis.fetch;
const originalSpawn = (Bun as unknown as { spawn: typeof Bun.spawn }).spawn;
const savedEnv: Record<string, string | undefined> = {};

const ENV_KEYS = [
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"https_proxy",
	"http_proxy",
	"all_proxy",
	"no_proxy",
];

function clearProxyEnv() {
	for (const k of ENV_KEYS) {
		savedEnv[k] = process.env[k];
		delete process.env[k];
	}
}

function restoreProxyEnv() {
	for (const k of ENV_KEYS) {
		if (savedEnv[k] === undefined) delete process.env[k];
		else process.env[k] = savedEnv[k];
	}
}

function mockScutil(stdout: string, exitCode = 0) {
	(Bun as unknown as { spawn: unknown }).spawn = ((...args: unknown[]) => {
		const cmd = args[0] as string[];
		const match = cmd[0] === "scutil" && cmd.includes("--proxy");
		return {
			stdout: new Response(match ? stdout : "").body,
			stderr: new Response("").body,
			exited: Promise.resolve(match ? exitCode : 1),
			exitCode: match ? exitCode : 1,
			kill: () => {},
		};
	}) as typeof Bun.spawn;
}

function mockScutilHanging() {
	const killed = { current: false };
	(Bun as unknown as { spawn: unknown }).spawn = ((..._args: unknown[]) => ({
		stdout: new Response("").body,
		stderr: new Response("").body,
		exited: new Promise<number>(() => {
			/* nunca resolve */
		}),
		exitCode: null,
		kill: () => {
			killed.current = true;
		},
	})) as typeof Bun.spawn;
	return killed;
}

beforeEach(() => {
	_resetProxyCache();
	clearProxyEnv();
});

afterEach(() => {
	restoreProxyEnv();
	globalThis.fetch = originalFetch;
	(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
	vi.restoreAllMocks();
});

describe("parseScutilProxy", () => {
	it("retorna null quando nenhum proxy está habilitado", () => {
		const out = `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
  }
  HTTPEnable : 0
  HTTPSEnable : 0
}`;
		expect(parseScutilProxy(out)).toBeNull();
	});

	it("monta httpsProxy quando HTTPSEnable=1 e extrai ExceptionsList", () => {
		const out = `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254/16
    2 : internal.corp
  }
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : proxy.corp.example
  HTTPSEnable : 1
  HTTPSPort : 8443
  HTTPSProxy : proxy.corp.example
}`;
		const result = parseScutilProxy(out);
		expect(result).not.toBeNull();
		expect(result?.httpsProxy).toBe("http://proxy.corp.example:8443");
		expect(result?.httpProxy).toBe("http://proxy.corp.example:8080");
		expect(result?.noProxy).toEqual(["*.local", "169.254/16", "internal.corp"]);
		expect(result?.source).toBe("scutil");
	});

	it("ignora porta ausente sem crashar", () => {
		const out = `<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : proxy.corp.example
}`;
		const result = parseScutilProxy(out);
		expect(result?.httpsProxy).toBe("http://proxy.corp.example");
		expect(result?.httpProxy).toBeNull();
	});
});

describe("shouldBypassProxy", () => {
	it("match literal", () => {
		expect(shouldBypassProxy("example.com", ["example.com"])).toBe(true);
		expect(shouldBypassProxy("sub.example.com", ["example.com"])).toBe(true);
	});

	it("wildcard *.domain", () => {
		expect(shouldBypassProxy("a.local", ["*.local"])).toBe(true);
		expect(shouldBypassProxy("local", ["*.local"])).toBe(true);
		expect(shouldBypassProxy("remote.com", ["*.local"])).toBe(false);
	});

	it("prefixo numérico/CIDR", () => {
		expect(shouldBypassProxy("169.254.1.2", ["169.254/16"])).toBe(true);
		expect(shouldBypassProxy("10.0.0.1", ["169.254/16"])).toBe(false);
	});

	it("lista vazia não faz bypass", () => {
		expect(shouldBypassProxy("anything.com", [])).toBe(false);
	});
});

describe("initProxy → env vars", () => {
	it("prefere HTTPS_PROXY sobre scutil", async () => {
		process.env.HTTPS_PROXY = "http://env-proxy:3128";
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : should.not.be.used
  HTTPSPort : 1
}`);
		const cfg = await initProxy();
		expect(cfg.source).toBe("env");
		expect(cfg.httpsProxy).toBe("http://env-proxy:3128");
	});

	it("aceita variantes em caixa baixa", async () => {
		process.env.https_proxy = "proxy.lc:8080";
		const cfg = await initProxy();
		expect(cfg.httpsProxy).toBe("http://proxy.lc:8080");
	});

	it("ALL_PROXY preenche ambos http e https", async () => {
		process.env.ALL_PROXY = "http://all:1080";
		const cfg = await initProxy();
		expect(cfg.httpsProxy).toBe("http://all:1080");
		expect(cfg.httpProxy).toBe("http://all:1080");
	});

	it("NO_PROXY é parseado em lista", async () => {
		process.env.HTTPS_PROXY = "http://p:1";
		process.env.NO_PROXY = "localhost, 127.0.0.1 ,*.internal";
		const cfg = await initProxy();
		expect(cfg.noProxy).toEqual(["localhost", "127.0.0.1", "*.internal"]);
	});

	it("sem nada configurado retorna source=none", async () => {
		mockScutil(`<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 0
}`);
		const cfg = await initProxy();
		expect(cfg.source).toBe("none");
		expect(cfg.httpsProxy).toBeNull();
	});

	it("scutil é usado quando nenhuma env var está presente", async () => {
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : sys.proxy
  HTTPSPort : 9000
}`);
		const cfg = await initProxy();
		expect(cfg.source).toBe("scutil");
		expect(cfg.httpsProxy).toBe("http://sys.proxy:9000");
	});

	it("scutil propaga HTTPS_PROXY para process.env", async () => {
		expect(process.env.HTTPS_PROXY).toBeUndefined();
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : sys.proxy
  HTTPSPort : 9000
}`);
		await initProxy();
		expect(process.env.HTTPS_PROXY).toBe("http://sys.proxy:9000");
	});

	it("env vars presentes não são sobrescritas pela propagação do scutil", async () => {
		process.env.HTTPS_PROXY = "http://user-set:1111";
		const cfg = await initProxy();
		expect(cfg.source).toBe("env");
		expect(process.env.HTTPS_PROXY).toBe("http://user-set:1111");
	});
});

describe("getProxyFor", () => {
	it("retorna https proxy para URL https", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		process.env.HTTP_PROXY = "http://p2:8080";
		await initProxy();
		expect(getProxyFor("https://api.github.com")).toBe("http://p:8080");
	});

	it("retorna http proxy para URL http", async () => {
		process.env.HTTP_PROXY = "http://p2:8080";
		await initProxy();
		expect(getProxyFor("http://example.com")).toBe("http://p2:8080");
	});

	it("respeita NO_PROXY", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		process.env.NO_PROXY = "*.internal";
		await initProxy();
		expect(getProxyFor("https://api.internal")).toBeNull();
		expect(getProxyFor("https://api.github.com")).toBe("http://p:8080");
	});

	it("retorna null quando proxy não foi inicializado", () => {
		_resetProxyCache();
		expect(getProxyFor("https://x.com")).toBeNull();
	});

	it("URL inválida retorna null", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		await initProxy();
		expect(getProxyFor("isto-nao-eh-url")).toBeNull();
	});
});

describe("fetchWithProxy", () => {
	it("injeta proxy no init quando há configuração", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		await initProxy();
		const mock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
			expect((init as { proxy?: string })?.proxy).toBe("http://p:8080");
			return new Response("{}", { status: 200 });
		});
		globalThis.fetch = mock as unknown as typeof fetch;
		await fetchWithProxy("https://api.github.com");
		expect(mock).toHaveBeenCalledTimes(1);
	});

	it("não adiciona proxy quando não há configuração", async () => {
		mockScutil(`<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 0
}`);
		await initProxy();
		const mock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
			expect((init as { proxy?: string })?.proxy).toBeUndefined();
			return new Response("{}", { status: 200 });
		});
		globalThis.fetch = mock as unknown as typeof fetch;
		await fetchWithProxy("https://api.github.com");
		expect(mock).toHaveBeenCalledTimes(1);
	});

	it("preserva headers passados pelo chamador", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		await initProxy();
		const mock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
			const h = new Headers(init?.headers);
			expect(h.get("X-Test")).toBe("yes");
			return new Response("{}", { status: 200 });
		});
		globalThis.fetch = mock as unknown as typeof fetch;
		await fetchWithProxy("https://api.github.com", {
			headers: { "X-Test": "yes" },
		});
	});

	it("bypassa proxy quando NO_PROXY bate", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		process.env.NO_PROXY = "github.com";
		await initProxy();
		const mock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
			expect((init as { proxy?: string })?.proxy).toBeUndefined();
			return new Response("{}", { status: 200 });
		});
		globalThis.fetch = mock as unknown as typeof fetch;
		await fetchWithProxy("https://api.github.com");
	});

	it("reempacota erro de socket com mensagem amigável", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		await initProxy();
		globalThis.fetch = vi.fn(async () => {
			throw new Error(
				"The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()",
			);
		}) as unknown as typeof fetch;
		await expect(fetchWithProxy("https://api.github.com")).rejects.toThrow(
			/Falha de conexão.*proxy configurado: http:\/\/p:8080/i,
		);
	});

	it("ignora configurações iniciais com cached=none", async () => {
		expect(getProxyConfig()).toBeNull();
	});
});

describe("initProxy → mode=system", () => {
	it("ignora env vars e força scutil", async () => {
		process.env.HTTPS_PROXY = "http://env-only:1111";
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : sys.proxy
  HTTPSPort : 9000
}`);
		const cfg = await initProxy("system");
		expect(cfg.source).toBe("scutil");
		expect(cfg.httpsProxy).toBe("http://sys.proxy:9000");
	});

	it("sobrescreve HTTPS_PROXY do ambiente com valor do scutil", async () => {
		process.env.HTTPS_PROXY = "http://env-only:1111";
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : sys.proxy
  HTTPSPort : 9000
}`);
		await initProxy("system");
		expect(process.env.HTTPS_PROXY).toBe("http://sys.proxy:9000");
	});

	it("retorna source=none quando scutil não tem proxy", async () => {
		mockScutil(`<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 0
}`);
		const cfg = await initProxy("system");
		expect(cfg.source).toBe("none");
		expect(cfg.mode).toBe("system");
	});
});

describe("initProxy → mode=env", () => {
	it("usa env vars sem cair em scutil", async () => {
		process.env.HTTPS_PROXY = "http://env-only:1111";
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : sys.proxy
  HTTPSPort : 9000
}`);
		const cfg = await initProxy("env");
		expect(cfg.source).toBe("env");
		expect(cfg.httpsProxy).toBe("http://env-only:1111");
	});

	it("retorna source=none quando env vars ausentes (não cai em scutil)", async () => {
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : sys.proxy
  HTTPSPort : 9000
}`);
		const cfg = await initProxy("env");
		expect(cfg.source).toBe("none");
		expect(cfg.mode).toBe("env");
		expect(cfg.httpsProxy).toBeNull();
	});
});

describe("initProxy → mode=none", () => {
	it("limpa env vars HTTPS_PROXY/HTTP_PROXY/ALL_PROXY/NO_PROXY", async () => {
		process.env.HTTPS_PROXY = "http://x:1";
		process.env.HTTP_PROXY = "http://x:2";
		process.env.ALL_PROXY = "http://x:3";
		process.env.NO_PROXY = "*.local";
		process.env.https_proxy = "http://y:1";
		const cfg = await initProxy("none");
		expect(cfg.source).toBe("none");
		expect(cfg.httpsProxy).toBeNull();
		expect(process.env.HTTPS_PROXY).toBeUndefined();
		expect(process.env.HTTP_PROXY).toBeUndefined();
		expect(process.env.ALL_PROXY).toBeUndefined();
		expect(process.env.NO_PROXY).toBeUndefined();
		expect(process.env.https_proxy).toBeUndefined();
	});

	it("getProxyFor retorna null em mode=none", async () => {
		process.env.HTTPS_PROXY = "http://x:1";
		await initProxy("none");
		expect(getProxyFor("https://api.github.com")).toBeNull();
	});
});

describe("reloadFromSystem", () => {
	it("re-resolve scutil em mode=system e atualiza cached", async () => {
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : first.proxy
  HTTPSPort : 1
}`);
		await initProxy("system");
		expect(getProxyStatus().httpsProxy).toBe("http://first.proxy:1");

		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : second.proxy
  HTTPSPort : 2
}`);
		const status = await reloadFromSystem();
		expect(status.httpsProxy).toBe("http://second.proxy:2");
		expect(status.mode).toBe("system");
	});

	it("é noop em mode=env (não roda scutil)", async () => {
		process.env.HTTPS_PROXY = "http://env:1";
		await initProxy("env");
		mockScutil(`<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : should.not.be.read
  HTTPSPort : 9
}`);
		const status = await reloadFromSystem();
		expect(status.mode).toBe("env");
		expect(status.httpsProxy).toBe("http://env:1");
	});

	it("é noop em mode=none", async () => {
		await initProxy("none");
		const status = await reloadFromSystem();
		expect(status.mode).toBe("none");
		expect(status.httpsProxy).toBeNull();
	});

	it("antes de initProxy retorna status default", async () => {
		_resetProxyCache();
		const status = await reloadFromSystem();
		expect(status.source).toBe("none");
		expect(status.resolvedAt).toBe(0);
	});
});

describe("readFromScutil timeout", () => {
	it("aborta após timeout quando scutil trava e retorna source=none", async () => {
		vi.useFakeTimers();
		try {
			const killed = mockScutilHanging();
			const promise = initProxy("system");
			// Avança o relógio para disparar o timeout interno (SCUTIL_TIMEOUT_MS).
			await vi.advanceTimersByTimeAsync(5000);
			const cfg = await promise;
			expect(cfg.source).toBe("none");
			expect(cfg.mode).toBe("system");
			expect(killed.current).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("parseScutilProxy → PAC", () => {
	it("detecta ProxyAutoConfigURLString e source=pac", () => {
		const out = `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
  }
  HTTPEnable : 0
  HTTPSEnable : 0
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : http://wpad.corp/proxy.pac
}`;
		const result = parseScutilProxy(out);
		expect(result).not.toBeNull();
		expect(result?.source).toBe("pac");
		expect(result?.pacUrl).toBe("http://wpad.corp/proxy.pac");
		expect(result?.httpsProxy).toBeNull();
	});

	it("source=scutil+pac quando PAC e proxy estático coexistem", () => {
		const out = `<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : proxy.corp
  HTTPSPort : 8443
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : http://wpad.corp/proxy.pac
}`;
		const result = parseScutilProxy(out);
		expect(result?.source).toBe("scutil+pac");
		expect(result?.httpsProxy).toBe("http://proxy.corp:8443");
		expect(result?.pacUrl).toBe("http://wpad.corp/proxy.pac");
	});

	it("ignora PAC quando ProxyAutoConfigEnable=0", () => {
		const out = `<dictionary> {
  HTTPSEnable : 1
  HTTPSProxy : proxy.corp
  HTTPSPort : 8443
  ProxyAutoConfigEnable : 0
  ProxyAutoConfigURLString : http://wpad.corp/proxy.pac
}`;
		const result = parseScutilProxy(out);
		expect(result?.source).toBe("scutil");
		expect(result?.pacUrl).toBeUndefined();
	});
});

describe("redactProxyUrl", () => {
	it("preserva URLs sem credenciais sem normalização", () => {
		expect(redactProxyUrl("http://proxy:8080")).toBe("http://proxy:8080");
	});

	it("redige senha preservando usuário", () => {
		const r = redactProxyUrl("http://alice:s3cret@proxy:8080");
		expect(r).not.toBeNull();
		expect(r).toContain("alice");
		expect(r).toContain("***");
		expect(r).not.toContain("s3cret");
	});

	it("retorna null para null", () => {
		expect(redactProxyUrl(null)).toBeNull();
	});

	it("retorna url original quando parsing falha", () => {
		expect(redactProxyUrl("not-a-url@")).toBe("not-a-url@");
	});
});

describe("manualAccountId", () => {
	it("compõe identificador padrão protocolo://host:porta", () => {
		expect(
			manualAccountId({
				protocol: "http",
				host: "proxy.corp",
				port: 8080,
				hasPassword: false,
				noProxy: [],
			}),
		).toBe("http://proxy.corp:8080");
	});
});

describe("initProxy → mode=manual", () => {
	function mockSecurityFind(password: string, exitCode = 0) {
		(Bun as unknown as { spawn: unknown }).spawn = ((...args: unknown[]) => {
			const cmd = args[0] as string[];
			const isFind =
				cmd[0] === "security" && cmd.includes("find-generic-password");
			return {
				stdout: new Response(isFind ? password : "").body,
				stderr: new Response("").body,
				exited: Promise.resolve(isFind ? exitCode : 1),
				exitCode: isFind ? exitCode : 1,
				kill: () => {},
			};
		}) as typeof Bun.spawn;
	}

	it("monta URL com usuário e senha do Keychain", async () => {
		mockSecurityFind("s3cret\n");
		const cfg = await initProxy("manual", {
			protocol: "http",
			host: "proxy.corp",
			port: 8080,
			username: "alice",
			hasPassword: true,
			noProxy: [],
		});
		expect(cfg.source).toBe("manual");
		expect(cfg.httpsProxy).toBe("http://alice:s3cret@proxy.corp:8080");
		expect(cfg.httpProxy).toBe("http://alice:s3cret@proxy.corp:8080");
		expect(cfg.manualAccount).toBe("http://proxy.corp:8080");
	});

	it("encode safe de chars especiais na senha", async () => {
		mockSecurityFind("p@ss:word/!\n");
		const cfg = await initProxy("manual", {
			protocol: "https",
			host: "proxy.corp",
			port: 443,
			username: "bob",
			hasPassword: true,
			noProxy: [],
		});
		// encodeURIComponent("p@ss:word/!") = "p%40ss%3Aword%2F!"
		expect(cfg.httpsProxy).toContain("bob:p%40ss%3Aword%2F!@proxy.corp:443");
	});

	it("propaga HTTPS_PROXY para process.env com overwrite", async () => {
		process.env.HTTPS_PROXY = "http://old-env:1";
		mockSecurityFind("pw\n");
		await initProxy("manual", {
			protocol: "http",
			host: "proxy.corp",
			port: 8080,
			username: "alice",
			hasPassword: true,
			noProxy: [],
		});
		expect(process.env.HTTPS_PROXY).toBe("http://alice:pw@proxy.corp:8080");
	});

	it("sem username gera URL sem credencial", async () => {
		mockSecurityFind("", 44);
		const cfg = await initProxy("manual", {
			protocol: "http",
			host: "proxy.corp",
			port: 3128,
			hasPassword: false,
			noProxy: [],
		});
		expect(cfg.httpsProxy).toBe("http://proxy.corp:3128");
	});

	it("hasPassword=true mas Keychain vazio cai para sem senha", async () => {
		mockSecurityFind("", 44);
		const cfg = await initProxy("manual", {
			protocol: "http",
			host: "proxy.corp",
			port: 3128,
			username: "alice",
			hasPassword: true,
			noProxy: [],
		});
		expect(cfg.httpsProxy).toBe("http://alice@proxy.corp:3128");
	});

	it("manual sem config retorna source=none", async () => {
		const cfg = await initProxy("manual");
		expect(cfg.source).toBe("none");
		expect(cfg.mode).toBe("manual");
	});

	it("noProxy é aplicado em getProxyFor", async () => {
		mockSecurityFind("pw\n");
		await initProxy("manual", {
			protocol: "http",
			host: "proxy.corp",
			port: 8080,
			username: "alice",
			hasPassword: true,
			noProxy: ["*.internal"],
		});
		expect(getProxyFor("https://api.internal")).toBeNull();
		expect(getProxyFor("https://api.github.com")).toBe(
			"http://alice:pw@proxy.corp:8080",
		);
	});

	it("status redige senha antes de expor ao renderer", async () => {
		mockSecurityFind("s3cret\n");
		await initProxy("manual", {
			protocol: "http",
			host: "proxy.corp",
			port: 8080,
			username: "alice",
			hasPassword: true,
			noProxy: [],
		});
		const status = getProxyStatus();
		expect(status.httpsProxy).toContain("alice");
		expect(status.httpsProxy).toContain("***");
		expect(status.httpsProxy).not.toContain("s3cret");
	});
});

describe("PROXY_KEYCHAIN_SERVICE", () => {
	it("é a constante única compartilhada com o RPC", () => {
		expect(PROXY_KEYCHAIN_SERVICE).toBe("com.ptolomeu.app.proxy");
	});
});

describe("getProxyStatus", () => {
	it("retorna snapshot serializável", async () => {
		process.env.HTTPS_PROXY = "http://p:8080";
		process.env.HTTP_PROXY = "http://p2:8080";
		process.env.NO_PROXY = "*.local,localhost";
		await initProxy("env");
		const status = getProxyStatus();
		expect(status).toEqual({
			mode: "env",
			source: "env",
			httpsProxy: "http://p:8080",
			httpProxy: "http://p2:8080",
			noProxyCount: 2,
			resolvedAt: expect.any(Number),
		});
	});

	it("retorna mode=auto e source=none antes do initProxy", () => {
		_resetProxyCache();
		const status = getProxyStatus();
		expect(status.mode).toBe("auto");
		expect(status.source).toBe("none");
	});
});

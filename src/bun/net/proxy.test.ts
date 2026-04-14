import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	_resetProxyCache,
	fetchWithProxy,
	getProxyConfig,
	getProxyFor,
	initProxy,
	parseScutilProxy,
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
		};
	}) as typeof Bun.spawn;
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

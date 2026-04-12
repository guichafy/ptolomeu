import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeAuthStatus {
	mode: "anthropic" | "bedrock" | "none";
	anthropic?: { connected: boolean; email?: string };
	bedrock?: { endpoint: string; profile: string; region: string };
}

export interface BedrockConfig {
	endpoint: string;
	profile: string;
	region: string;
}

interface AnthropicToken {
	email: string;
	token: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const AUTH_DIR = join(homedir(), ".ptolomeu", "auth");
const ANTHROPIC_PATH = join(AUTH_DIR, "anthropic.json");
const BEDROCK_PATH = join(AUTH_DIR, "bedrock.json");

const ANTHROPIC_CONSOLE_URL = "https://console.anthropic.com/settings/keys";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureAuthDir(): Promise<void> {
	await mkdir(AUTH_DIR, { recursive: true });
}

function isAnthropicToken(value: unknown): value is AnthropicToken {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.email === "string" &&
		!!v.email &&
		typeof v.token === "string" &&
		!!v.token
	);
}

function isBedrockConfig(value: unknown): value is BedrockConfig {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.endpoint === "string" &&
		!!v.endpoint &&
		typeof v.profile === "string" &&
		!!v.profile &&
		typeof v.region === "string" &&
		!!v.region
	);
}

async function readAnthropicToken(): Promise<AnthropicToken | null> {
	const file = Bun.file(ANTHROPIC_PATH);
	if (!(await file.exists())) return null;
	try {
		const parsed = JSON.parse(await file.text());
		return isAnthropicToken(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the current authentication status by inspecting stored credentials.
 * Checks for Anthropic SSO token first, then Bedrock config.
 */
export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
	const [anthropicToken, bedrockConfig] = await Promise.all([
		readAnthropicToken(),
		getBedrockConfig(),
	]);

	if (anthropicToken) {
		return {
			mode: "anthropic",
			anthropic: { connected: true, email: anthropicToken.email },
		};
	}

	if (bedrockConfig) {
		return {
			mode: "bedrock",
			bedrock: {
				endpoint: bedrockConfig.endpoint,
				profile: bedrockConfig.profile,
				region: bedrockConfig.region,
			},
		};
	}

	return { mode: "none" };
}

/**
 * Starts the Anthropic SSO login flow by opening the console in the browser.
 *
 * In a full implementation this would coordinate with the Claude Agent SDK OAuth
 * flow. For now it opens the Anthropic console and expects the token to be
 * provided separately via a future callback / paste mechanism.
 */
export async function loginAnthropicSSO(): Promise<{
	ok: boolean;
	error?: string;
}> {
	try {
		await ensureAuthDir();

		// Open the Anthropic console in the default browser
		const proc = Bun.spawn(["open", ANTHROPIC_CONSOLE_URL], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const code = await proc.exited;

		if (code !== 0) {
			return { ok: false, error: "Falha ao abrir o navegador" };
		}

		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Erro desconhecido",
		};
	}
}

/**
 * Saves an Anthropic SSO token obtained from the OAuth flow.
 */
export async function saveAnthropicToken(
	email: string,
	token: string,
): Promise<{ ok: boolean; error?: string }> {
	const trimmedEmail = email.trim();
	const trimmedToken = token.trim();
	if (!trimmedEmail || !trimmedToken) {
		return { ok: false, error: "Email e token sao obrigatorios" };
	}

	try {
		await ensureAuthDir();
		const data: AnthropicToken = { email: trimmedEmail, token: trimmedToken };
		await Bun.write(ANTHROPIC_PATH, JSON.stringify(data, null, 2));
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Falha ao salvar token",
		};
	}
}

/**
 * Clears the Anthropic SSO token, effectively logging out.
 */
export async function logoutAnthropicSSO(): Promise<boolean> {
	try {
		const file = Bun.file(ANTHROPIC_PATH);
		if (await file.exists()) {
			// Overwrite with empty object then remove by writing empty
			const { unlink } = await import("node:fs/promises");
			await unlink(ANTHROPIC_PATH);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Reads the Bedrock configuration from `~/.ptolomeu/auth/bedrock.json`.
 * Returns `null` if the file doesn't exist or contains invalid data.
 */
export async function getBedrockConfig(): Promise<BedrockConfig | null> {
	const file = Bun.file(BEDROCK_PATH);
	if (!(await file.exists())) return null;
	try {
		const parsed = JSON.parse(await file.text());
		return isBedrockConfig(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Saves the Bedrock configuration to `~/.ptolomeu/auth/bedrock.json`.
 */
export async function setBedrockConfig(
	config: BedrockConfig,
): Promise<boolean> {
	if (!isBedrockConfig(config)) return false;
	try {
		await ensureAuthDir();
		const data: BedrockConfig = {
			endpoint: config.endpoint.trim(),
			profile: config.profile.trim(),
			region: config.region.trim(),
		};
		await Bun.write(BEDROCK_PATH, JSON.stringify(data, null, 2));
		return true;
	} catch {
		return false;
	}
}

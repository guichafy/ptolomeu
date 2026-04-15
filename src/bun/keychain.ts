/**
 * Wrapper genérico sobre o macOS Keychain via `security` CLI.
 *
 * Usado hoje para senha do proxy manual. Segue o mesmo padrão de
 * `github-token.ts` (que faz seu próprio wrapping específico do PAT),
 * mas exposto como API reutilizável com `service`/`account` livres.
 *
 * Nota: a senha passa em argv para `security` — visível via `ps` apenas para
 * processos do mesmo uid. Risco aceito por consistência com o wrapper
 * existente do GitHub PAT.
 */

export interface KeychainRef {
	service: string;
	account: string;
}

export interface KeychainSetResult {
	ok: boolean;
	error?: string;
}

async function readStream(
	stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
	if (!stream) return "";
	return new Response(stream).text();
}

export async function getPassword(ref: KeychainRef): Promise<string | null> {
	const proc = Bun.spawn(
		[
			"security",
			"find-generic-password",
			"-a",
			ref.account,
			"-s",
			ref.service,
			"-w",
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [stdout, code] = await Promise.all([
		readStream(proc.stdout),
		proc.exited,
	]);
	if (code !== 0) return null;
	const value = stdout.trim();
	return value.length > 0 ? value : null;
}

export async function hasPassword(ref: KeychainRef): Promise<boolean> {
	const pw = await getPassword(ref);
	return pw !== null;
}

export async function setPassword(
	ref: KeychainRef,
	password: string,
): Promise<KeychainSetResult> {
	if (!password) return { ok: false, error: "Senha vazia" };
	const proc = Bun.spawn(
		[
			"security",
			"add-generic-password",
			"-U",
			"-a",
			ref.account,
			"-s",
			ref.service,
			"-w",
			password,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [stderr, code] = await Promise.all([
		readStream(proc.stderr),
		proc.exited,
	]);
	if (code !== 0) {
		const msg = stderr.trim() || "Falha ao gravar no Keychain";
		return { ok: false, error: msg };
	}
	return { ok: true };
}

export async function deletePassword(ref: KeychainRef): Promise<boolean> {
	const proc = Bun.spawn(
		[
			"security",
			"delete-generic-password",
			"-a",
			ref.account,
			"-s",
			ref.service,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const code = await proc.exited;
	return code === 0;
}

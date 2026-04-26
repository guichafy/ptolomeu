import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

function timestampForPath(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function tempPathFor(path: string): string {
	return join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${timestampForPath()}.${crypto.randomUUID()}.tmp`,
	);
}

export async function writeJsonAtomic(
	path: string,
	value: unknown,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = tempPathFor(path);
	try {
		await writeFile(tmp, JSON.stringify(value, null, 2));
		await rename(tmp, path);
	} catch (err) {
		await rm(tmp, { force: true }).catch(() => {});
		throw err;
	}
}

export async function backupCorruptJson(path: string): Promise<string | null> {
	if (!existsSync(path)) return null;
	const backupPath = `${path}.corrupt-${timestampForPath()}`;
	try {
		await rename(path, backupPath);
		return backupPath;
	} catch {
		return null;
	}
}

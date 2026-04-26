import { readFile, writeFile } from "node:fs/promises";
import { vi } from "vitest";

// Minimal Bun global shim for Node/Vitest environment.
// Tests that exercise Bun.spawn replace this with mockSpawn().
if (typeof globalThis.Bun === "undefined") {
	(globalThis as unknown as Record<string, unknown>).Bun = {
		spawn: vi.fn(() => {
			throw new Error("Bun.spawn not mocked in this test");
		}),
		// Bridge Bun.file / Bun.write for modules that still use Bun's fs APIs
		// in tests that don't mock those modules.
		file: (path: string) => ({
			exists: async () => {
				try {
					await readFile(path);
					return true;
				} catch {
					return false;
				}
			},
			text: async () => readFile(path, "utf8"),
		}),
		write: async (path: string, content: string | Uint8Array) => {
			const { mkdir, dirname } = await import("node:path").then(async (p) => ({
				mkdir: (await import("node:fs/promises")).mkdir,
				dirname: p.dirname,
			}));
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content);
			return typeof content === "string"
				? content.length
				: (content as Uint8Array).byteLength;
		},
	};
}

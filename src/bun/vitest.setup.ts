import { vi } from "vitest";

// Minimal Bun global shim for Node/Vitest environment.
// Tests that exercise Bun.spawn replace this with mockSpawn().
if (typeof globalThis.Bun === "undefined") {
	(globalThis as unknown as Record<string, unknown>).Bun = {
		spawn: vi.fn(() => {
			throw new Error("Bun.spawn not mocked in this test");
		}),
	};
}

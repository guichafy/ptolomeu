import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom doesn't implement these DOM APIs that Radix/dnd-kit rely on.
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
if (typeof Element.prototype.scrollIntoView === "undefined") {
	Element.prototype.scrollIntoView = vi.fn();
}
// Radix Dialog uses hasPointerCapture / setPointerCapture which jsdom lacks.
if (typeof Element.prototype.hasPointerCapture === "undefined") {
	Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.releasePointerCapture === "undefined") {
	Element.prototype.releasePointerCapture = () => {};
}

// WARNING: do NOT rely on `vi.mock("node:os")` in the jsdom project — the
// homedir() export is not intercepted reliably here, which previously caused
// tests to pollute the real ~/Library/Application Support/com.ptolomeu.app/
// settings.json file. If you need to redirect settings I/O, either:
//   a) put the test in the "node" project (src/bun/**) — see
//      src/bun/settings-io.test.ts, or
//   b) mock the RPC boundary with an in-memory fake — see
//      src/mainview/providers/app-composition.test.tsx.
afterEach(() => {
	cleanup();
});

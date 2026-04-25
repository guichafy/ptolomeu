import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	__resetModelsCache,
	getModels,
	invalidate,
	peekModels,
	putModelsFromInit,
} from "./models-cache";

const SAMPLE: ModelInfo[] = [
	{ value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", description: "" },
	{ value: "claude-opus-4-6", displayName: "Opus 4.6", description: "" },
];

afterEach(() => __resetModelsCache());

describe("models-cache", () => {
	test("peekModels returns null on cold cache", () => {
		expect(peekModels("anthropic")).toBeNull();
	});

	test("putModelsFromInit fills cache for current authMode (defaults to anthropic)", async () => {
		await putModelsFromInit(SAMPLE);
		expect(peekModels("anthropic")).toEqual(SAMPLE);
	});

	test("invalidate clears the entry for one authMode", async () => {
		await putModelsFromInit(SAMPLE);
		invalidate("anthropic");
		expect(peekModels("anthropic")).toBeNull();
	});

	test("invalidate() with no args clears all", async () => {
		await putModelsFromInit(SAMPLE);
		invalidate();
		expect(peekModels("anthropic")).toBeNull();
	});

	test("getModels uses discovery when cache empty", async () => {
		const discover = vi.fn().mockResolvedValue(SAMPLE);
		const models = await getModels("anthropic", { discover });
		expect(models).toEqual(SAMPLE);
		expect(discover).toHaveBeenCalledOnce();
	});

	test("getModels is single-flight under concurrent calls", async () => {
		const discover = vi
			.fn()
			.mockImplementation(
				() => new Promise<ModelInfo[]>((r) => setTimeout(() => r(SAMPLE), 10)),
			);
		const [a, b] = await Promise.all([
			getModels("anthropic", { discover }),
			getModels("anthropic", { discover }),
		]);
		expect(a).toEqual(SAMPLE);
		expect(b).toEqual(SAMPLE);
		expect(discover).toHaveBeenCalledOnce();
	});

	test("discovery failure does not poison the cache", async () => {
		const discover = vi.fn().mockRejectedValue(new Error("offline"));
		await expect(getModels("anthropic", { discover })).rejects.toThrow(
			/offline/,
		);
		expect(peekModels("anthropic")).toBeNull();
	});
});

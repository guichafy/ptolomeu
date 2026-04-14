import type { ChatBlock, ToolResultBlock } from "../types";

/**
 * Builds a map from tool_use ID to its corresponding tool_result block.
 * Used to pair tool invocations with their results at render time.
 */
export function pairToolResults(
	blocks: ChatBlock[],
): Map<string, ToolResultBlock> {
	const map = new Map<string, ToolResultBlock>();
	for (const b of blocks) {
		if (b.type === "tool_result") {
			map.set(b.toolUseId, b);
		}
	}
	return map;
}

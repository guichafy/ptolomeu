import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { pairToolResults } from "../lib/pair-tool-blocks";
import type { ChatMessage } from "../types";
import { MarkdownContent } from "./blocks/markdown-content";
import { ReasoningBlock } from "./blocks/reasoning-block";
import { ToolInvocationBlock } from "./blocks/tool-invocation-block";

interface MessageProps {
	message: ChatMessage;
}

export function Message({ message }: MessageProps) {
	if (message.role === "user") {
		return <UserMessage message={message} />;
	}
	return <AssistantMessage message={message} />;
}

function UserMessage({ message }: { message: ChatMessage }) {
	const textContent = message.blocks
		.filter((b): b is { type: "text"; text: string } => b.type === "text")
		.map((b) => b.text)
		.join("");

	return (
		<div className="mb-3 text-right">
			<div className="inline-block max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
				{textContent}
			</div>
		</div>
	);
}

function AssistantMessage({ message }: { message: ChatMessage }) {
	const resultMap = useMemo(
		() => pairToolResults(message.blocks),
		[message.blocks],
	);

	return (
		<div className="mb-3 text-left">
			<div className={cn("max-w-full")}>
				{message.blocks.map((block, i) => {
					const key = `${message.id}-block-${i}`;
					switch (block.type) {
						case "text":
							return <MarkdownContent key={key} content={block.text} />;
						case "thinking":
							return (
								<ReasoningBlock
									key={key}
									thinking={block.thinking}
									durationMs={block.durationMs}
								/>
							);
						case "tool_use": {
							const paired = resultMap.get(block.id);
							return (
								<ToolInvocationBlock
									key={key}
									name={block.name}
									input={block.input}
									status={block.status}
									elapsedSeconds={block.elapsedSeconds}
									result={
										paired
											? { content: paired.content, isError: paired.isError }
											: undefined
									}
								/>
							);
						}
						case "tool_result":
							return null;
						default:
							return null;
					}
				})}
			</div>
		</div>
	);
}

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ChatBlock, ChatMessage, SessionState } from "../types";
import { MarkdownContent } from "./blocks/markdown-content";
import { ReasoningBlock } from "./blocks/reasoning-block";
import { ToolResultBlock } from "./blocks/tool-result-block";
import { ToolUseBlock } from "./blocks/tool-use-block";
import { Loader } from "./loader";
import { Message } from "./message";
import { TurnMeta } from "./turn-meta";

interface ConversationProps {
	messages: ChatMessage[];
	streamingBlocks: ChatBlock[];
	sessionState: SessionState;
}

export function Conversation({
	messages,
	streamingBlocks,
	sessionState,
}: ConversationProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [stickToBottom, setStickToBottom] = useState(true);

	// Observe bottom sentinel for stick-to-bottom behavior
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				setStickToBottom(entry.isIntersecting);
			},
			{ root: scrollRef.current, threshold: 0.1 },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	// Auto-scroll when sticking to bottom and content changes
	const scrollToBottom = useCallback(() => {
		if (stickToBottom) {
			sentinelRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [stickToBottom]);

	const messageCount = messages.length;
	const blockCount = streamingBlocks.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional triggers for auto-scroll
	useEffect(() => {
		scrollToBottom();
	}, [messageCount, blockCount, scrollToBottom]);

	const isStreaming =
		sessionState === "streaming" || sessionState === "tool_running";
	const showLoader = isStreaming && streamingBlocks.length === 0;
	const showStreamingBlocks = streamingBlocks.length > 0;

	return (
		<div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
			{messages.length === 0 && !isStreaming && (
				<div className="flex h-full items-center justify-center">
					<p className="text-sm text-muted-foreground/50">
						Nenhuma mensagem ainda.
					</p>
				</div>
			)}

			{messages.map((msg) => (
				<Fragment key={msg.id}>
					<Message message={msg} />
					{msg.role === "assistant" &&
						(msg.cost != null ||
							msg.durationMs != null ||
							msg.tokenUsage != null) && (
							<TurnMeta
								cost={msg.cost}
								durationMs={msg.durationMs}
								tokenUsage={msg.tokenUsage}
							/>
						)}
				</Fragment>
			))}

			{/* Streaming blocks (assistant response in progress) */}
			{showStreamingBlocks && (
				<div className="mb-3 text-left">
					<div className="max-w-full">
						{streamingBlocks.map((block, i) => {
							const key = `streaming-block-${i}`;
							switch (block.type) {
								case "text":
									return <MarkdownContent key={key} content={block.text} />;
								case "thinking":
									return (
										<ReasoningBlock
											key={key}
											thinking={block.thinking}
											durationMs={block.durationMs}
											isStreaming
										/>
									);
								case "tool_use":
									return (
										<ToolUseBlock
											key={key}
											name={block.name}
											input={block.input}
											status={block.status}
											elapsedSeconds={block.elapsedSeconds}
										/>
									);
								case "tool_result":
									return (
										<ToolResultBlock
											key={key}
											content={block.content}
											isError={block.isError}
										/>
									);
								default:
									return null;
							}
						})}
					</div>
				</div>
			)}

			{showLoader && <Loader />}

			{/* Bottom sentinel for IntersectionObserver */}
			<div ref={sentinelRef} className="h-1" />
		</div>
	);
}

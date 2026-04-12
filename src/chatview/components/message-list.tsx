import { useEffect, useRef } from "react";
import type { StoredMessage } from "../rpc";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
	messages: StoredMessage[];
	streamingText: string;
	isStreaming: boolean;
}

export function MessageList({
	messages,
	streamingText,
	isStreaming,
}: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when messages change or streaming text updates
	const messageCount = messages.length;
	const streamingLen = streamingText.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional triggers for auto-scroll
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messageCount, streamingLen]);

	return (
		<div className="flex-1 overflow-y-auto p-4">
			{messages.length === 0 && !isStreaming && (
				<div className="flex h-full items-center justify-center">
					<p className="text-sm text-muted-foreground/50">
						Nenhuma mensagem ainda.
					</p>
				</div>
			)}

			{messages.map((msg) => (
				<MessageBubble
					key={`${msg.role}-${msg.timestamp}`}
					role={msg.role}
					content={msg.content}
				/>
			))}

			{isStreaming && streamingText && (
				<div className="mb-3 text-left">
					<div className="inline-block max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
						{streamingText}
						<span className="ml-1 inline-block animate-pulse">&#x258A;</span>
					</div>
				</div>
			)}

			<div ref={bottomRef} />
		</div>
	);
}

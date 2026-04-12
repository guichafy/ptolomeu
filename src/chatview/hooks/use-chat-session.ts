import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredMessage } from "../rpc";
import { rpc, setStreamHandlers } from "../rpc";

export function useChatSession() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [messages, setMessages] = useState<StoredMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingText, setStreamingText] = useState("");
	const sessionIdRef = useRef<string | null>(null);

	// Keep ref in sync for use in callbacks
	useEffect(() => {
		sessionIdRef.current = sessionId;
	}, [sessionId]);

	// Load session from URL params
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const sid = params.get("sessionId");
		if (sid) {
			setSessionId(sid);
			rpc.request
				.claudeGetSessionMessages({ sessionId: sid })
				.then(setMessages)
				.catch(() => {});
		}
	}, []);

	// Register stream handlers
	useEffect(() => {
		setStreamHandlers({
			onChunk: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;
				const msg = args.chunk as Record<string, unknown>;
				if (msg.type === "stream_event") {
					const evt = msg as {
						event?: {
							type?: string;
							delta?: { type?: string; text?: string };
						};
					};
					if (
						evt.event?.type === "content_block_delta" &&
						evt.event?.delta?.type === "text_delta" &&
						evt.event?.delta?.text
					) {
						setStreamingText((prev) => prev + (evt.event?.delta?.text ?? ""));
					}
				}
				setIsStreaming(true);
			},
			onEnd: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;
				setIsStreaming(false);
				setStreamingText("");
				const sid = sessionIdRef.current;
				if (sid) {
					rpc.request
						.claudeGetSessionMessages({ sessionId: sid })
						.then(setMessages)
						.catch(() => {});
				}
			},
			onError: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;
				setIsStreaming(false);
				setStreamingText("");
			},
		});
	}, []);

	const sendMessage = useCallback(async (text: string) => {
		if (!text.trim() || !sessionIdRef.current) return;
		setMessages((prev) => [
			...prev,
			{
				role: "user" as const,
				content: text,
				timestamp: new Date().toISOString(),
			},
		]);
		setStreamingText("");
		try {
			await rpc.request.claudeSendMessage({ message: text });
		} catch (err) {
			console.error("[chat] Send error:", err);
		}
	}, []);

	const stopGeneration = useCallback(async () => {
		try {
			await rpc.request.claudeStopGeneration();
			setIsStreaming(false);
		} catch {
			// ignore
		}
	}, []);

	return {
		sessionId,
		messages,
		isStreaming,
		streamingText,
		sendMessage,
		stopGeneration,
	};
}

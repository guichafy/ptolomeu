import { useCallback, useEffect, useRef, useState } from "react";
import { StreamBlockAccumulator } from "../lib/stream-parser";
import { onOpenSession, rpc, setStreamHandlers } from "../rpc";
import type { ChatBlock, ChatMessage, SessionState } from "../types";
import { migrateStoredMessage, storedToChatMessage } from "../types";

export function useChatSession() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [streamingBlocks, setStreamingBlocks] = useState<ChatBlock[]>([]);
	const [sessionState, setSessionState] = useState<SessionState>("idle");

	const sessionIdRef = useRef<string | null>(null);
	const accumulatorRef = useRef(new StreamBlockAccumulator());

	// Keep ref in sync for use in callbacks
	useEffect(() => {
		sessionIdRef.current = sessionId;
	}, [sessionId]);

	// Helper: load persisted messages and convert to ChatMessage[]
	const loadMessages = useCallback((sid: string) => {
		rpc.request
			.claudeGetSessionMessages({ sessionId: sid })
			.then((stored) => {
				const converted = stored.map((msg, i) =>
					storedToChatMessage(migrateStoredMessage(msg), i),
				);
				setMessages(converted);
			})
			.catch(() => {});
	}, []);

	// Resume a session by id
	const resumeSession = useCallback(
		(sid: string) => {
			setSessionId(sid);
			loadMessages(sid);
			rpc.request.claudeResumeSession({ sessionId: sid }).catch((err) => {
				console.error("[chat] Failed to resume session:", err);
			});
		},
		[loadMessages],
	);

	useEffect(() => {
		onOpenSession(({ sessionId: sid }) => {
			resumeSession(sid);
		});
		return () => onOpenSession(() => {});
	}, [resumeSession]);

	// Register stream handlers
	useEffect(() => {
		setStreamHandlers({
			onChunk: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				const accumulator = accumulatorRef.current;
				const changed = accumulator.processChunk(args.chunk);

				if (changed) {
					setStreamingBlocks([...accumulator.getStreamingBlocks()]);
				}

				// Determine session state based on current blocks
				const blocks = accumulator.getStreamingBlocks();
				const hasRunningTool = blocks.some(
					(b) => b.type === "tool_use" && b.status === "running",
				);
				setSessionState(hasRunningTool ? "tool_running" : "streaming");
			},
			onEnd: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				const accumulator = accumulatorRef.current;
				accumulator.finalize();
				accumulator.reset();
				setStreamingBlocks([]);
				setSessionState("idle");

				// Reload persisted messages
				const sid = sessionIdRef.current;
				if (sid) {
					loadMessages(sid);
				}
			},
			onError: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				const accumulator = accumulatorRef.current;
				accumulator.reset();
				setStreamingBlocks([]);
				setSessionState("error");
			},
		});
	}, [loadMessages]);

	const sendMessage = useCallback(async (text: string) => {
		if (!text.trim() || !sessionIdRef.current) return;

		// Optimistically add user ChatMessage
		const userMessage: ChatMessage = {
			id: `user-${Date.now()}`,
			role: "user",
			blocks: [{ type: "text", text }],
			timestamp: new Date().toISOString(),
		};
		setMessages((prev) => [...prev, userMessage]);

		// Reset accumulator for the new assistant turn
		accumulatorRef.current.reset();
		setStreamingBlocks([]);
		setSessionState("streaming");

		try {
			await rpc.request.claudeSendMessage({ message: text });
		} catch (err) {
			console.error("[chat] Send error:", err);
			setSessionState("error");
		}
	}, []);

	const stopGeneration = useCallback(async () => {
		try {
			await rpc.request.claudeStopGeneration();
			const accumulator = accumulatorRef.current;
			accumulator.finalize();
			accumulator.reset();
			setStreamingBlocks([]);
			setSessionState("idle");

			// Reload messages to pick up any partial response that was saved
			const sid = sessionIdRef.current;
			if (sid) {
				loadMessages(sid);
			}
		} catch {
			// ignore
		}
	}, [loadMessages]);

	return {
		sessionId,
		messages,
		streamingBlocks,
		sessionState,
		sendMessage,
		stopGeneration,
	};
}

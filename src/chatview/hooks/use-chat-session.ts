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
			// Optimistically show the loader: for a freshly created session the
			// backend is already streaming, but early SDK chunks (system,
			// rate_limit_event) don't produce blocks so sessionState would
			// otherwise remain "idle" until the first real content arrives.
			// onEnd will flip back to "idle" if there's nothing to stream.
			setSessionState("streaming");
			rpc.request.claudeResumeSession({ sessionId: sid }).catch((err) => {
				console.error("[chat] Failed to resume session:", err);
				setSessionState("error");
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

	const flushAccumulator = useCallback(
		(meta?: {
			cost?: number;
			durationMs?: number;
			tokenUsage?: { input: number; output: number };
		}) => {
			const accumulator = accumulatorRef.current;
			const { blocks: finalBlocks } = accumulator.finalize();

			if (finalBlocks.length > 0) {
				const assistantMsg: ChatMessage = {
					id: `streaming-${Date.now()}`,
					role: "assistant",
					blocks: finalBlocks,
					timestamp: new Date().toISOString(),
					...(meta?.cost != null && { cost: meta.cost }),
					...(meta?.durationMs != null && { durationMs: meta.durationMs }),
					...(meta?.tokenUsage && { tokenUsage: meta.tokenUsage }),
				};
				setMessages((prev) => [...prev, assistantMsg]);
			}

			accumulator.reset();
			setStreamingBlocks([]);
		},
		[],
	);

	useEffect(() => {
		setStreamHandlers({
			onChunk: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				const accumulator = accumulatorRef.current;
				if (!accumulator.processChunk(args.chunk)) return;

				const blocks = accumulator.getStreamingBlocks();
				setStreamingBlocks([...blocks]);
				const hasRunningTool = blocks.some(
					(b) => b.type === "tool_use" && b.status === "running",
				);
				setSessionState(hasRunningTool ? "tool_running" : "streaming");
			},
			onEnd: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				flushAccumulator({
					cost: args.result.totalCostUsd,
					durationMs: args.result.durationMs,
					tokenUsage: args.result.usage,
				});
				setSessionState("idle");
			},
			onError: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				accumulatorRef.current.reset();
				setStreamingBlocks([]);
				setSessionState("error");
			},
		});
	}, [flushAccumulator]);

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
			flushAccumulator();
			setSessionState("idle");
		} catch {
			// ignore
		}
	}, [flushAccumulator]);

	return {
		sessionId,
		messages,
		streamingBlocks,
		sessionState,
		sendMessage,
		stopGeneration,
	};
}

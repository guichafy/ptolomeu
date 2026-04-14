import { useCallback, useEffect, useRef, useState } from "react";
import { StreamBlockAccumulator } from "../lib/stream-parser";
import { onOpenSession, rpc, setStreamHandlers } from "../rpc";
import type { ChatBlock, ChatMessage, SessionState } from "../types";
import { migrateStoredMessage, storedToChatMessage } from "../types";

const VERBOSE = import.meta.env.VITE_CLAUDE_LOG_VERBOSE === "1";
const verbose = (...args: unknown[]) => {
	if (VERBOSE) console.log(...args);
};

function previewText(text: string, max = 60): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max)}...`;
}

export function useChatSession() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [streamingBlocks, setStreamingBlocks] = useState<ChatBlock[]>([]);
	const [sessionState, setSessionState] = useState<SessionState>("idle");

	const sessionIdRef = useRef<string | null>(null);
	const accumulatorRef = useRef(new StreamBlockAccumulator());
	// Generation counter for loadMessages. Incremented by any operation that
	// would invalidate an in-flight reload (e.g. sendMessage adding an
	// optimistic user entry). The .then() of loadMessages checks this and
	// discards stale responses, so a late disk read can't wipe the optimistic
	// entry off the UI.
	const loadGenRef = useRef(0);

	// Keep ref in sync for use in callbacks
	useEffect(() => {
		sessionIdRef.current = sessionId;
	}, [sessionId]);

	// Helper: load persisted messages and convert to ChatMessage[]
	const loadMessages = useCallback((sid: string) => {
		const gen = ++loadGenRef.current;
		verbose(`[chat:session] loadMessages start: sessionId=${sid} gen=${gen}`);
		rpc.request
			.claudeGetSessionMessages({ sessionId: sid })
			.then((stored) => {
				if (gen !== loadGenRef.current) {
					verbose(
						`[chat:session] loadMessages superseded: sessionId=${sid} gen=${gen} current=${loadGenRef.current}`,
					);
					return;
				}
				const converted = stored.map((msg, i) =>
					storedToChatMessage(migrateStoredMessage(msg), i),
				);
				console.log(
					`[chat:session] loadMessages loaded: sessionId=${sid} count=${converted.length}`,
				);
				setMessages(converted);
			})
			.catch((err) => {
				console.error("[chat:session] loadMessages failed:", err);
			});
	}, []);

	// Resume a session by id
	const resumeSession = useCallback(
		(sid: string) => {
			console.log(`[chat:session] resumeSession: sessionId=${sid}`);
			setSessionId(sid);
			loadMessages(sid);
			// Optimistically show the loader: for a freshly created session the
			// backend is already streaming, but early SDK chunks (system,
			// rate_limit_event) don't produce blocks so sessionState would
			// otherwise remain "idle" until the first real content arrives.
			// onEnd will flip back to "idle" if there's nothing to stream.
			setSessionState("streaming");
			rpc.request.claudeResumeSession({ sessionId: sid }).catch((err) => {
				console.error("[chat:session] resumeSession RPC failed:", err);
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

	useEffect(() => {
		setStreamHandlers({
			onChunk: (args) => {
				const match = args.sessionId === sessionIdRef.current;
				const chunkType =
					args.chunk && typeof args.chunk === "object" && "type" in args.chunk
						? (args.chunk as { type: unknown }).type
						: "unknown";
				verbose(
					`[chat:session] onChunk: type=${String(chunkType)} sessionMatch=${match}`,
				);
				if (!match) return;

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

				console.log(
					`[chat:session] onEnd: sessionId=${args.sessionId} cost=${args.result.totalCostUsd ?? "?"} durationMs=${args.result.durationMs ?? "?"} tokens=${args.result.usage ? `${args.result.usage.input}/${args.result.usage.output}` : "?"}`,
				);

				// Reload from disk instead of flushing the accumulator. The
				// backend persists the complete assistant message BEFORE
				// emitting onEnd (see streaming.ts), so the disk is the
				// authoritative source. The accumulator may be incomplete
				// when the chat window was created concurrently with the
				// stream and missed the early chunks.
				accumulatorRef.current.reset();
				setStreamingBlocks([]);
				loadMessages(args.sessionId);
				setSessionState("idle");
			},
			onError: (args) => {
				if (args.sessionId !== sessionIdRef.current) return;

				console.error(
					`[chat:session] onError: sessionId=${args.sessionId} error=${args.error}`,
				);

				accumulatorRef.current.reset();
				setStreamingBlocks([]);
				setSessionState("error");
			},
		});
	}, [loadMessages]);

	const sendMessage = useCallback(async (text: string) => {
		if (!text.trim() || !sessionIdRef.current) {
			verbose(
				`[chat:session] sendMessage: skipped (emptyText=${!text.trim()} noSession=${!sessionIdRef.current})`,
			);
			return;
		}

		console.log(
			`[chat:session] sendMessage: sessionId=${sessionIdRef.current} length=${text.length}`,
		);
		verbose(
			`[chat:session] sendMessage preview: sessionId=${sessionIdRef.current} text="${previewText(text)}"`,
		);

		// Invalidate any in-flight loadMessages so its late .then() won't
		// overwrite our optimistic user entry below.
		loadGenRef.current++;

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
			console.error("[chat:session] sendMessage RPC failed:", err);
			setSessionState("error");
		}
	}, []);

	const stopGeneration = useCallback(async () => {
		console.log(
			`[chat:session] stopGeneration: sessionId=${sessionIdRef.current}`,
		);
		try {
			await rpc.request.claudeStopGeneration();
			// Backend's streaming loop catch block persists any accumulated
			// blocks before emitting sendError (see streaming.ts). Reload
			// from disk so we get the best-effort partial, consistent with
			// onEnd's authoritative-source pattern.
			accumulatorRef.current.reset();
			setStreamingBlocks([]);
			const sid = sessionIdRef.current;
			if (sid) loadMessages(sid);
			setSessionState("idle");
		} catch (err) {
			console.error("[chat:session] stopGeneration failed:", err);
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

import { useCallback, useEffect, useReducer } from "react";
import type { ApproveBehavior } from "@/shared/agent-protocol";
import { onAgentEvent, rpc } from "../rpc";
import {
	type AgentState,
	appendUserMessage,
	initialAgentState,
	reduceAgentState,
	resolvePermission,
} from "./agent-state";

type Action =
	| {
			type: "event";
			sessionId: string;
			event: import("@/shared/agent-protocol").AgentEvent;
	  }
	| { type: "optimistic-user"; id: string; text: string }
	| { type: "resolve-permission"; permissionId: string }
	| { type: "reset" };

function reducer(state: AgentState, action: Action): AgentState {
	switch (action.type) {
		case "event":
			return reduceAgentState(state, action.event);
		case "optimistic-user":
			return appendUserMessage(state, action.id, action.text);
		case "resolve-permission":
			return resolvePermission(state, action.permissionId);
		case "reset":
			return initialAgentState();
	}
}

export interface UseAgentChatResult {
	state: AgentState;
	sendMessage: (text: string) => Promise<void>;
	approveTool: (
		permissionId: string,
		behavior: ApproveBehavior,
		modifiedArgs?: unknown,
	) => Promise<void>;
	rejectTool: (permissionId: string, reason?: string) => Promise<void>;
	cancel: () => Promise<void>;
	reset: () => void;
}

/**
 * Hook consuming the typed agentEvent stream and exposing command helpers.
 * Runs alongside the legacy `useChatSession` until phase 5 retires the
 * `claudeStreamChunk` channel; does not persist or load messages itself
 * (that still flows through `claudeGetSessionMessages` + StoredMessageV2).
 */
export function useAgentChat(sessionId: string | null): UseAgentChatResult {
	const [state, dispatch] = useReducer(reducer, undefined, initialAgentState);

	useEffect(() => {
		if (!sessionId) return;
		const unsubscribe = onAgentEvent((args) => {
			if (args.sessionId !== sessionId) return;
			dispatch({ type: "event", sessionId: args.sessionId, event: args.event });
		});
		return unsubscribe;
	}, [sessionId]);

	const sendMessage = useCallback(async (text: string) => {
		if (!text.trim()) return;
		const id = `user-${Date.now()}`;
		dispatch({ type: "optimistic-user", id, text });
		try {
			await rpc.request.claudeSendMessage({ message: text });
		} catch (err) {
			console.error("[agent-chat] sendMessage RPC failed:", err);
		}
	}, []);

	const approveTool = useCallback<UseAgentChatResult["approveTool"]>(
		async (permissionId, behavior, modifiedArgs) => {
			try {
				await rpc.request.agentApproveTool({
					permissionId,
					behavior,
					modifiedArgs:
						behavior === "allow-modified" && modifiedArgs
							? (modifiedArgs as Record<string, unknown>)
							: undefined,
				});
			} catch (err) {
				console.error("[agent-chat] approveTool RPC failed:", err);
			} finally {
				dispatch({ type: "resolve-permission", permissionId });
			}
		},
		[],
	);

	const rejectTool = useCallback<UseAgentChatResult["rejectTool"]>(
		async (permissionId, reason) => {
			try {
				await rpc.request.agentRejectTool({ permissionId, reason });
			} catch (err) {
				console.error("[agent-chat] rejectTool RPC failed:", err);
			} finally {
				dispatch({ type: "resolve-permission", permissionId });
			}
		},
		[],
	);

	const cancel = useCallback(async () => {
		try {
			await rpc.request.claudeStopGeneration();
		} catch (err) {
			console.error("[agent-chat] cancel RPC failed:", err);
		}
	}, []);

	const reset = useCallback(() => dispatch({ type: "reset" }), []);

	return { state, sendMessage, approveTool, rejectTool, cancel, reset };
}

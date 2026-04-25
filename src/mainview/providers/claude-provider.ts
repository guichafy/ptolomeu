import { Bot, MessageSquare, Plus } from "lucide-react";
import { createElement } from "react";
import { ClaudeSection } from "../settings/claude-section";
import { rpc, type SessionMeta } from "./rpc";
import type { SearchProvider, SearchResult } from "./types";

function timeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

export function sessionToResult(session: SessionMeta): SearchResult {
	return {
		id: session.id,
		title: session.title,
		subtitle: `${session.projectId} • ${timeAgo(session.updatedAt)}`,
		icon: createElement(MessageSquare, { size: 16 }),
		onSelect: () => rpc.request.claudeOpenChat({ sessionId: session.id }),
	};
}

export const claudeProvider: SearchProvider = {
	id: "claude",
	label: "Claude Code",
	icon: Bot,
	placeholder: "Pergunte algo ao Claude...",
	configComponent: ClaudeSection,
	search: async (query, signal) => {
		// When query is empty, show recent sessions
		if (!query.trim()) {
			try {
				const sessions = await rpc.request.claudeListSessions();
				if (signal?.aborted) return [];
				console.log(`[claude] listSessions via RPC: count=${sessions.length}`);
				return sessions.map(sessionToResult);
			} catch (err) {
				console.error("[claude] claudeListSessions RPC failed:", err);
				return [];
			}
		}

		// With a query: return "create new session" option immediately.
		// Filtering stored sessions by title was nice-to-have but made every
		// keystroke block on a RPC round-trip; users can clear the query to
		// browse recent sessions instead.
		return [
			{
				id: "claude-new",
				title: query,
				subtitle: "Iniciar nova sessão",
				icon: createElement(Plus, { size: 16 }),
				onSelect: async () => {
					try {
						console.log(
							`[claude] createSession from palette: prompt length=${query.length}`,
						);
						// Backend auto-opens the chat window — no follow-up
						// claudeOpenChat call needed (see src/bun/rpc.ts).
						const { sessionId } = await rpc.request.claudeCreateSession({
							prompt: query,
						});
						console.log(
							`[claude] new session created from palette: sessionId=${sessionId}`,
						);
					} catch (err) {
						console.error("[claude] Failed to create session:", err);
					}
				},
			},
		];
	},
};

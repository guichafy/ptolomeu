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

function sessionToResult(session: SessionMeta): SearchResult {
	return {
		id: session.id,
		title: session.title,
		subtitle: `${session.cwd ?? "Sem projeto"} • ${timeAgo(session.updatedAt)}`,
		icon: createElement(MessageSquare, { size: 16 }),
		onSelect: () => rpc.request.claudeOpenChat({ sessionId: session.id }),
	};
}

export const claudeProvider: SearchProvider = {
	id: "claude",
	label: "Claude",
	icon: Bot,
	placeholder: "Pergunte algo ao Claude...",
	configComponent: ClaudeSection,
	search: async (query) => {
		// When query is empty, show recent sessions
		if (!query.trim()) {
			try {
				const sessions = await rpc.request.claudeListSessions();
				return sessions.map(sessionToResult);
			} catch {
				return [];
			}
		}

		// With a query: show "create new session" option + filtered sessions
		const results: SearchResult[] = [
			{
				id: "claude-new",
				title: query,
				subtitle: "Iniciar nova sessão",
				icon: createElement(Plus, { size: 16 }),
				onSelect: async () => {
					try {
						const { sessionId } = await rpc.request.claudeCreateSession({
							prompt: query,
						});
						rpc.request.claudeOpenChat({ sessionId });
					} catch (err) {
						console.error("[claude] Failed to create session:", err);
					}
				},
			},
		];

		// Also filter existing sessions by title
		try {
			const sessions = await rpc.request.claudeListSessions();
			const lower = query.toLowerCase();
			const filtered = sessions
				.filter(
					(s) =>
						s.title.toLowerCase().includes(lower) ||
						s.lastMessage.toLowerCase().includes(lower),
				)
				.slice(0, 5)
				.map(sessionToResult);
			results.push(...filtered);
		} catch {
			// Ignore — show at least the "new session" option
		}

		return results;
	},
};

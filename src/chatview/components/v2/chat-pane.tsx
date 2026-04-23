/**
 * V2 chat pane composed from AI Elements primitives, backed by
 * `useAgentChat` and the typed agentEvent stream. Gated by the
 * `claude.useAiElements` setting — phase 5 retires the legacy pane.
 */

import { useEffect, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputToolbar,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import type {
	AgentMessage as AgentMessageType,
	SessionState,
} from "../../hooks/agent-state";
import { useAgentChat } from "../../hooks/use-agent-chat";
import { onOpenSession, rpc } from "../../rpc";
import { ChatHeader } from "../chat-header";
import { MessagePart as MessagePartRenderer } from "./message-parts";

function toLegacySessionState(
	state: SessionState,
): "idle" | "streaming" | "tool_running" | "error" {
	switch (state) {
		case "running":
			return "streaming";
		case "requires_action":
			return "tool_running";
		case "error":
			return "error";
		default:
			return "idle";
	}
}

function partKey(
	message: AgentMessageType,
	part: AgentMessageType["parts"][number],
): string {
	switch (part.kind) {
		case "text":
		case "reasoning":
			return `${message.id}:${part.kind}:${part.messageId}`;
		case "tool":
			return `${message.id}:tool:${part.toolCallId}`;
	}
}

function AgentMessageView({ message }: { message: AgentMessageType }) {
	return (
		<Message from={message.role}>
			<MessageContent role={message.role}>
				{message.parts.map((part) => (
					<MessagePartRenderer key={partKey(message, part)} part={part} />
				))}
			</MessageContent>
		</Message>
	);
}

export function ChatPaneV2() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const { state, sendMessage, cancel } = useAgentChat(sessionId);
	const [draft, setDraft] = useState("");

	useEffect(() => {
		onOpenSession(({ sessionId: sid }) => {
			setSessionId(sid);
			rpc.request.claudeResumeSession({ sessionId: sid }).catch((err) => {
				console.error("[chat-v2] resumeSession failed:", err);
			});
		});
	}, []);

	const handleSubmit = async () => {
		const text = draft.trim();
		if (!text) return;
		setDraft("");
		if (state.sessionState === "running") {
			await cancel();
			return;
		}
		await sendMessage(text);
	};

	const messages = state.currentMessage
		? [...state.messages, state.currentMessage]
		: state.messages;
	const status = state.sessionState === "running" ? "streaming" : "ready";

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<ChatHeader
				sessionId={sessionId}
				sessionState={toLegacySessionState(state.sessionState)}
			/>
			<Conversation>
				<ConversationContent>
					{messages.length === 0 && (
						<p className="m-auto text-xs text-muted-foreground">
							Inicie a conversa digitando abaixo.
						</p>
					)}
					{messages.map((message) => (
						<AgentMessageView key={message.id} message={message} />
					))}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="flex flex-col gap-2 border-t border-border/60 bg-background p-3">
				{state.suggestions.length > 0 && (
					<Suggestions>
						{state.suggestions.map((suggestion) => (
							<Suggestion
								key={suggestion}
								suggestion={suggestion}
								onSuggestionClick={(s) => setDraft(s)}
							/>
						))}
					</Suggestions>
				)}
				<PromptInput onSubmit={handleSubmit}>
					<PromptInputTextarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="Pergunte algo ao Claude..."
						disabled={state.sessionState === "error"}
					/>
					<PromptInputToolbar>
						<PromptInputSubmit
							status={status}
							disabled={!draft.trim() && status !== "streaming"}
						/>
					</PromptInputToolbar>
				</PromptInput>
			</div>
		</div>
	);
}

import { ChatHeader } from "./components/chat-header";
import { ChatInput } from "./components/chat-input";
import { Conversation } from "./components/conversation";
import { useChatSession } from "./hooks/use-chat-session";

export default function App() {
	const {
		sessionId,
		messages,
		streamingBlocks,
		sessionState,
		sendMessage,
		stopGeneration,
	} = useChatSession();

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<ChatHeader sessionId={sessionId} sessionState={sessionState} />
			<Conversation
				messages={messages}
				streamingBlocks={streamingBlocks}
				sessionState={sessionState}
			/>
			<ChatInput
				isStreaming={sessionState !== "idle"}
				onSend={sendMessage}
				onStop={stopGeneration}
			/>
		</div>
	);
}

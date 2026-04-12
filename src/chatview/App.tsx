import { ChatHeader } from "./components/chat-header";
import { ChatInput } from "./components/chat-input";
import { MessageList } from "./components/message-list";
import { useChatSession } from "./hooks/use-chat-session";

export default function App() {
	const {
		sessionId,
		messages,
		isStreaming,
		streamingText,
		sendMessage,
		stopGeneration,
	} = useChatSession();

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<ChatHeader sessionId={sessionId} />
			<MessageList
				messages={messages}
				streamingText={streamingText}
				isStreaming={isStreaming}
			/>
			<ChatInput
				isStreaming={isStreaming}
				onSend={sendMessage}
				onStop={stopGeneration}
			/>
		</div>
	);
}

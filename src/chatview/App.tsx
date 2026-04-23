import { useEffect, useState } from "react";
import { ChatHeader } from "./components/chat-header";
import { ChatInput } from "./components/chat-input";
import { Conversation } from "./components/conversation";
import { ChatPaneV2 } from "./components/v2/chat-pane";
import { useChatSession } from "./hooks/use-chat-session";
import { rpc } from "./rpc";

function LegacyApp() {
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

export default function App() {
	// Feature flag read once at mount. A flip requires closing and reopening
	// the chat window — documented in Settings > Claude > Interface.
	const [useV2, setUseV2] = useState<boolean | null>(null);

	useEffect(() => {
		rpc.request
			.loadSettings()
			.then((settings) => setUseV2(settings.claude.useAiElements === true))
			.catch(() => setUseV2(false));
	}, []);

	if (useV2 === null) {
		return (
			<div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-xs">
				Carregando...
			</div>
		);
	}
	return useV2 ? <ChatPaneV2 /> : <LegacyApp />;
}

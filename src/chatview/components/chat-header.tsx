import { Bot } from "lucide-react";

interface ChatHeaderProps {
	sessionId: string | null;
}

export function ChatHeader({ sessionId }: ChatHeaderProps) {
	return (
		<div className="chat-drag-region flex items-center gap-3 border-b border-border/40 pl-[78px] pr-4 py-2.5">
			<Bot className="h-4 w-4 text-muted-foreground pointer-events-none" />
			<h1 className="text-sm font-semibold pointer-events-none select-none">
				Claude Code
			</h1>
			{sessionId && (
				<span className="text-xs text-muted-foreground/60 truncate pointer-events-none select-none">
					{sessionId.slice(0, 8)}
				</span>
			)}
		</div>
	);
}

import { Bot } from "lucide-react";

interface ChatHeaderProps {
	sessionId: string | null;
}

export function ChatHeader({ sessionId }: ChatHeaderProps) {
	return (
		<div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
			<Bot className="h-4 w-4 text-muted-foreground" />
			<h1 className="text-sm font-semibold">Claude Code</h1>
			{sessionId && (
				<span className="text-xs text-muted-foreground/60 truncate">
					{sessionId.slice(0, 8)}
				</span>
			)}
		</div>
	);
}

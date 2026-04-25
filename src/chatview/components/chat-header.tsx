import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SessionState = "idle" | "streaming" | "tool_running" | "error";

interface ChatHeaderProps {
	sessionId: string | null;
	sessionState: SessionState;
}

const stateConfig: Record<SessionState, { color: string; pulse: boolean }> = {
	idle: { color: "bg-green-500", pulse: false },
	streaming: { color: "bg-green-500", pulse: true },
	tool_running: { color: "bg-yellow-500", pulse: true },
	error: { color: "bg-red-500", pulse: false },
};

export function ChatHeader({ sessionId, sessionState }: ChatHeaderProps) {
	const { color, pulse } = stateConfig[sessionState];

	return (
		<div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
			<Bot className="h-4 w-4 text-muted-foreground" />
			<h1 className="text-sm font-semibold">Claude Code</h1>
			<span
				className={cn(
					"inline-block h-2 w-2 rounded-full",
					color,
					pulse && "animate-pulse",
				)}
			/>
			<Badge
				variant="secondary"
				className="px-1.5 py-0 text-[10px] font-normal"
			>
				Sonnet 4.6
			</Badge>
			{sessionId && (
				<span className="ml-auto text-xs text-muted-foreground/60 truncate">
					{sessionId.slice(0, 8)}
				</span>
			)}
		</div>
	);
}

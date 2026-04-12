import { cn } from "@/lib/utils";

interface MessageBubbleProps {
	role: "user" | "assistant";
	content: string;
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
	const isUser = role === "user";

	return (
		<div className={cn("mb-3", isUser ? "text-right" : "text-left")}>
			<div
				className={cn(
					"inline-block max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
					isUser
						? "bg-primary text-primary-foreground"
						: "bg-muted text-foreground",
				)}
			>
				{content}
			</div>
		</div>
	);
}

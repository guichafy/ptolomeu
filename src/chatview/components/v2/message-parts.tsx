import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { cn } from "@/lib/utils";
import type { AgentPart } from "../../hooks/agent-state";
import { ToolBlock } from "./tool-block";

export function MessagePart({ part }: { part: AgentPart }) {
	switch (part.kind) {
		case "text":
			return (
				<p
					className={cn(
						"whitespace-pre-wrap",
						part.streaming && "after:animate-pulse after:content-['▍']",
					)}
				>
					{part.text}
				</p>
			);
		case "reasoning":
			return (
				<Reasoning isStreaming={part.streaming} durationMs={part.durationMs}>
					<ReasoningTrigger />
					<ReasoningContent>{part.text}</ReasoningContent>
				</Reasoning>
			);
		case "tool":
			return <ToolBlock part={part} />;
	}
}

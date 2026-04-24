import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type { AgentPart } from "../../hooks/agent-state";
import { MarkdownContent } from "../blocks/markdown-content";
import { ToolBlock } from "./tool-block";

export function MessagePart({ part }: { part: AgentPart }) {
	switch (part.kind) {
		case "text":
			return (
				<div className="relative">
					<MarkdownContent content={part.text} />
					{part.streaming && (
						<span className="ml-0.5 inline-block animate-pulse align-baseline">
							▍
						</span>
					)}
				</div>
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

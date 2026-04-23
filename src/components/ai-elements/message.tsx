/**
 * AI Elements `Message` / `MessageContent` primitives. API mirrors
 * https://elements.ai-sdk.dev/r/message.json.
 */

import type { ComponentProps } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type MessageRole = "user" | "assistant" | "system";

export interface MessageProps extends ComponentProps<"div"> {
	from: MessageRole;
}

export const Message = forwardRef<HTMLDivElement, MessageProps>(
	({ from, className, children, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="message"
			data-role={from}
			className={cn(
				"flex w-full gap-3",
				from === "user" ? "justify-end" : "justify-start",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	),
);
Message.displayName = "Message";

export interface MessageContentProps extends ComponentProps<"div"> {
	role?: MessageRole;
}

export const MessageContent = forwardRef<HTMLDivElement, MessageContentProps>(
	({ role = "assistant", className, children, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="message-content"
			data-role={role}
			className={cn(
				"flex max-w-[85%] flex-col gap-2 rounded-lg px-3 py-2 text-sm leading-relaxed",
				role === "user"
					? "bg-primary text-primary-foreground"
					: "bg-muted text-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	),
);
MessageContent.displayName = "MessageContent";

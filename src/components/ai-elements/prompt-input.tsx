/**
 * AI Elements `PromptInput` — textarea with auto-submit via enter, stop
 * button while streaming, and composable toolbar. API mirrors
 * https://elements.ai-sdk.dev/r/prompt-input.json.
 */

import { ArrowUp, Square } from "lucide-react";
import {
	type ComponentProps,
	type FormEvent,
	forwardRef,
	type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

export interface PromptInputProps extends ComponentProps<"form"> {
	onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

export const PromptInput = forwardRef<HTMLFormElement, PromptInputProps>(
	({ className, children, onSubmit, ...props }, ref) => (
		<form
			ref={ref}
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit?.(e);
			}}
			className={cn(
				"flex flex-col gap-2 rounded-lg border border-border/60 bg-background p-2 shadow-sm",
				className,
			)}
			{...props}
		>
			{children}
		</form>
	),
);
PromptInput.displayName = "PromptInput";

export interface PromptInputTextareaProps extends ComponentProps<"textarea"> {
	/** When true, pressing Enter (without shift) submits the form. Default true. */
	submitOnEnter?: boolean;
}

export const PromptInputTextarea = forwardRef<
	HTMLTextAreaElement,
	PromptInputTextareaProps
>(({ className, submitOnEnter = true, onKeyDown, ...props }, ref) => {
	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		onKeyDown?.(e);
		if (e.defaultPrevented) return;
		if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			e.currentTarget.form?.requestSubmit();
		}
	};
	return (
		<textarea
			ref={ref}
			rows={1}
			onKeyDown={handleKeyDown}
			className={cn(
				"max-h-40 min-h-[2.25rem] w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
});
PromptInputTextarea.displayName = "PromptInputTextarea";

export interface PromptInputToolbarProps extends ComponentProps<"div"> {}

export const PromptInputToolbar = forwardRef<
	HTMLDivElement,
	PromptInputToolbarProps
>(({ className, children, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("flex items-center justify-end gap-1", className)}
		{...props}
	>
		{children}
	</div>
));
PromptInputToolbar.displayName = "PromptInputToolbar";

export interface PromptInputSubmitProps extends ComponentProps<typeof Button> {
	status?: PromptInputStatus;
}

export const PromptInputSubmit = forwardRef<
	HTMLButtonElement,
	PromptInputSubmitProps
>(({ status = "ready", className, children, disabled, ...props }, ref) => {
	const isStreaming = status === "streaming" || status === "submitted";
	const icon = isStreaming ? (
		<Square className="h-3.5 w-3.5" />
	) : (
		<ArrowUp className="h-3.5 w-3.5" />
	);
	return (
		<Button
			ref={ref}
			type="submit"
			size="sm"
			className={cn("h-8 w-8 rounded-full p-0", className)}
			disabled={disabled}
			aria-label={isStreaming ? "Parar geração" : "Enviar mensagem"}
			{...props}
		>
			{children ?? icon}
		</Button>
	);
});
PromptInputSubmit.displayName = "PromptInputSubmit";

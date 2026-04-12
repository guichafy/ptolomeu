import { Send, Square } from "lucide-react";
import { useCallback, useRef } from "react";

interface ChatInputProps {
	isStreaming: boolean;
	onSend: (text: string) => void;
	onStop: () => void;
}

export function ChatInput({ isStreaming, onSend, onStop }: ChatInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSubmit = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea?.value.trim()) return;
		onSend(textarea.value);
		textarea.value = "";
		// Reset height
		textarea.style.height = "auto";
	}, [onSend]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	// Auto-resize textarea
	const handleInput = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
	}, []);

	return (
		<div className="border-t border-border/40 p-3">
			<div className="flex items-end gap-2">
				<textarea
					ref={textareaRef}
					className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
					placeholder="Enviar mensagem..."
					rows={1}
					disabled={isStreaming}
					onKeyDown={handleKeyDown}
					onInput={handleInput}
				/>
				{isStreaming ? (
					<button
						type="button"
						onClick={onStop}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
						title="Parar"
					>
						<Square className="h-3.5 w-3.5" />
					</button>
				) : (
					<button
						type="button"
						onClick={handleSubmit}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						title="Enviar"
					>
						<Send className="h-3.5 w-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}

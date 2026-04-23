/**
 * AI Elements `CodeBlock` — header with language label + copy button over
 * a monospace pre block. API mirrors https://elements.ai-sdk.dev/r/code-block.json.
 * The project already ships react-syntax-highlighter; keep this primitive
 * dependency-light and let consumers slot in a highlighter when needed.
 */

import { Check, Copy } from "lucide-react";
import { type ComponentProps, forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CodeBlockProps extends ComponentProps<"div"> {
	code: string;
	language?: string;
	showLineNumbers?: boolean;
}

export const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(
	({ code, language, showLineNumbers, className, children, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="code-block"
			className={cn(
				"overflow-hidden rounded-md border border-border/60 bg-muted/30",
				className,
			)}
			{...props}
		>
			{(language || children) && (
				<div className="flex items-center justify-between border-b border-border/60 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
					<span>{language ?? "code"}</span>
					{children}
				</div>
			)}
			<pre
				className={cn(
					"overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-foreground/90",
					showLineNumbers && "pl-10",
				)}
			>
				<code>{code}</code>
			</pre>
		</div>
	),
);
CodeBlock.displayName = "CodeBlock";

export interface CodeBlockCopyButtonProps
	extends Omit<ComponentProps<typeof Button>, "children"> {
	code: string;
}

export const CodeBlockCopyButton = forwardRef<
	HTMLButtonElement,
	CodeBlockCopyButtonProps
>(({ code, className, onClick, ...props }, ref) => {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			ref={ref}
			type="button"
			size="sm"
			variant="ghost"
			aria-label={copied ? "Copiado" : "Copiar"}
			className={cn("h-6 w-6 p-0 text-muted-foreground", className)}
			onClick={(e) => {
				onClick?.(e);
				if (e.defaultPrevented) return;
				navigator.clipboard?.writeText(code).catch(() => {});
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			{...props}
		>
			{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
		</Button>
	);
});
CodeBlockCopyButton.displayName = "CodeBlockCopyButton";

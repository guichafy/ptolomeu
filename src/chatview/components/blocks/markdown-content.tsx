import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

interface MarkdownContentProps {
	content: string;
}

const components: Components = {
	code({ className, children, ...props }) {
		const match = /language-(\w+)/.exec(className || "");

		// Fenced code block (has language class from markdown parser)
		if (match) {
			const code = String(children).replace(/\n$/, "");
			return <CodeBlock code={code} language={match[1]} />;
		}

		// Inline code
		return (
			<code
				className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono text-foreground"
				{...props}
			>
				{children}
			</code>
		);
	},
	// Block-level pre: just pass through (CodeBlock handles styling)
	pre({ children }) {
		return <>{children}</>;
	},
	h1({ children }) {
		return (
			<h1 className="mb-3 mt-5 text-xl font-bold text-foreground first:mt-0">
				{children}
			</h1>
		);
	},
	h2({ children }) {
		return (
			<h2 className="mb-2 mt-4 text-lg font-semibold text-foreground first:mt-0">
				{children}
			</h2>
		);
	},
	h3({ children }) {
		return (
			<h3 className="mb-2 mt-3 text-base font-semibold text-foreground first:mt-0">
				{children}
			</h3>
		);
	},
	p({ children }) {
		return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
	},
	ul({ children }) {
		return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>;
	},
	ol({ children }) {
		return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>;
	},
	li({ children }) {
		return <li className="leading-relaxed">{children}</li>;
	},
	a({ href, children }) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="text-primary underline underline-offset-2 hover:text-primary/80"
			>
				{children}
			</a>
		);
	},
	blockquote({ children }) {
		return (
			<blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground">
				{children}
			</blockquote>
		);
	},
	hr() {
		return <hr className="my-4 border-border/40" />;
	},
	table({ children }) {
		return (
			<div className="my-2 overflow-auto">
				<table className="w-full border-collapse text-sm">{children}</table>
			</div>
		);
	},
	th({ children }) {
		return (
			<th className="border border-border/40 bg-muted/50 px-3 py-1.5 text-left font-semibold">
				{children}
			</th>
		);
	},
	td({ children }) {
		return <td className="border border-border/40 px-3 py-1.5">{children}</td>;
	},
};

export function MarkdownContent({ content }: MarkdownContentProps) {
	// Intentionally no explicit color on the wrapper: we inherit from the
	// parent so user bubbles (bg-primary / text-primary-foreground) and
	// assistant bubbles (bg-muted / text-foreground) each stay legible.
	// Overriding with text-foreground here made user messages white-on-white.
	return (
		<div className="text-sm">
			<ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
				{content}
			</ReactMarkdown>
		</div>
	);
}

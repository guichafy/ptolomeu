import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { PrismAsyncLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("diff", diff);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);

interface CodeBlockProps {
	code: string;
	language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [code]);

	return (
		<div className="group relative my-2 rounded-md border border-border/40 overflow-hidden">
			<div className="flex items-center justify-between bg-muted/50 px-3 py-1">
				<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					{language || "text"}
				</span>
				<button
					type="button"
					onClick={handleCopy}
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					title="Copiar código"
				>
					{copied ? (
						<>
							<Check className="h-3 w-3" />
							<span>Copiado</span>
						</>
					) : (
						<>
							<Copy className="h-3 w-3" />
							<span>Copiar</span>
						</>
					)}
				</button>
			</div>

			<div className="max-h-[400px] overflow-auto">
				<SyntaxHighlighter
					language={language || "text"}
					style={oneDark}
					customStyle={{
						margin: 0,
						borderRadius: 0,
						fontSize: "0.8rem",
						background: "transparent",
					}}
					codeTagProps={{
						style: { fontFamily: "ui-monospace, monospace" },
					}}
				>
					{code}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}

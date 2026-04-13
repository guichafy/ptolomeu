import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { Prism } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

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
			{/* Header bar */}
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

			{/* Code content */}
			<div className="max-h-[400px] overflow-auto">
				<Prism
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
				</Prism>
			</div>
		</div>
	);
}

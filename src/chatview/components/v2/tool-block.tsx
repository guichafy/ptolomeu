import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	Loader2,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import { Artifact } from "@/components/ai-elements/artifact";
import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { Source, Sources } from "@/components/ai-elements/sources";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AgentToolPart } from "../../hooks/agent-state";

const ARTIFACT_LINE_THRESHOLD = 20;
const ARTIFACT_CHAR_THRESHOLD = 1200;

function statusIcon(status: AgentToolPart["status"]) {
	switch (status) {
		case "completed":
			return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
		case "error":
			return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
		case "running":
			return (
				<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
			);
		default:
			return <Wrench className="h-3.5 w-3.5 text-muted-foreground" />;
	}
}

function formatArgs(part: AgentToolPart): string {
	if (part.args !== undefined) {
		try {
			return JSON.stringify(part.args, null, 2);
		} catch {
			return String(part.args);
		}
	}
	return part.argsStreaming || "";
}

function formatResult(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function languageFor(part: AgentToolPart): string | undefined {
	const args = part.args as Record<string, unknown> | undefined;
	const path =
		typeof args?.file_path === "string"
			? args.file_path
			: typeof args?.path === "string"
				? args.path
				: undefined;
	if (!path) return undefined;
	const ext = path.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "ts":
			return "typescript";
		case "tsx":
			return "tsx";
		case "js":
			return "javascript";
		case "jsx":
			return "jsx";
		case "json":
			return "json";
		case "py":
			return "python";
		case "rs":
			return "rust";
		case "go":
			return "go";
		case "md":
			return "markdown";
		case "sh":
		case "bash":
			return "bash";
		case "sql":
			return "sql";
		case "yml":
		case "yaml":
			return "yaml";
		case "css":
			return "css";
		case "html":
			return "html";
		default:
			return ext;
	}
}

function isUrlList(
	value: unknown,
): value is Array<{ url: string; title?: string }> {
	if (!Array.isArray(value)) return false;
	return value.every(
		(item) =>
			item &&
			typeof item === "object" &&
			typeof (item as { url?: unknown }).url === "string",
	);
}

function extractSources(
	part: AgentToolPart,
): Array<{ url: string; title?: string }> | null {
	if (part.toolName !== "WebSearch" && part.toolName !== "WebFetch")
		return null;
	const result = part.result;
	if (!result) return null;
	if (isUrlList(result)) return result;
	if (typeof result === "object" && result !== null) {
		const maybe = (result as { results?: unknown }).results;
		if (isUrlList(maybe)) return maybe;
	}
	return null;
}

function ResultRenderer({ part }: { part: AgentToolPart }) {
	const text = formatResult(part.result);
	if (!text) return null;

	const sources = extractSources(part);
	if (sources) {
		return (
			<Sources>
				{sources.map((s) => (
					<Source key={s.url} href={s.url} title={s.title}>
						{s.title ?? undefined}
					</Source>
				))}
			</Sources>
		);
	}

	const lineCount = text.split("\n").length;
	const looksLikeCode =
		lineCount >= ARTIFACT_LINE_THRESHOLD ||
		text.length >= ARTIFACT_CHAR_THRESHOLD;
	if (looksLikeCode) {
		const language = languageFor(part) ?? "text";
		return (
			<Artifact
				title={`${part.toolName} output`}
				subtitle={`${lineCount} linhas • ${text.length} caracteres`}
			>
				<CodeBlock code={text} language={language}>
					<CodeBlockCopyButton code={text} />
				</CodeBlock>
			</Artifact>
		);
	}

	return <pre className="whitespace-pre-wrap text-foreground/90">{text}</pre>;
}

export function ToolBlock({ part }: { part: AgentToolPart }) {
	const [open, setOpen] = useState(part.status === "error");
	const args = formatArgs(part);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"rounded-md border border-border/60 bg-muted/30 text-xs",
				part.status === "error" && "border-destructive/40",
			)}
		>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-2 px-3 py-2 text-left",
					"[&[data-state=open]_svg.chev]:rotate-180",
				)}
			>
				{statusIcon(part.status)}
				<span className="font-mono text-[11px] font-semibold">
					{part.toolName}
				</span>
				{typeof part.elapsedSeconds === "number" &&
					part.status === "running" && (
						<span className="text-[10px] text-muted-foreground">
							{part.elapsedSeconds.toFixed(1)}s
						</span>
					)}
				<span className="flex-1" />
				<ChevronDown className="chev h-3.5 w-3.5 text-muted-foreground transition-transform" />
			</CollapsibleTrigger>
			<CollapsibleContent className="border-t border-border/60 px-3 py-2 font-mono text-[11px] leading-relaxed">
				{args && (
					<div className="mb-2">
						<div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
							Argumentos
						</div>
						<pre className="whitespace-pre-wrap text-foreground/90">{args}</pre>
					</div>
				)}
				{part.status === "error" ? (
					<div>
						<div className="mb-1 text-[10px] uppercase tracking-wide text-destructive">
							Erro
						</div>
						<pre className="whitespace-pre-wrap text-destructive">
							{part.error?.message ?? ""}
						</pre>
					</div>
				) : part.result !== undefined ? (
					<div>
						<div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
							Resultado
						</div>
						<ResultRenderer part={part} />
					</div>
				) : null}
			</CollapsibleContent>
		</Collapsible>
	);
}

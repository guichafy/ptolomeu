import {
	Check,
	ChevronRight,
	FileEdit,
	FilePlus,
	FileText,
	FolderOpen,
	Loader2,
	Search,
	Terminal,
	Wrench,
	X,
} from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolUseBlock } from "../../types";

type ToolStatus = ToolUseBlock["status"];

interface ToolInvocationBlockProps {
	name: string;
	input: unknown;
	status: ToolStatus;
	elapsedSeconds?: number;
	result?: { content: string; isError?: boolean };
}

const TOOL_ICONS: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	Read: FileText,
	Write: FilePlus,
	Edit: FileEdit,
	Bash: Terminal,
	Glob: Search,
	Grep: Search,
	LS: FolderOpen,
};

function StatusIcon({ status }: { status: ToolStatus }) {
	switch (status) {
		case "running":
			return <Loader2 className="h-3 w-3 shrink-0 animate-spin" />;
		case "done":
			return <Check className="h-3 w-3 shrink-0 text-green-500" />;
		case "error":
			return <X className="h-3 w-3 shrink-0 text-destructive" />;
	}
}

function getInputPreview(name: string, input: unknown): string {
	if (!input || typeof input !== "object") return "";
	const obj = input as Record<string, unknown>;

	switch (name) {
		case "Bash":
			return typeof obj.command === "string" ? obj.command : "";
		case "Read":
		case "Write":
		case "Edit":
			return typeof obj.file_path === "string" ? obj.file_path : "";
		case "Glob":
		case "Grep":
			return typeof obj.pattern === "string" ? obj.pattern : "";
		default: {
			const json = JSON.stringify(input);
			return json.length > 60 ? `${json.slice(0, 57)}...` : json;
		}
	}
}

export function ToolInvocationBlock({
	name,
	input,
	status,
	elapsedSeconds,
	result,
}: ToolInvocationBlockProps) {
	const [open, setOpen] = useState(false);
	const ToolIcon = TOOL_ICONS[name] ?? Wrench;
	const inputPreview = getInputPreview(name, input);
	const isRunning = status === "running";
	const isError = status === "error";
	const hasResult = result != null;
	const isResultError = result?.isError ?? false;

	const timeLabel =
		elapsedSeconds != null ? `${Math.round(elapsedSeconds)}s` : "";

	const header = (
		<div
			className={cn(
				"flex items-center gap-1.5 px-2 py-1 text-xs transition-colors",
				isError
					? "text-destructive hover:bg-destructive/10"
					: "text-muted-foreground hover:bg-muted/30",
			)}
		>
			{!isRunning && (
				<ChevronRight
					className={cn(
						"h-2.5 w-2.5 shrink-0 transition-transform duration-200",
						open && "rotate-90",
					)}
				/>
			)}
			<StatusIcon status={status} />
			<ToolIcon className="h-3 w-3 shrink-0" />
			<span className="shrink-0">{name}</span>
			{inputPreview && (
				<span className="truncate text-muted-foreground/50">
					{inputPreview}
				</span>
			)}
			{timeLabel && (
				<span
					className={cn(
						"ml-auto shrink-0 text-[10px]",
						isRunning
							? "animate-pulse text-yellow-500"
							: "text-muted-foreground/40",
					)}
				>
					{timeLabel}
				</span>
			)}
		</div>
	);

	const preview = (
		<div
			className={cn(
				"border-t px-2 pb-1.5 pt-1",
				isResultError ? "border-destructive/20" : "border-border/20",
			)}
		>
			{isRunning && !hasResult && (
				<span className="animate-pulse text-[10px] text-muted-foreground/50">
					Executando...
				</span>
			)}
			{hasResult && !isResultError && (
				<div className="relative max-h-[38px] overflow-hidden">
					<pre className="whitespace-pre-wrap text-[10px] font-mono text-muted-foreground/70">
						{result.content}
					</pre>
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-background to-transparent" />
				</div>
			)}
			{hasResult && isResultError && (
				<pre className="whitespace-pre-wrap text-[10px] font-mono text-destructive">
					{result.content}
				</pre>
			)}
		</div>
	);

	const expandedContent = (
		<div
			className={cn(
				"border-t",
				isResultError ? "border-destructive/20" : "border-border/20",
			)}
		>
			<div className="px-2 py-1.5">
				<span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
					Input
				</span>
				<div className="mt-1 max-h-[200px] overflow-auto rounded border border-border/30 bg-muted/20 p-1.5">
					<pre className="whitespace-pre-wrap text-[10px] font-mono text-muted-foreground/70">
						{typeof input === "string" ? input : JSON.stringify(input, null, 2)}
					</pre>
				</div>
			</div>
			{hasResult && (
				<div className="px-2 pb-1.5">
					<span
						className={cn(
							"text-[9px] font-medium uppercase tracking-wider",
							isResultError
								? "text-destructive/60"
								: "text-muted-foreground/50",
						)}
					>
						Output
					</span>
					<div
						className={cn(
							"mt-1 max-h-[300px] overflow-auto rounded border p-1.5",
							isResultError
								? "border-destructive/40 bg-destructive/10"
								: "border-border/30 bg-muted/20",
						)}
					>
						<pre
							className={cn(
								"whitespace-pre-wrap text-[10px] font-mono",
								isResultError ? "text-destructive" : "text-muted-foreground/70",
							)}
						>
							{result.content}
						</pre>
					</div>
				</div>
			)}
		</div>
	);

	if (isRunning) {
		return (
			<div className="my-1 overflow-hidden rounded-md border border-border/30">
				{header}
				{preview}
			</div>
		);
	}

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div
				className={cn(
					"my-1 overflow-hidden rounded-md border",
					isError ? "border-destructive/30" : "border-border/30",
				)}
			>
				<CollapsibleTrigger className="w-full">{header}</CollapsibleTrigger>
				{hasResult && !open && preview}
				<CollapsibleContent>{expandedContent}</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

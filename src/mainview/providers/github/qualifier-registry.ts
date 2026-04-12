import type { GitHubSearchType } from "../rpc";

// ── Input types ──────────────────────────────────────────────

export type QualifierInputType = "select" | "text" | "number-range" | "boolean";

export interface RangeValue {
	op: ">=" | "<=" | "=";
	value: string;
}

export type QualifierValue = string | RangeValue;

export type QualifierValues = Map<string, QualifierValue>;

// ── QualifierDef ─────────────────────────────────────────────

export interface QualifierDef {
	key: string;
	label: string;
	type: QualifierInputType;
	options?: string[];
	booleanOptions?: { label: string; value: string }[];
	placeholder?: string;
	toQuery: (value: QualifierValue) => string;
	pattern: RegExp;
	parseValue: (match: RegExpMatchArray) => QualifierValue;
}

// ── Option lists ─────────────────────────────────────────────

const LANGUAGES = [
	"TypeScript",
	"JavaScript",
	"Python",
	"Go",
	"Rust",
	"Java",
	"C",
	"C++",
	"C#",
	"Ruby",
	"PHP",
	"Swift",
	"Kotlin",
	"Dart",
	"Shell",
	"Lua",
	"Zig",
	"Elixir",
	"Haskell",
	"Scala",
	"R",
	"MATLAB",
	"HTML",
	"CSS",
	"SQL",
];

const LICENSES = [
	"mit",
	"apache-2.0",
	"gpl-2.0",
	"gpl-3.0",
	"bsd-2-clause",
	"bsd-3-clause",
	"lgpl-2.1",
	"lgpl-3.0",
	"mpl-2.0",
	"unlicense",
	"0bsd",
	"isc",
];

const SORT_REPOS = ["stars", "forks", "help-wanted-issues", "updated"];

const SORT_ISSUES = [
	"created",
	"updated",
	"comments",
	"reactions",
	"reactions-+1",
	"reactions--1",
	"interactions",
];

const REVIEW_STATUSES = ["none", "required", "approved", "changes_requested"];

const USER_TYPES = ["user", "org"];

const RANGE_OPS = [">=", "<=", "="] as const;

// ── Helpers ──────────────────────────────────────────────────

function selectQualifier(
	key: string,
	label: string,
	options: string[],
	queryKey?: string,
): QualifierDef {
	const qk = queryKey ?? key;
	return {
		key,
		label,
		type: "select",
		options,
		toQuery: (v) => `${qk}:${String(v).toLowerCase()}`,
		pattern: new RegExp(`${qk}:(\\S+)`),
		parseValue: (m) => m[1],
	};
}

function textQualifier(
	key: string,
	label: string,
	queryKey: string,
	placeholder?: string,
): QualifierDef {
	return {
		key,
		label,
		type: "text",
		placeholder,
		toQuery: (v) => `${queryKey}:${v}`,
		pattern: new RegExp(`${queryKey}:(\\S+)`),
		parseValue: (m) => m[1],
	};
}

function rangeQualifier(
	key: string,
	label: string,
	queryKey: string,
	placeholder?: string,
): QualifierDef {
	return {
		key,
		label,
		type: "number-range",
		placeholder,
		toQuery: (v) => {
			const rv = v as RangeValue;
			return `${queryKey}:${rv.op === "=" ? "" : rv.op}${rv.value}`;
		},
		pattern: new RegExp(`${queryKey}:(>=|<=|=)?([\\w.:-]+)`),
		parseValue: (m): RangeValue => ({
			op: (m[1] as RangeValue["op"]) ?? ">=",
			value: m[2],
		}),
	};
}

// ── Registry ─────────────────────────────────────────────────

const reposQualifiers: QualifierDef[] = [
	selectQualifier("language", "Linguagem", LANGUAGES),
	rangeQualifier("stars", "Stars", "stars", "100"),
	textQualifier("topic", "Tópico", "topic", "react"),
	rangeQualifier("created", "Criado", "created", "2024-01-01"),
	rangeQualifier("pushed", "Último push", "pushed", "2024-06-01"),
	selectQualifier("license", "Licença", LICENSES),
	{
		key: "archived",
		label: "Arquivado",
		type: "boolean",
		booleanOptions: [
			{ label: "Sim", value: "true" },
			{ label: "Não", value: "false" },
		],
		toQuery: (v) => `archived:${v}`,
		pattern: /archived:(true|false)/,
		parseValue: (m) => m[1],
	},
	selectQualifier("sort", "Ordenar", SORT_REPOS),
];

const issuesQualifiers: QualifierDef[] = [
	{
		key: "is_type",
		label: "Tipo",
		type: "boolean",
		booleanOptions: [
			{ label: "PR", value: "pr" },
			{ label: "Issue", value: "issue" },
		],
		toQuery: (v) => `is:${v}`,
		pattern: /is:(pr|issue)\b/,
		parseValue: (m) => m[1],
	},
	{
		key: "state",
		label: "Estado",
		type: "select",
		options: ["open", "closed", "merged"],
		toQuery: (v) => `is:${v}`,
		pattern: /is:(open|closed|merged)\b/,
		parseValue: (m) => m[1],
	},
	textQualifier("author", "Autor", "author", "@me"),
	textQualifier("label", "Label", "label", "bug"),
	textQualifier("repo", "Repositório", "repo", "owner/repo"),
	textQualifier("assignee", "Assignee", "assignee", "username"),
	selectQualifier("review", "Review status", REVIEW_STATUSES),
	rangeQualifier("created", "Criado", "created", "2024-01-01"),
	selectQualifier("sort", "Ordenar", SORT_ISSUES),
];

const codeQualifiers: QualifierDef[] = [
	selectQualifier("language", "Linguagem", LANGUAGES),
	textQualifier("path", "Caminho", "path", "src/"),
	textQualifier("filename", "Filename", "filename", "*.config.ts"),
	textQualifier("repo", "Repositório", "repo", "owner/repo"),
	rangeQualifier("size", "Tamanho", "size", "10000"),
];

const usersQualifiers: QualifierDef[] = [
	selectQualifier("type", "Tipo", USER_TYPES),
	textQualifier("location", "Localização", "location", "Brazil"),
	rangeQualifier("repos", "Repos", "repos", "10"),
	rangeQualifier("followers", "Seguidores", "followers", "50"),
	selectQualifier("language", "Linguagem", LANGUAGES),
];

export const QUALIFIER_REGISTRY: Record<GitHubSearchType, QualifierDef[]> = {
	repos: reposQualifiers,
	code: codeQualifiers,
	issues: issuesQualifiers,
	users: usersQualifiers,
};

export const RANGE_OPERATORS = RANGE_OPS;

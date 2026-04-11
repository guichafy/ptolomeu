export type {
	CustomFilter,
	GitHubItem,
	GitHubSearchType,
	GitHubSettings,
	GitHubSubType,
	TokenStatus,
} from "../rpc";

export const NATIVE_TYPES: ReadonlyArray<{
	type: "repos" | "code" | "issues" | "users";
	label: string;
	shortcut: string;
}> = [
	{ type: "repos", label: "Repositories", shortcut: "⌘1" },
	{ type: "code", label: "Code", shortcut: "⌘2" },
	{ type: "issues", label: "Issues", shortcut: "⌘3" },
	{ type: "users", label: "Users", shortcut: "⌘4" },
] as const;

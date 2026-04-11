import {
	BookMarked,
	CircleDot,
	FileCode,
	GitPullRequest,
	User,
} from "lucide-react";
import { createElement } from "react";
import type { SearchResult } from "../types";
import type { GitHubItem } from "./types";

function formatStars(count: number): string {
	if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
	return String(count);
}

function openUrl(url: string) {
	window.open(url, "_blank");
}

export function toSearchResult(item: GitHubItem): SearchResult {
	switch (item.kind) {
		case "repo":
			return {
				id: `repo-${item.id}`,
				title: item.fullName,
				subtitle: item.description ?? undefined,
				icon: createElement(BookMarked, { className: "h-4 w-4" }),
				badge: `⭐ ${formatStars(item.stars)}${item.language ? ` · ${item.language}` : ""}`,
				onSelect: () => openUrl(item.url),
			};
		case "code":
			return {
				id: `code-${item.id}`,
				title: item.path,
				subtitle: item.repoFullName,
				icon: createElement(FileCode, { className: "h-4 w-4" }),
				onSelect: () => openUrl(item.url),
			};
		case "issue":
			return {
				id: `issue-${item.id}`,
				title: `#${item.number} ${item.title}`,
				subtitle: item.repoFullName,
				icon: createElement(item.isPR ? GitPullRequest : CircleDot, {
					className: "h-4 w-4",
				}),
				badge: item.isPR
					? item.state === "open"
						? "🟢 PR"
						: "🟣 PR"
					: item.state === "open"
						? "🟢 issue"
						: "🔴 issue",
				onSelect: () => openUrl(item.url),
			};
		case "user":
			return {
				id: `user-${item.id}`,
				title: item.login,
				subtitle: item.name ?? undefined,
				icon: createElement(User, { className: "h-4 w-4" }),
				onSelect: () => openUrl(item.url),
			};
	}
}

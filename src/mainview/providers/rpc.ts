import { type ElectrobunRPCSchema, Electroview } from "electrobun/view";

export type GitHubSearchType = "repos" | "code" | "issues" | "users";

export type CustomFilter =
	| {
			id: string;
			kind: "team-repos";
			name: string;
			icon?: string;
			org: string;
			team: string;
	  }
	| {
			id: string;
			kind: "search";
			name: string;
			icon?: string;
			baseType: GitHubSearchType;
			qualifiers: string;
	  };

export interface GitHubSettings {
	customFilters: CustomFilter[];
	hasToken: boolean;
}

export interface Settings {
	version: 1;
	plugins: {
		enabledOrder: string[];
	};
	github: GitHubSettings;
}

export type GitHubSubType =
	| { kind: "native"; type: GitHubSearchType }
	| { kind: "custom"; filter: CustomFilter };

export type GitHubItem =
	| {
			kind: "repo";
			id: number;
			fullName: string;
			description: string | null;
			stars: number;
			language: string | null;
			url: string;
	  }
	| {
			kind: "code";
			id: string;
			path: string;
			repoFullName: string;
			url: string;
	  }
	| {
			kind: "issue";
			id: number;
			number: number;
			title: string;
			state: "open" | "closed";
			isPR: boolean;
			repoFullName: string;
			url: string;
	  }
	| {
			kind: "user";
			id: number;
			login: string;
			name: string | null;
			avatarUrl: string;
			url: string;
	  };

export interface TokenStatus {
	hasToken: boolean;
	account?: string;
	login?: string;
}

export type SettingsSection = "plugins" | "general" | "github";

interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
	bun: {
		requests: {
			listApps: { params: void; response: { name: string; path: string }[] };
			openApp: { params: { path: string }; response: boolean };
			getAppIcon: {
				params: { path: string };
				response: { icon: string | null };
			};
			resizeWindow: { params: { height: number }; response: boolean };
			loadSettings: { params: void; response: Settings };
			saveSettings: { params: Settings; response: boolean };
			githubGetTokenStatus: { params: void; response: TokenStatus };
			githubSetToken: {
				params: { token: string };
				response: { ok: boolean; login?: string; error?: string };
			};
			githubDeleteToken: { params: void; response: boolean };
			githubFetchSearch: {
				params: { subType: GitHubSubType; query: string };
				response: { items: GitHubItem[]; cached: boolean };
			};
			githubInvalidateCache: {
				params: void;
				response: boolean;
			};
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {
			openPreferences: { section?: SettingsSection };
		};
	};
}

let openPreferencesHandler:
	| ((args: { section?: SettingsSection }) => void)
	| null = null;

export function setOpenPreferencesHandler(
	handler: ((args: { section?: SettingsSection }) => void) | null,
) {
	openPreferencesHandler = handler;
}

const rpcInstance = Electroview.defineRPC<PtolomeuRPCSchema>({
	maxRequestTime: 30_000,
	handlers: {
		messages: {
			openPreferences: (args) => {
				openPreferencesHandler?.(args ?? {});
			},
		},
	},
});

new Electroview({ rpc: rpcInstance });

export const rpc = rpcInstance;

import { type ElectrobunRPCSchema, Electroview } from "electrobun/view";

export interface Settings {
	version: 1;
	plugins: {
		enabledOrder: string[];
	};
}

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
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {
			openPreferences: void;
		};
	};
}

let openPreferencesHandler: (() => void) | null = null;

export function setOpenPreferencesHandler(handler: (() => void) | null) {
	openPreferencesHandler = handler;
}

const rpcInstance = Electroview.defineRPC<PtolomeuRPCSchema>({
	handlers: {
		messages: {
			openPreferences: () => {
				openPreferencesHandler?.();
			},
		},
	},
});

// Instantiate Electroview to establish the WebSocket transport
// This connects the RPC to the main process via encrypted WebSocket
new Electroview({ rpc: rpcInstance });

export const rpc = rpcInstance;

import { Electroview, type ElectrobunRPCSchema } from "electrobun/view"

interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      listApps: { params: void; response: { name: string; path: string }[] };
      openApp: { params: { path: string }; response: boolean };
      getAppIcon: { params: { path: string }; response: { icon: string | null } };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
}

const rpcInstance = Electroview.defineRPC<PtolomeuRPCSchema>({
  handlers: {},
})

// Instantiate Electroview to establish the WebSocket transport
// This connects the RPC to the main process via encrypted WebSocket
new Electroview({ rpc: rpcInstance })

export const rpc = rpcInstance

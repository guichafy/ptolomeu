import { Electroview, type ElectrobunRPCSchema } from "electrobun/view"

interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      listApps: { params: void; response: { name: string; path: string }[] };
      openApp: { params: { path: string }; response: boolean };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
}

export const rpc = Electroview.defineRPC<PtolomeuRPCSchema>({
  handlers: {},
})

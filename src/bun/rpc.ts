import { defineElectrobunRPC, type ElectrobunRPCSchema } from "electrobun/bun";
import { readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
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

let cachedApps: { name: string; path: string }[] | null = null;

async function scanApps(): Promise<{ name: string; path: string }[]> {
  if (cachedApps) return cachedApps;

  const dirs = ["/Applications", join(homedir(), "Applications")];
  const apps: { name: string; path: string }[] = [];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith(".app")) {
          apps.push({
            name: entry.replace(/\.app$/, ""),
            path: join(dir, entry),
          });
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  apps.sort((a, b) => a.name.localeCompare(b.name));
  cachedApps = apps;
  return apps;
}

export const rpc = defineElectrobunRPC<PtolomeuRPCSchema>("bun", {
  handlers: {
    requests: {
      listApps: async () => {
        return scanApps();
      },
      openApp: async ({ path }) => {
        try {
          Bun.spawn(["open", "-a", path]);
          return true;
        } catch {
          return false;
        }
      },
    },
  },
});

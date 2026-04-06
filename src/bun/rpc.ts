import { defineElectrobunRPC, type ElectrobunRPCSchema } from "electrobun/bun";
import { readdir, unlink } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
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

const iconCache = new Map<string, string | null>();

async function getAppIconBase64(appPath: string): Promise<string | null> {
  if (iconCache.has(appPath)) return iconCache.get(appPath)!;

  try {
    // Read CFBundleIconFile from Info.plist
    const plistBase = join(appPath, "Contents", "Info");
    const defaultsProc = Bun.spawn(["defaults", "read", plistBase, "CFBundleIconFile"], {
      stdout: "pipe", stderr: "pipe",
    });
    let iconName = (await new Response(defaultsProc.stdout).text()).trim();
    if (!iconName) {
      // Try CFBundleIconName (modern apps with asset catalogs)
      const defaultsProc2 = Bun.spawn(["defaults", "read", plistBase, "CFBundleIconName"], {
        stdout: "pipe", stderr: "pipe",
      });
      iconName = (await new Response(defaultsProc2.stdout).text()).trim();
      if (!iconName) {
        iconCache.set(appPath, null);
        return null;
      }
    }

    if (!iconName.endsWith(".icns")) iconName += ".icns";
    const icnsPath = join(appPath, "Contents", "Resources", iconName);

    // Check file exists
    const file = Bun.file(icnsPath);
    if (!await file.exists()) {
      iconCache.set(appPath, null);
      return null;
    }

    // Convert to 32x32 PNG using sips
    const tmpFile = `/tmp/ptolomeu-icon-${process.pid}-${Date.now()}.png`;
    const sipsProc = Bun.spawn(
      ["sips", "-s", "format", "png", "-Z", "32", icnsPath, "--out", tmpFile],
      { stdout: "pipe", stderr: "pipe" }
    );
    await sipsProc.exited;

    const pngFile = Bun.file(tmpFile);
    if (!await pngFile.exists()) {
      iconCache.set(appPath, null);
      return null;
    }

    const buffer = await pngFile.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Cleanup temp file
    unlink(tmpFile).catch(() => {});

    iconCache.set(appPath, base64);
    return base64;
  } catch {
    iconCache.set(appPath, null);
    return null;
  }
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
      getAppIcon: async ({ path }) => {
        const icon = await getAppIconBase64(path);
        return { icon };
      },
    },
  },
});

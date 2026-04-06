import { AppWindow } from "lucide-react"
import { createElement, useState, useEffect } from "react"
import type { SearchProvider, SearchResult } from "./types"
import { rpc } from "./rpc"

function AppIcon({ appPath }: { appPath: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    rpc.request.getAppIcon({ path: appPath }).then(({ icon }) => {
      if (!cancelled && icon) {
        setSrc(`data:image/png;base64,${icon}`)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [appPath])

  if (!src) {
    return createElement(AppWindow, { className: "h-5 w-5 text-muted-foreground" })
  }
  return createElement("img", { src, className: "h-5 w-5 rounded", alt: "" })
}

function appToResult(app: { name: string; path: string }): SearchResult {
  return {
    id: app.path,
    title: app.name,
    subtitle: app.path,
    icon: createElement(AppIcon, { appPath: app.path }),
    onSelect: () => { rpc.request.openApp({ path: app.path }) },
  }
}

export const appsProvider: SearchProvider = {
  id: "apps",
  label: "Apps",
  icon: AppWindow,
  placeholder: "Buscar aplicativos...",
  search: async (query: string): Promise<SearchResult[]> => {
    try {
      const apps = await rpc.request.listApps()

      if (!query.trim()) {
        return apps.slice(0, 20).map(appToResult)
      }

      const lowerQuery = query.toLowerCase().trim()
      return apps
        .filter((app) => app.name.toLowerCase().includes(lowerQuery))
        .map(appToResult)
    } catch {
      return [{
        id: "error",
        title: "Erro ao listar apps",
        subtitle: "Verifique a conexão RPC",
        onSelect: () => {},
      }]
    }
  },
}

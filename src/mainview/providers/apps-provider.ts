import { AppWindow } from "lucide-react"
import { createElement } from "react"
import type { SearchProvider, SearchResult } from "./types"
import { rpc } from "./rpc"

export const appsProvider: SearchProvider = {
  id: "apps",
  label: "Apps",
  icon: AppWindow,
  placeholder: "Buscar aplicativos...",
  search: async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) {
      try {
        const apps = await rpc.request.listApps()
        return apps.slice(0, 20).map((app) => ({
          id: app.path,
          title: app.name,
          subtitle: app.path,
          icon: createElement("span", { className: "text-base" }, "\u{1F4F1}"),
          onSelect: () => { rpc.request.openApp({ path: app.path }) },
        }))
      } catch {
        return []
      }
    }

    try {
      const apps = await rpc.request.listApps()
      const lowerQuery = query.toLowerCase().trim()
      const filtered = apps.filter((app) =>
        app.name.toLowerCase().includes(lowerQuery)
      )

      return filtered.map((app) => ({
        id: app.path,
        title: app.name,
        subtitle: app.path,
        icon: createElement("span", { className: "text-base" }, "\u{1F4F1}"),
        onSelect: () => { rpc.request.openApp({ path: app.path }) },
      }))
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

# shadcn/ui Base Initialization

## Context

O projeto `sample-electronbun` e uma aplicacao desktop usando Electrobun (React + Bun + Vite). O Tailwind CSS 3.4 ja esta configurado e funcionando. O pacote `shadcn` 4.1.2 esta em devDependencies mas nunca foi inicializado — nao existe `components.json`, nem a funcao `cn()`, nem CSS variables de tema. O objetivo e inicializar a infraestrutura base do shadcn/ui para que componentes possam ser adicionados conforme necessario.

## Decisoes

- **Estilo**: New York (mais compacto, com sombras sutis)
- **Pasta de componentes**: `src/components/ui`
- **Escopo**: Apenas inicializacao base — sem adicionar componentes especificos

## O que sera criado/modificado

### 1. `components.json` (novo — raiz do projeto)

Configuracao do shadcn com estilo New York, caminhos para componentes e aliases.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/mainview/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### 2. `src/lib/utils.ts` (novo)

Helper `cn()` para merge inteligente de classes Tailwind.

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs))
}
```

### 3. `tsconfig.json` (modificar)

Adicionar `baseUrl` e `paths` para o alias `@/`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 4. `vite.config.ts` (modificar)

Adicionar `resolve.alias` para que o Vite resolva o alias `@/` em runtime:

```ts
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### 5. `tailwind.config.js` (modificar)

- Expandir `content` para incluir `./src/components/**/*.{ts,tsx}`
- Adicionar configuracao de animacao e CSS variables do shadcn

```js
import tailwindcssAnimate from "tailwindcss-animate"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./src/mainview/**/*.{html,js,ts,jsx,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
```

### 6. `src/mainview/index.css` (modificar)

Adicionar CSS variables do tema New York (neutral) antes das diretivas `@tailwind`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### 7. Dependencias a instalar

```bash
bun add clsx tailwind-merge class-variance-authority lucide-react
bun add -d tailwindcss-animate
```

## Abordagem de implementacao

1. Instalar dependencias com `bun add`
2. Criar `src/lib/utils.ts` com helper `cn()`
3. Atualizar `tsconfig.json` com path aliases
4. Atualizar `vite.config.ts` com resolve.alias
5. Atualizar `tailwind.config.js` com cores, animacoes e content paths
6. Atualizar `src/mainview/index.css` com CSS variables do tema
7. Criar `components.json` na raiz

## Verificacao

1. Rodar `bun run start` (ou `bun run hmr`) e verificar que o app compila sem erros
2. Verificar que o CSS do tema esta sendo aplicado (background/foreground devem mudar)
3. Testar adicionando um componente: `bunx shadcn add button` — deve criar `src/components/ui/button.tsx` com imports funcionando
4. Importar o Button no App.tsx e verificar que renderiza corretamente

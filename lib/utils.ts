import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn` no padrao shadcn (clsx + tailwind-merge) — PRESET 10/09, portado do LiderHub.
 *
 * Antes era `classes.filter(Boolean).join(" ")`. A diferenca que importa: com tailwind-merge,
 * `cn("h-9", className)` com `className="h-8"` devolve SO `h-8` — e o que todo componente
 * shadcn assume quando aceita `className`. Sem isso, sobrescrever altura/padding/cor via prop
 * dependia da ordem do CSS gerado, e falhava em silencio.
 *
 * TEXT_SCALE: o tailwind-merge classifica qualquer `text-<coisa>` desconhecido como COR, e
 * cor com cor e conflito — `cn("text-ui-13", "text-success-ink")` devolveria so a cor e o
 * elemento cairia para os 16px herdados. A lista espelha o `fontSize` do tailwind.config.ts.
 */
export const TEXT_SCALE = ["ui-10", "ui-11", "ui-12", "ui-13", "ui-14", "h3", "h2", "h1", "display"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TEXT_SCALE] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

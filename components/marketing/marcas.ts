import type { Balde, Plataforma } from "@/lib/dados/marketing-calculos";

/**
 * As marcas de dado da tela de marketing. Par categorico Meta x Google validado pela
 * bateria da skill dataviz (azul.graf #3D53B8 e laranja #EC662E: ΔE protan 27,5, contraste
 * >= 3:1 no branco). Organico e "outros" sao de-enfase (cinza) — nao concorrem com o par.
 * Texto NUNCA veste a cor da serie: so a marca (barra, ponto, coluna).
 */
export const COR = {
  meta: "#3D53B8",
  google: "#EC662E",
  organico: "#6B7480",
  outros: "#B4B7BD",
} as const;

export type ChaveCor = keyof typeof COR;

export function corDe(balde: Balde, plataforma: Plataforma | null): string {
  if (balde === "organico") return COR.organico;
  if (balde === "pago" && plataforma === "meta") return COR.meta;
  if (balde === "pago" && plataforma === "google") return COR.google;
  return COR.outros;
}

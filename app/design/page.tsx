import type { Metadata } from "next";
import { Galeria } from "./galeria";

export const metadata: Metadata = { title: "Design · preset LiderHub" };

/**
 * PRESET DE DESIGN (10/09/2026) — galeria dos componentes portados do LiderHub.
 *
 * Fica FORA do grupo `(app)` de proposito: o layout autenticado le sessao, escopo e contadores no
 * servidor, e a galeria nao precisa de nada disso — precisa so de CSS. Em `next dev` a rota e
 * publica (lib/supabase/middleware.ts); em producao exige login como o resto.
 */
export default function PaginaDesign() {
  return <Galeria />;
}

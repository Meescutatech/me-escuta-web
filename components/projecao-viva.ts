"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { deveRefazer } from "@/lib/tempo-real";

/**
 * Projeção "viva" genérica (Rodada 9) — generalização do padrão das conversas (RF-9/32):
 * Supabase Realtime é DICA (chegou algo → refetch); a VERDADE é sempre a releitura das
 * projeções via server component (router.refresh()).
 *
 * Estado do banco em 22/07 (diagnóstico da fase 1): a publication `supabase_realtime` está
 * VAZIA — postgres_changes não dispara pra NENHUMA tabela core.* hoje; quem sustenta é o
 * polling (só com a aba visível) + refetch ao focar. As assinaturas ficam prontas: quando a
 * Trilha DB adicionar as tabelas à publication (replica identity PK e RLS de SELECT já ok),
 * a dica acende sozinha e o refetch passa a ser quase-imediato, sem mudança aqui.
 */

export interface FonteViva {
  /** canal de Broadcast from Database (privado) — opcional */
  canal?: string;
  /** postgres_changes — opcional */
  tabela?: { schema: string; table: string; filter?: string };
}

export function useProjecaoViva(
  fontes: FonteViva[],
  opts: { intervaloMs: number; ativo?: boolean; folgaMs?: number },
) {
  const router = useRouter();
  const ultimaAtualizacao = useRef(0);
  const { intervaloMs, ativo = true, folgaMs = 1200 } = opts;
  // dep estável: fontes é recriado a cada render do chamador
  const chaveFontes = JSON.stringify(fontes);

  useEffect(() => {
    if (!ativo) return;
    const fontesEfetivas = JSON.parse(chaveFontes) as FonteViva[];

    const atualizar = () => {
      const agora = Date.now();
      if (!deveRefazer(ultimaAtualizacao.current, agora, folgaMs)) return;
      ultimaAtualizacao.current = agora;
      router.refresh();
    };

    const supabase = criarClienteBrowser();
    const canais: RealtimeChannel[] = [];
    let cancelado = false;
    if (fontesEfetivas.length > 0) {
      (async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelado) return;
        // canal privado (broadcast) exige o JWT no Realtime — sem setAuth a dica nunca chega
        if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
        for (const f of fontesEfetivas) {
          let canal = supabase.channel(
            f.canal ?? `pg:${f.tabela?.schema}.${f.tabela?.table}:${f.tabela?.filter ?? "*"}`,
            f.canal ? { config: { private: true } } : undefined,
          );
          if (f.canal) canal = canal.on("broadcast", { event: "*" }, atualizar);
          if (f.tabela) {
            canal = canal.on(
              "postgres_changes",
              { event: "*", schema: f.tabela.schema, table: f.tabela.table, filter: f.tabela.filter },
              atualizar,
            );
          }
          canais.push(canal.subscribe());
        }
      })();
    }

    // fallback que carrega o piano hoje: polling só com a aba visível + refetch ao focar
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, intervaloMs);
    const aoFocar = () => atualizar();
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);

    return () => {
      cancelado = true;
      clearInterval(tick);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
      for (const c of canais) supabase.removeChannel(c);
    };
  }, [chaveFontes, ativo, intervaloMs, folgaMs, router]);
}

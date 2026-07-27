"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { problemasNasFontes, tentarRefazer, type FonteTabela } from "@/lib/tempo-real";
import { intervaloEfetivo } from "@/lib/intervalos-vivos";

/**
 * Projeção "viva" genérica (Rodada 9) — generalização do padrão das conversas (RF-9/32):
 * Supabase Realtime é DICA (chegou algo → refetch); a VERDADE é sempre a releitura das
 * projeções via server component (router.refresh()).
 *
 * A publication `supabase_realtime` TEM as 6 tabelas core.* (conversa, mensagem, lead,
 * estado_lead, mencao, tarefa), em local e em produção — conferido na fonte em 26/07. O
 * comentário que vivia aqui dizendo que ela estava VAZIA era falso e mandou todo mundo olhar
 * para o lado errado por quatro dias (E-008). O que calava o inbox era outra coisa, e está
 * descrita em `lib/tempo-real.ts`: canal privado e postgres_changes pendurados no MESMO canal.
 *
 * Duas regras que este arquivo passa a garantir:
 *   1. UM canal por fonte, e nenhuma fonte mistura Broadcast com postgres_changes. Falha de
 *      autorização de um canal nunca derruba o outro.
 *   2. O status de `subscribe()` é PROPAGADO ao chamador (e vai para o console quando falha).
 *      Antes ele era engolido: o canal morria e a tela seguia exibindo "ao vivo".
 */

export interface FonteViva {
  /** canal de Broadcast from Database (privado) — opcional, e NUNCA junto de `tabela` */
  canal?: string;
  /** postgres_changes — opcional, e NUNCA junto de `canal` */
  tabela?: FonteTabela;
}

export interface EstadoVivo {
  /** true só quando existe assinatura e TODAS confirmaram `SUBSCRIBED`. */
  aoVivo: boolean;
  /** falhas observadas, no formato "<canal>: <status>" — vazio quando não há. */
  falhas: string[];
}

export function useProjecaoViva(
  fontes: FonteViva[],
  opts: {
    intervaloMs: number;
    ativo?: boolean;
    folgaMs?: number;
    /**
     * Quando informado, o intervalo cai para este piso enquanto o tempo real NÃO estiver
     * confirmado. Use nas telas cujo intervalo só é longo porque o Realtime as sustenta
     * (/conversas e /funil). Sem ele, `intervaloMs` vale sempre.
     */
    pisoSemTempoRealMs?: number;
  },
): EstadoVivo {
  const router = useRouter();
  const rota = usePathname() ?? "/";
  const { intervaloMs, ativo = true, folgaMs = 1200, pisoSemTempoRealMs } = opts;
  // dep estável: fontes é recriado a cada render do chamador
  const chaveFontes = JSON.stringify(fontes);

  const [status, setStatus] = useState<Record<string, string>>({});

  // folga muda sem precisar remontar assinatura nem relógio
  const folgaRef = useRef(folgaMs);
  folgaRef.current = folgaMs;

  // O debounce é COMPARTILHADO por rota (F4): duas instâncias do hook na mesma página produzem
  // UMA releitura, não duas separadas por ~1 s.
  const atualizar = useCallback(() => {
    if (!tentarRefazer(rota, Date.now(), folgaRef.current)) return;
    router.refresh();
  }, [rota, router]);

  // ── efeito 1: assinaturas. Depende só das fontes — mudar o intervalo NÃO remonta canal
  // (senão o piso condicional viraria laço: reassina → confirma → sobe o intervalo → reassina).
  useEffect(() => {
    if (!ativo) {
      setStatus({});
      return;
    }
    const fontesEfetivas = JSON.parse(chaveFontes) as FonteViva[];
    if (fontesEfetivas.length === 0) {
      setStatus({});
      return;
    }

    const problemas = problemasNasFontes(fontesEfetivas);
    if (problemas.length > 0) {
      // não silencia: fonte mal formada é o defeito original voltando
      console.error("[projecao-viva] fontes inválidas:", problemas.join(" · "));
    }

    const supabase = criarClienteBrowser();
    const canais: RealtimeChannel[] = [];
    let cancelado = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      // o Realtime avalia RLS com este JWT — sem setAuth, postgres_changes não entrega nada
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);

      for (const f of fontesEfetivas) {
        if (f.canal && f.tabela) continue; // já reportado acima; não abrimos o canal defeituoso
        const nome =
          f.canal ?? `pg:${f.tabela?.schema}.${f.tabela?.table}:${f.tabela?.filter ?? "*"}`;
        // canal privado só existe para Broadcast, e só quando alguém pedir `canal` explicitamente.
        // Enquanto não houver política de leitura em `realtime.messages`, ninguém pede — as fontes
        // do inbox são todas de `tabela` (ver montarFontesConversa).
        let canal = supabase.channel(nome, f.canal ? { config: { private: true } } : undefined);
        if (f.canal) canal = canal.on("broadcast", { event: "*" }, atualizar);
        if (f.tabela) {
          canal = canal.on(
            "postgres_changes",
            { event: "*", schema: f.tabela.schema, table: f.tabela.table, filter: f.tabela.filter },
            atualizar,
          );
        }
        canais.push(
          canal.subscribe((estado, erro) => {
            const detalhe = erro ? `${estado}: ${erro.message}` : estado;
            if (estado !== "SUBSCRIBED") {
              console.error(`[projecao-viva] canal "${nome}" — ${detalhe}`);
            }
            setStatus((anterior) => ({ ...anterior, [nome]: detalhe }));
          }),
        );
      }
    })();

    return () => {
      cancelado = true;
      for (const c of canais) supabase.removeChannel(c);
      setStatus({});
    };
  }, [chaveFontes, ativo, atualizar]);

  const { aoVivo, falhas } = useMemo(() => {
    const entradas = Object.entries(status);
    return {
      aoVivo: entradas.length > 0 && entradas.every(([, s]) => s === "SUBSCRIBED"),
      falhas: entradas.filter(([, s]) => s !== "SUBSCRIBED").map(([n, s]) => `${n}: ${s}`),
    };
  }, [status]);

  // ── efeito 2: o piso. Polling só com a aba visível + releitura ao focar.
  const intervaloUsado =
    pisoSemTempoRealMs == null ? intervaloMs : intervaloEfetivo(intervaloMs, aoVivo, pisoSemTempoRealMs);

  useEffect(() => {
    if (!ativo) return;
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, intervaloUsado);
    const aoFocar = () => atualizar();
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);
    return () => {
      clearInterval(tick);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [ativo, intervaloUsado, atualizar]);

  return { aoVivo, falhas };
}

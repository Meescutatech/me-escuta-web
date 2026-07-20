"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { criarClienteBrowser } from "@/lib/supabase/client";

/**
 * Conversa "viva" (SPEC RF-9/32): Supabase Realtime é DICA (chegou algo → refetch); a verdade é
 * sempre a releitura das projeções via server component (router.refresh()).
 *
 * Sinais assinados (contrato com a Trilha A — Broadcast from Database):
 *   · canal `conversas`            → mudou a lista (mensagem nova em qualquer conversa)
 *   · canal `conversa:<id>`        → mudou a conversa aberta (mensagem/status/sugestão)
 *   · postgres_changes em core.mensagem/core.conversa → dica alternativa, caso a Trilha A
 *     habilite a publicação em vez do broadcast (qualquer um dos dois dispara o refetch)
 *
 * FALLBACK HONESTO enquanto o broadcast não existe no banco: polling de 5s com a aba visível
 * + refetch ao focar a janela. Quando a Trilha A ligar o Realtime, o orçamento cai pra ≤2s
 * sem mudança aqui (a dica chega e refaz na hora).
 */
export function useConversaViva(conversaId: string | null, ativo: boolean) {
  const router = useRouter();
  const ultimaAtualizacao = useRef(0);

  useEffect(() => {
    if (!ativo) return;

    // refetch com folga mínima de 1.2s — várias dicas em rajada viram UMA releitura
    const atualizar = () => {
      const agora = Date.now();
      if (agora - ultimaAtualizacao.current < 1200) return;
      ultimaAtualizacao.current = agora;
      router.refresh();
    };

    const supabase = criarClienteBrowser();
    const canais: RealtimeChannel[] = [];
    let cancelado = false;
    // Broadcast from Database publica em canal PRIVADO (realtime.send private=true) — a assinatura
    // precisa de { private: true } E do JWT do usuário no Realtime (setAuth), senão a dica nunca chega.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      canais.push(
        supabase
          .channel("conversas", { config: { private: true } })
          .on("broadcast", { event: "*" }, atualizar)
          .on(
            "postgres_changes",
            { event: "*", schema: "core", table: "conversa" },
            atualizar,
          )
          .subscribe(),
      );
      if (conversaId) {
        canais.push(
          supabase
            .channel(`conversa:${conversaId}`, { config: { private: true } })
            .on("broadcast", { event: "*" }, atualizar)
            .on(
              "postgres_changes",
              { event: "*", schema: "core", table: "mensagem", filter: `conversa_id=eq.${conversaId}` },
              atualizar,
            )
            .subscribe(),
        );
      }
    })();

    // fallback: polling só com a aba visível + refetch ao voltar o foco
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, 5000);
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
  }, [conversaId, ativo, router]);
}

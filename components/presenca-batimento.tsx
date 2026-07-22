"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { BATIMENTO_MS, devePulsar, montarEnvelopeAtividade } from "@/lib/presenca";

/**
 * Heartbeat de presença (spec §7.1) — montado no shell autenticado, cobre TODAS as rotas.
 * A cada 60s: se a aba está visível E houve interação nos últimos 5 min, emite
 * `presenca_registrada` via api.registrar_evento (ator forçado do JWT pela porta).
 * O tempo online é derivado 100% no banco (view 0036) — aqui só se pulsa.
 * Falha de rede é silenciosa (métrica, não operação); aba oculta simplesmente não pulsa.
 */
export function PresencaBatimento() {
  const pathname = usePathname();
  const rotaRef = useRef(pathname);
  rotaRef.current = pathname;
  const ultimaInteracaoRef = useRef(Date.now());

  useEffect(() => {
    const supabase = criarClienteBrowser();
    const marcarInteracao = () => {
      ultimaInteracaoRef.current = Date.now();
    };
    const eventos: Array<keyof DocumentEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    for (const ev of eventos) document.addEventListener(ev, marcarInteracao, { passive: true });

    const pulsar = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const estado = {
        autenticado: Boolean(session),
        abaVisivel: document.visibilityState === "visible",
        msDesdeInteracao: Date.now() - ultimaInteracaoRef.current,
      };
      if (!devePulsar(estado)) return;
      const envelope = montarEnvelopeAtividade(
        "presenca_registrada",
        { rota: rotaRef.current },
        crypto.randomUUID(),
      );
      void supabase.schema("api").rpc("registrar_evento", { p: envelope });
    };

    void pulsar(); // primeiro batimento na montagem (entrou na plataforma)
    const timer = setInterval(() => void pulsar(), BATIMENTO_MS);
    return () => {
      clearInterval(timer);
      for (const ev of eventos) document.removeEventListener(ev, marcarInteracao);
    };
  }, []);

  return null;
}

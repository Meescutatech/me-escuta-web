"use client";

import { useState, useTransition } from "react";
import { avaliarJarvis, validarPrompt, type PropostaJarvis } from "@/app/(app)/jarvis/actions";
import { cn } from "@/lib/utils";

interface ItemProposta extends PropostaJarvis {
  pedido: string;
  status: "pendente" | "aprovada" | "rejeitada";
  versaoNova?: number;
}

export function PainelJarvis() {
  const [pedido, setPedido] = useState("");
  const [itens, setItens] = useState<ItemProposta[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pedir() {
    const texto = pedido.trim();
    if (!texto || pending) return;
    setErro(null);
    startTransition(async () => {
      const r = await avaliarJarvis(texto);
      if (!r.ok) {
        setErro(r.motivo);
        return;
      }
      setItens((p) => [{ ...r.proposta, pedido: texto, status: "pendente" }, ...p]);
      setPedido("");
    });
  }

  function validar(sugestaoId: string, decisao: "aprovada" | "rejeitada") {
    startTransition(async () => {
      const r = await validarPrompt(sugestaoId, decisao);
      if (!r.ok) {
        setErro(r.motivo ?? "Falha ao validar.");
        return;
      }
      setItens((p) =>
        p.map((it) =>
          it.sugestao_id === sugestaoId ? { ...it, status: decisao, versaoNova: r.versaoNova } : it,
        ),
      );
    });
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-6 py-6">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-sm font-bold text-branco">
            J
          </span>
          <div>
            {/* M6: o NOME DA PÁGINA subiu para o header (fonte única rota→título). O que fica é a
                identidade do agente ao lado do avatar — que é do painel, não do shell — e ela sai
                da Fraunces, a tipografia que o `r9-tokens.md` §7.1 mandou apagar do app inteiro e
                que sobrevivia exatamente nas 3 rotas fora do menu. `h2`: um `h1` por documento. */}
            <h2 className="text-[15px] font-[650] leading-none text-tinta">@jarvis</h2>
            <p className="mt-1 text-xs text-mute">
              Melhore o prompt da Clara sem deploy — o Jarvis propõe, você valida, vira evento.
            </p>
          </div>
        </div>
      </div>

      {/* composer */}
      <div className="rounded-lg border border-borda bg-branco p-3 shadow-suave">
        <textarea
          rows={2}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              pedir();
            }
          }}
          placeholder="Ex.: a Clara foi seca demais na abertura — deixa o tom mais acolhedor com os idosos"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-mute"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-mute">Alvo: <b className="text-suave">Clara</b></span>
          <button
            onClick={pedir}
            disabled={pending || !pedido.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-branco hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Jarvis avaliando…" : "Pedir melhoria"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-md bg-vermelho-bg px-4 py-2.5 text-sm text-vermelho">{erro}</div>
      )}

      {itens.length === 0 && !pending && (
        <div className="rounded-lg border border-dashed border-borda-forte px-4 py-10 text-center text-sm text-mute">
          Peça uma melhoria acima. O Jarvis lê o prompt atual da Clara e propõe uma edição cirúrgica
          (diff), que você aprova para valer já na próxima mensagem — sem deploy.
        </div>
      )}

      {/* propostas */}
      <div className="space-y-4">
        {itens.map((it) => (
          <div key={it.sugestao_id} className="overflow-hidden rounded-lg border border-azul-bd bg-branco shadow-forte">
            <div className="flex items-baseline gap-2.5 px-4 pb-2 pt-3.5">
              <span className="text-[0.62rem] font-bold uppercase tracking-wide text-laranja-esc">
                @jarvis propõe
              </span>
              <span className="font-serif text-base font-semibold text-navy">Novo prompt para a Clara</span>
              <span className="ml-auto text-xs text-mute">
                v{it.versao_base}→v{it.versaoNova ?? it.versao_base + 1}
              </span>
            </div>
            <div className="px-4 pb-4">
              <p className="mb-1 text-xs italic text-mute">você pediu: “{it.pedido}”</p>
              {it.diagnostico && <p className="mb-3 text-sm leading-relaxed text-texto">{it.diagnostico}</p>}

              <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-wide text-mute">
                O que muda no prompt
              </div>
              <div className="mb-3 overflow-hidden rounded-md border border-borda-forte font-mono text-xs leading-relaxed">
                <div className="flex gap-2 whitespace-pre-wrap break-words bg-vermelho-bg px-3 py-2 text-[#9c3b25]">
                  <span className="shrink-0 font-bold opacity-70">−</span>
                  <span>{it.trecho_antigo}</span>
                </div>
                <div className="flex gap-2 whitespace-pre-wrap break-words bg-verde-bg px-3 py-2 text-[#1f6b48]">
                  <span className="shrink-0 font-bold opacity-70">+</span>
                  <span>{it.trecho_novo}</span>
                </div>
              </div>

              {it.justificativa && (
                <p className="mb-4 border-l-2 border-laranja-cl pl-3 text-sm leading-relaxed text-suave">
                  {it.justificativa}
                </p>
              )}

              {it.status === "pendente" ? (
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => validar(it.sugestao_id, "aprovada")}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-4 py-2 text-sm font-semibold text-branco shadow-laranja hover:bg-laranja-esc disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4 stroke-current" fill="none">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Aprovar melhoria
                  </button>
                  <button
                    onClick={() => validar(it.sugestao_id, "rejeitada")}
                    disabled={pending}
                    className="rounded-md border-[1.5px] border-borda-forte bg-branco px-4 py-2 text-sm font-semibold text-suave hover:bg-creme hover:text-navy disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                  <span className="ml-auto text-xs text-mute">valida <b className="text-suave">você</b></span>
                </div>
              ) : (
                <div
                  className={cn(
                    "rounded-md px-3 py-2.5 text-sm font-semibold",
                    it.status === "aprovada" ? "bg-verde-bg text-verde" : "bg-vermelho-bg text-vermelho",
                  )}
                >
                  {it.status === "aprovada"
                    ? `✓ Aprovada — Clara agora na v${it.versaoNova ?? it.versao_base + 1} (sem deploy, vale na próxima mensagem)`
                    : "✕ Rejeitada — Clara segue no prompt atual"}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

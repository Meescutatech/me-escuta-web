"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarLeadManual } from "@/app/(app)/funil/actions";
import type { EtapaFunil } from "@/lib/dados/funil";
import { cn } from "@/lib/utils";

/**
 * NOVO LEAD À MÃO (R20) — quem chega por ligação, indicação ou pela mão da fono.
 *
 * O gesto que este diálogo copia é a "Adição rápida" fixa em toda coluna do Kommo: nome, telefone
 * e pronto — o resto se preenche na ficha depois. Pedir mais campos aqui faz a pessoa desistir e
 * anotar no papel, que é o estado que isto existe para acabar.
 *
 * Só `nome` é obrigatório. Telefone é opcional de propósito: quem liga nem sempre dita o número
 * antes de desligar, e lead sem telefone no board é melhor que lead nenhum.
 */
export function NovoLead({
  etapas,
  etapaPadrao,
  autorId,
}: {
  etapas: EtapaFunil[];
  /** onde o lead nasce — a primeira etapa aberta do funil */
  etapaPadrao: string;
  autorId: string | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [etapa, setEtapa] = useState(etapaPadrao);
  const [meu, setMeu] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoNome = useRef<HTMLInputElement>(null);

  const fechar = useCallback(() => {
    setAberto(false);
    setNome("");
    setTelefone("");
    setEtapa(etapaPadrao);
    setMeu(true);
    setErro(null);
  }, [etapaPadrao]);

  useEffect(() => {
    if (!aberto) return;
    campoNome.current?.focus();
    function aoTeclar(e: KeyboardEvent) {
      // não fecha no meio de um salvamento: perder o formulário com a escrita em voo faria a
      // pessoa redigitar tudo sem saber se o lead entrou
      if (e.key === "Escape" && !salvando) fechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, salvando, fechar]);

  async function salvar() {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    const res = await criarLeadManual({
      nome,
      telefone,
      etapa,
      donoId: meu ? autorId : null,
    });
    setSalvando(false);
    if (!res.ok) {
      setErro(res.motivo ?? "Não foi possível criar o lead.");
      return;
    }
    fechar();
    // o board é server-rendered: o refresh traz o card novo já projetado (o readback do
    // registrarEventoUI garante que a projeção existe antes de chegarmos aqui)
    router.refresh();
  }

  const abertas = etapas.filter((e) => e.tipo === "aberto");

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-[6px] bg-laranja px-3 py-1.5 text-[12.5px] font-medium text-branco transition-colors hover:bg-laranja-esc"
      >
        <svg viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" className="h-3.5 w-3.5 stroke-current" fill="none">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Novo lead
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-tinta/20 p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && !salvando) fechar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Novo lead"
            className="w-full max-w-[420px] rounded-[10px] border border-linha bg-branco p-5 shadow-forte"
          >
            <h2 className="text-[15px] font-[650] text-tinta">Novo lead</h2>
            <p className="mt-1 text-[12.5px] text-suave">
              Para quem chegou por ligação, indicação ou pela fono. O resto da ficha se preenche depois.
            </p>

            <label className="mt-4 block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-suave">Nome</span>
              <input
                ref={campoNome}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvar();
                }}
                placeholder="Nome de quem procurou"
                className="mt-1 w-full rounded-[6px] border border-linha bg-branco px-2.5 py-1.5 text-[13px] text-tinta outline-none focus:border-linha-forte"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-suave">
                Telefone <span className="font-normal normal-case tracking-normal text-mute">· opcional</span>
              </span>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvar();
                }}
                placeholder="(31) 99999-0000"
                inputMode="tel"
                className="mt-1 w-full rounded-[6px] border border-linha bg-branco px-2.5 py-1.5 text-[13px] text-tinta outline-none focus:border-linha-forte"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-suave">Etapa</span>
              <select
                value={etapa}
                onChange={(e) => setEtapa(e.target.value)}
                className="mt-1 w-full rounded-[6px] border border-linha bg-branco px-2.5 py-1.5 text-[13px] text-tinta outline-none focus:border-linha-forte"
              >
                {abertas.map((e) => (
                  <option key={e.chave} value={e.chave}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </label>

            {autorId && (
              <label className="mt-3 flex items-center gap-2 text-[13px] text-tinta">
                <input type="checkbox" checked={meu} onChange={(e) => setMeu(e.target.checked)} className="h-3.5 w-3.5" />
                Fico como responsável
              </label>
            )}

            {erro && (
              <p className="mt-3 rounded-[6px] bg-vermelho-bg px-2.5 py-1.5 text-[12.5px] text-vermelho">{erro}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                disabled={salvando}
                className="rounded-[6px] border border-linha px-3 py-1.5 text-[12.5px] text-suave hover:border-linha-forte disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={!nome.trim() || salvando}
                className={cn(
                  "rounded-[6px] bg-laranja px-3 py-1.5 text-[12.5px] font-medium text-branco transition-colors hover:bg-laranja-esc",
                  (!nome.trim() || salvando) && "opacity-50",
                )}
              >
                {salvando ? "Criando…" : "Criar lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

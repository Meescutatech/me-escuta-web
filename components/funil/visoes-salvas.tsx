"use client";

import { useEffect, useRef, useState } from "react";
import type { FiltrosFunil } from "@/lib/dados/funil-filtros";
import type { ChaveOrdem } from "@/lib/dados/funil-ordenacao";
import { gravarVisoes, lerVisoes, novaVisao, visaoAtiva, type VisaoSalva } from "@/lib/funil/visoes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
 * W-D6 v4 (11/09) · VISÕES SALVAS — o `inbox_saved_views` do LiderHub.
 *
 * A combinação inteira (filtros + ordem) ganha um nome e vira uma ABA RÁPIDA ao lado do segmento.
 * É o que transforma o recorte que a Sara remonta toda segunda ("meus leads sem tarefa em
 * proposta") num clique. Guardado em cookie nesta rodada (ver `lib/funil/visoes.ts`, que declara
 * por que e para onde vai depois).
 *
 * O botão "Salvar visão" só aparece quando HÁ filtro ligado: salvar o board vazio não guarda
 * nada, e um botão que às vezes não faz sentido é pior que um botão que aparece quando faz.
 * A visão ativa fica marcada; clicar nela de novo não desliga (desligar é "Limpar tudo", que já
 * existe nos chips e diz o que faz).
 */

export function VisoesSalvas({
  filtros,
  ordem,
  onAplicar,
  temFiltro,
}: {
  filtros: FiltrosFunil;
  ordem: ChaveOrdem;
  onAplicar: (f: FiltrosFunil, o: ChaveOrdem) => void;
  temFiltro: boolean;
}) {
  const [visoes, setVisoes] = useState<VisaoSalva[]>([]);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  // cookie só existe no cliente: lê depois da montagem (SSR e cliente batem, sem mismatch)
  useEffect(() => {
    setVisoes(lerVisoes());
  }, []);

  function salvar() {
    const v = novaVisao(nome, filtros, ordem);
    const lista = [...visoes.filter((x) => x.nome !== v.nome), v];
    setVisoes(lista);
    gravarVisoes(lista);
    setNome("");
    setAberto(false);
  }

  function remover(id: string) {
    const lista = visoes.filter((v) => v.id !== id);
    setVisoes(lista);
    gravarVisoes(lista);
  }

  return (
    <div className="flex items-center gap-1">
      {visoes.map((v) => {
        const ativa = visaoAtiva(v, filtros, ordem);
        return (
          <span key={v.id} className="group relative">
            <button
              type="button"
              onClick={() => onAplicar({ ...v.filtros, busca: "" }, v.ordem)}
              title={`Visão salva: ${v.nome}`}
              className={cn(
                "h-9 max-w-[160px] truncate rounded-[8px] border px-3 pr-6 text-[12.5px] transition-colors",
                ativa ? "border-laranja/60 bg-laranja-cl/40 font-medium text-tinta" : "border-linha bg-branco text-suave hover:border-linha-forte",
              )}
            >
              {v.nome}
            </button>
            <button
              type="button"
              onClick={() => remover(v.id)}
              aria-label={`Remover a visão ${v.nome}`}
              className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-full p-0.5 text-mute hover:text-tinta group-hover:block"
            >
              <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3 stroke-current" fill="none" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        );
      })}

      {temFiltro && (
        <Popover
          open={aberto}
          onOpenChange={(o) => {
            setAberto(o);
            if (o) setTimeout(() => ref.current?.focus(), 20);
          }}
        >
          <PopoverTrigger
            type="button"
            aria-label="Salvar esta combinação de filtros como visão"
            className="flex h-9 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] text-suave transition-colors hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none" aria-hidden>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            Salvar visão
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <label className="block text-[12px] text-suave" htmlFor="nome-visao">
              Nome desta visão
            </label>
            <input
              id="nome-visao"
              ref={ref}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nome.trim()) salvar();
                if (e.key === "Escape") setAberto(false);
              }}
              placeholder="Minha manhã"
              className="mt-1.5 h-8 w-full rounded-[6px] border border-linha bg-branco px-2.5 text-[13px] text-tinta outline-none placeholder:text-mute focus:border-linha-forte"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-mute">Guarda os filtros e a ordem. A busca não entra — ela muda todo dia.</p>
            <button
              type="button"
              disabled={!nome.trim()}
              onClick={salvar}
              className="mt-2.5 h-8 w-full rounded-[6px] bg-tinta text-[12.5px] font-medium text-branco disabled:opacity-40"
            >
              Salvar
            </button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

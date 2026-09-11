"use client";

import { useEffect, useState } from "react";
import { BookmarkIcon, XIcon } from "lucide-react";
import type { FiltrosTarefas } from "@/lib/dados/tarefas-visao-calculos";
import { ORDENS, ROTULO_ORDEM, type ChaveOrdem } from "@/lib/tarefas/prioridade";
import {
  gravarVisoesTarefas,
  lerVisoesTarefas,
  novaVisaoTarefas,
  visaoTarefasAtiva,
  type FormaVisao,
  type VisaoTarefasSalva,
} from "@/lib/tarefas/visoes";
import { Gatilho, Opcao } from "./filtros";
import { cn } from "@/lib/utils";

/*
 * ORDEM e VISÕES SALVAS — os dois controles da DIREITA da barra (W-T v4, 11/09).
 *
 * A ordem fica à direita de propósito: ela não recorta nada, muda só a sequência. Misturada aos
 * grupos de filtro, viraria "mais um jeito de esconder tarefa" — e é o contrário disso.
 *
 * Cada opção diz o que ela faz com a fila, não só o nome. "Mais urgente primeiro" sem explicação é
 * um oráculo; com a linha embaixo ("vencida, prazo, prioridade, etapa do lead, espera e valor —
 * somados") vira uma regra que alguém pode discordar — e discordar de regra é o que permite
 * corrigi-la.
 */

export function SeletorOrdem({ ordem, onMudar }: { ordem: ChaveOrdem; onMudar: (o: ChaveOrdem) => void }) {
  return (
    <Gatilho ativo={ordem !== "urgencia"} rotulo={ROTULO_ORDEM[ordem]}>
      <div className="flex w-[300px] flex-col gap-px p-1.5">
        {ORDENS.map((o) => (
          <Opcao key={o.chave} ativo={ordem === o.chave} onClick={() => onMudar(o.chave)}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{o.rotulo}</span>
              <span className="truncate text-[11.5px] font-normal text-mute">{o.explica}</span>
            </span>
          </Opcao>
        ))}
      </div>
    </Gatilho>
  );
}

export function VisoesSalvas({
  filtros,
  ordem,
  forma,
  onAplicar,
}: {
  filtros: FiltrosTarefas;
  ordem: ChaveOrdem;
  forma: FormaVisao;
  onAplicar: (v: VisaoTarefasSalva) => void;
}) {
  const [visoes, setVisoes] = useState<VisaoTarefasSalva[]>([]);
  const [nome, setNome] = useState("");

  // cookie só existe no navegador: ler no efeito evita divergência entre servidor e cliente
  useEffect(() => setVisoes(lerVisoesTarefas()), []);

  function salvar() {
    const v = novaVisaoTarefas(nome, filtros, ordem, forma);
    const lista = [...visoes.filter((x) => x.nome !== v.nome), v];
    setVisoes(lista);
    gravarVisoesTarefas(lista);
    setNome("");
  }
  function apagar(id: string) {
    const lista = visoes.filter((v) => v.id !== id);
    setVisoes(lista);
    gravarVisoesTarefas(lista);
  }

  const ativa = visoes.find((v) => visaoTarefasAtiva(v, filtros, ordem, forma));

  return (
    <Gatilho ativo={!!ativa} rotulo={ativa ? ativa.nome : "Visões"}>
      <div className="flex w-[264px] flex-col p-1.5">
        {visoes.length === 0 && (
          <p className="px-2 py-2 text-[12.5px] leading-snug text-mute">
            Nenhuma visão salva. Monte o recorte na barra e dê um nome — ela vira um clique.
          </p>
        )}
        {visoes.map((v) => (
          <div key={v.id} className="group/visao flex items-center">
            <div className="min-w-0 flex-1">
              <Opcao ativo={ativa?.id === v.id} onClick={() => onAplicar(v)}>
                <span className="truncate">{v.nome}</span>
              </Opcao>
            </div>
            <button
              type="button"
              onClick={() => apagar(v.id)}
              aria-label={`Apagar a visão ${v.nome}`}
              className="shrink-0 rounded p-1 text-mute opacity-0 transition-opacity hover:text-vermelho group-hover/visao:opacity-100"
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 border-t border-linha pt-1.5">
          <BookmarkIcon className="size-3.5 shrink-0 text-mute" aria-hidden />
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nome.trim()) salvar();
            }}
            placeholder="Salvar esta visão como…"
            aria-label="Nome da visão"
            className="h-7 min-w-0 flex-1 rounded-md border border-linha bg-branco px-2 text-[12.5px] outline-none focus:border-linha-forte"
          />
          <button
            type="button"
            disabled={!nome.trim()}
            onClick={salvar}
            className={cn("shrink-0 rounded-md px-2 py-1 text-[12px] font-medium", nome.trim() ? "text-tinta hover:bg-hover" : "text-mute/60")}
          >
            Salvar
          </button>
        </div>
      </div>
    </Gatilho>
  );
}

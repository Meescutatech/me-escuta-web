"use client";

import { useMemo, useState } from "react";
import type { TarefaLead } from "@/lib/dados/lead-painel";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import {
  iniciaisDe,
  nomeResponsavel,
  organizarTarefas,
  textoPrazo,
  vencida,
} from "@/lib/dados/tarefa-calculos";
import { concluirTarefaLead, criarTarefaLead } from "@/app/(app)/lead/actions";
import { AcoesTarefa, BotaoAcoes } from "@/components/tarefas/acoes-tarefa";
import { cn } from "@/lib/utils";

/*
 * TAREFAS do lead — lista da projeção core.tarefa (R8, remodelada na R13 / Bloco C).
 * Mockup: Design/tarefas-lead-v3.html.
 *
 * Regras que o mockup encena e o código honra:
 *  · atrasada sobe pro topo e é a ÚNICA cor semântica da lista (vermelho) — se tudo fosse
 *    colorido, nada seria (§10.1: no Kommo 97,9% da fila aberta está vencida);
 *  · concluída sai do caminho — riscada, cinza, dobrada num <details> fechado;
 *  · concluir exige RESULTADO (§4.1.2): é o campo que no Kommo só 29,1% preencheram porque
 *    o obrigatório era do formulário. Aqui a ação não fecha sem ele, e a porta valida de novo.
 *
 * A criação vive aqui além do composer porque o drawer do funil não tem campo de conversa —
 * é o único caminho de criação a partir do funil.
 */

export function TarefasLead({
  leadId,
  tarefas,
  mencionaveis,
  tiposTarefa,
  autorId,
  autorEmail,
  aoAtualizar,
}: {
  leadId: string;
  tarefas: TarefaLead[];
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  autorId: string | null;
  autorEmail: string | null;
  aoAtualizar: () => void;
}) {
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [tipo, setTipo] = useState("");
  const [responsavelId, setResponsavelId] = useState(autorId ?? "");
  const [concluindoId, setConcluindoId] = useState<string | null>(null);
  const [acoesId, setAcoesId] = useState<string | null>(null); // ⋯ (R14: reatribuir/repactuar/arquivar)
  const [resultado, setResultado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const agora = Date.now();
  const { abertas, concluidas, qtdVencidas } = useMemo(
    () => organizarTarefas(tarefas, agora),
    [tarefas, agora],
  );
  const nomePorId = useMemo(
    () => new Map(mencionaveis.filter((m) => m.tipo === "humano").map((m) => [m.id, m.nome])),
    [mencionaveis],
  );
  const pessoas = useMemo(
    () => mencionaveis.filter((m) => m.tipo === "humano" && m.ativo),
    [mencionaveis],
  );

  async function criar() {
    if (!titulo.trim() || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await criarTarefaLead(leadId, {
      titulo,
      tipo: tipo || null,
      responsavelId: responsavelId || null,
      responsavel: responsavelId ? null : autorEmail,
      prazoIso: prazo ? new Date(prazo).toISOString() : null,
      mencoes: [],
    });
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "erro ao criar");
      return;
    }
    setTitulo("");
    setPrazo("");
    setTipo("");
    setCriando(false);
    aoAtualizar();
  }

  async function concluir(tarefaId: string) {
    if (ocupado) return;
    if (!resultado.trim()) {
      setErro("descreva o resultado para concluir");
      return;
    }
    setOcupado(true);
    setErro(null);
    const r = await concluirTarefaLead(leadId, tarefaId, resultado);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "erro ao concluir");
      return;
    }
    setConcluindoId(null);
    setResultado("");
    aoAtualizar();
  }

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">Tarefas</h3>
        <span className="font-mono text-[10.5px] tabular-nums text-mute">
          {abertas.length === 0
            ? "nenhuma aberta"
            : `${abertas.length} ${abertas.length === 1 ? "aberta" : "abertas"}`}
          {qtdVencidas > 0 && ` · ${qtdVencidas} atrasada${qtdVencidas === 1 ? "" : "s"}`}
        </span>
        {!criando && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="ml-auto rounded-md px-1.5 py-[3px] text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
          >
            Nova tarefa
          </button>
        )}
      </div>

      {abertas.length === 0 && !criando && (
        <p className="px-1 pb-1.5 pt-[22px] text-[13px] leading-normal text-suave">
          Nenhuma tarefa. Digite{" "}
          <code className="rounded border border-linha bg-board px-1.5 py-px font-mono text-[12.5px] text-tinta">
            /tarefa
          </code>{" "}
          no campo da conversa para criar uma com responsável e prazo.
        </p>
      )}

      {abertas.map((t) => {
        const atrasada = vencida(t.prazo, agora);
        const quem = nomeResponsavel(t, nomePorId);
        const concluindo = concluindoId === t.id;
        return (
          <div key={t.id} className="border-b border-[#F1F0EC] py-2.5 last:border-b-0">
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setConcluindoId(concluindo ? null : t.id);
                  setResultado("");
                  setErro(null);
                }}
                aria-label={`Concluir: ${t.titulo}`}
                aria-expanded={concluindo}
                className="mt-px grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-mute bg-branco transition-colors hover:border-navy"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-snug text-tinta">{t.titulo}</div>
                {t.descricao && (
                  <div className="mt-0.5 text-[12px] leading-snug text-suave">{t.descricao}</div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-suave">
                  {quem && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-navy text-[8.5px] font-semibold text-branco">
                        {iniciaisDe(quem)}
                      </span>
                      {quem}
                    </span>
                  )}
                  {quem && <span className="text-linha">·</span>}
                  <span className="font-mono tabular-nums">{textoPrazo(t, agora)}</span>
                  {atrasada && (
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-vermelho">
                      Atrasada
                    </span>
                  )}
                </div>
              </div>
              <BotaoAcoes
                aberto={acoesId === t.id}
                onToggle={() => {
                  setAcoesId(acoesId === t.id ? null : t.id);
                  setErro(null);
                }}
              />
            </div>

            {acoesId === t.id && (
              <AcoesTarefa
                leadId={leadId}
                tarefaId={t.id}
                prazoAtual={t.prazo}
                responsavelAtualId={t.responsavel_id}
                pessoas={pessoas}
                aoSucesso={aoAtualizar}
                onFechar={() => setAcoesId(null)}
              />
            )}

            {concluindo && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-linha pt-2">
                <input
                  autoFocus
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void concluir(t.id);
                    if (e.key === "Escape") setConcluindoId(null);
                  }}
                  placeholder="Resultado — o que aconteceu?"
                  aria-label="Resultado da tarefa (obrigatório)"
                  className="min-w-0 flex-1 rounded-md border border-linha-forte bg-branco px-2 py-1 text-[12.5px] outline-none focus:border-laranja"
                />
                <button
                  type="button"
                  onClick={() => void concluir(t.id)}
                  disabled={ocupado || !resultado.trim()}
                  className="shrink-0 rounded-md bg-laranja px-2.5 py-1 text-[12px] font-semibold text-branco transition-colors hover:bg-laranja-esc disabled:opacity-50"
                >
                  Concluir
                </button>
              </div>
            )}
          </div>
        );
      })}

      {concluidas.length > 0 && (
        <details className="mt-1.5 [&[open]_svg.seta]:rotate-90">
          <summary className="flex cursor-pointer list-none items-center gap-[7px] rounded-md px-1 py-[7px] text-[12px] text-suave transition-colors hover:bg-hover hover:text-tinta [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="seta h-[11px] w-[11px] stroke-current transition-transform" fill="none">
              <path d="m9 5 7 7-7 7" />
            </svg>
            Concluídas <span className="font-mono text-[11px] text-mute">{concluidas.length}</span>
          </summary>
          {concluidas.map((t) => {
            const quem = nomeResponsavel(t, nomePorId);
            return (
              <div key={t.id} className="flex items-start gap-2.5 border-b border-[#F1F0EC] py-2.5 last:border-b-0">
                <span className="mt-px grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-verde bg-verde">
                  <svg viewBox="0 0 24 24" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" className="h-[11px] w-[11px] stroke-branco" fill="none">
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] leading-snug text-suave line-through decoration-mute">
                    {t.titulo}
                  </div>
                  {t.resultado && (
                    <div className="mt-0.5 text-[12px] leading-snug text-suave">→ {t.resultado}</div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-mute">
                    {quem && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-mute text-[8.5px] font-semibold text-branco">
                          {iniciaisDe(quem)}
                        </span>
                        {quem}
                      </span>
                    )}
                    {quem && <span className="text-linha">·</span>}
                    <span className="font-mono tabular-nums">{textoPrazo(t, agora)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </details>
      )}

      {criando && (
        <div className="mt-2 rounded-[9px] border-[1.5px] border-borda-forte bg-branco px-3 py-2.5">
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void criar();
              if (e.key === "Escape") setCriando(false);
            }}
            placeholder="O que precisa ser feito…"
            aria-label="Título da tarefa"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-mute"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <select
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              aria-label="Responsável"
              className="min-w-0 flex-1 cursor-pointer rounded-md border border-linha bg-branco px-1.5 py-1 text-[12px] text-tinta outline-none focus:border-laranja"
            >
              {pessoas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              aria-label="Tipo da tarefa"
              className={cn(
                "min-w-0 flex-1 cursor-pointer rounded-md border border-linha bg-branco px-1.5 py-1 text-[12px] outline-none focus:border-laranja",
                tipo ? "text-tinta" : "text-mute",
              )}
            >
              <option value="">Tipo</option>
              {tiposTarefa.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              aria-label="Prazo (data e hora)"
              className="min-w-0 flex-1 rounded-md border border-linha bg-branco px-1.5 py-1 font-mono text-[12px] text-suave outline-none focus:border-laranja"
            />
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void criar()}
              disabled={ocupado || !titulo.trim()}
              className="shrink-0 rounded-md bg-laranja px-2.5 py-1 text-[12px] font-semibold text-branco transition-colors hover:bg-laranja-esc disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-1.5 text-[11.5px] font-semibold text-vermelho">{erro}</p>}
    </div>
  );
}

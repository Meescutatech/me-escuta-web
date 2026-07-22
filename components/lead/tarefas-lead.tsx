"use client";

import { useState } from "react";
import type { TarefaLead } from "@/lib/dados/lead-painel";
import { fmtDataHora, nivelPrazo } from "@/lib/dados/ficha-calculos";
import { concluirTarefaLead, criarTarefaLead } from "@/app/(app)/lead/actions";
import { cn } from "@/lib/utils";

/*
 * TAREFAS do lead (Rodada 8) — lista da projeção core.tarefa, criar com prazo, concluir com
 * resultado. A conclusão SEMPRE envia o tarefa_id real (id da projeção = evento.id do
 * tarefa_criada) — conserto do bug da R7 (emissão sem tarefa_id que a projeção nunca refletia).
 */

export function TarefasLead({
  leadId,
  tarefas,
  responsavelPadrao,
  aoAtualizar,
}: {
  leadId: string;
  tarefas: TarefaLead[];
  responsavelPadrao: string | null;
  aoAtualizar: () => void;
}) {
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState(""); // datetime-local
  const [concluindoId, setConcluindoId] = useState<string | null>(null);
  const [resultado, setResultado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const agora = Date.now();
  const pendentes = tarefas
    .filter((t) => t.status !== "concluida")
    .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
  const concluidas = tarefas.filter((t) => t.status === "concluida").slice(0, 5);

  async function criar() {
    if (!titulo.trim() || ocupado) return;
    setOcupado(true);
    setErro(null);
    const prazoIso = prazo ? new Date(prazo).toISOString() : null;
    const r = await criarTarefaLead(leadId, titulo, prazoIso, responsavelPadrao);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "erro ao criar");
      return;
    }
    setTitulo("");
    setPrazo("");
    setCriando(false);
    aoAtualizar();
  }

  async function concluir(tarefaId: string) {
    if (ocupado) return;
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
    <div className="flex flex-col gap-1.5">
      {tarefas.length === 0 && !criando && (
        <p className="text-[0.78rem] text-mute">Nenhuma tarefa pra este lead ainda.</p>
      )}

      {pendentes.map((t) => {
        const nivel = nivelPrazo(t.prazo, agora);
        return (
          <div key={t.id} className="rounded-[9px] border border-linha bg-branco px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setConcluindoId(concluindoId === t.id ? null : t.id);
                  setResultado("");
                }}
                title="Concluir tarefa"
                aria-label={`Concluir tarefa ${t.titulo}`}
                className="mt-0.5 grid h-[17px] w-[17px] shrink-0 place-items-center rounded-md border-2 border-borda-forte hover:border-laranja"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[0.84rem] font-medium leading-snug text-navy">{t.titulo}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.72rem] text-suave">
                  {t.prazo && (
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        nivel === "atrasada" && "text-vermelho",
                        nivel === "breve" && "text-laranja-esc",
                      )}
                    >
                      {fmtDataHora(t.prazo, new Date(agora))}
                      {nivel === "atrasada" && " · atrasada"}
                    </span>
                  )}
                  {t.responsavel && <span className="truncate">{t.responsavel}</span>}
                </div>
              </div>
            </div>
            {concluindoId === t.id && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-linha pt-2">
                <input
                  autoFocus
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void concluir(t.id);
                    if (e.key === "Escape") setConcluindoId(null);
                  }}
                  placeholder="Resultado (ex.: falou com a filha)…"
                  className="min-w-0 flex-1 rounded-md border border-linha-forte bg-branco px-2 py-1 text-[0.78rem] outline-none focus:border-laranja"
                />
                <button
                  type="button"
                  onClick={() => void concluir(t.id)}
                  disabled={ocupado}
                  className="shrink-0 rounded-md bg-laranja px-2.5 py-1 text-[0.72rem] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
                >
                  Concluir
                </button>
              </div>
            )}
          </div>
        );
      })}

      {concluidas.map((t) => (
        <div key={t.id} className="flex items-start gap-2.5 rounded-[9px] border border-linha bg-board px-3 py-2">
          <span className="mt-0.5 grid h-[17px] w-[17px] shrink-0 place-items-center rounded-md border-2 border-verde bg-verde">
            <svg viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" className="h-2.5 w-2.5 stroke-branco" fill="none">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.8rem] leading-snug text-mute line-through">{t.titulo}</div>
            {t.resultado && <div className="mt-0.5 text-[0.72rem] text-suave">→ {t.resultado}</div>}
          </div>
        </div>
      ))}

      {criando ? (
        <div className="rounded-[9px] border-[1.5px] border-borda-forte bg-branco px-3 py-2.5">
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void criar();
              if (e.key === "Escape") setCriando(false);
            }}
            placeholder="Descreva a tarefa…"
            className="w-full bg-transparent text-[0.84rem] outline-none placeholder:text-mute"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              title="Prazo (opcional)"
              className="min-w-0 flex-1 rounded-md border border-linha bg-branco px-1.5 py-1 text-[0.72rem] text-suave outline-none focus:border-laranja"
            />
            <button
              type="button"
              onClick={() => void criar()}
              disabled={ocupado || !titulo.trim()}
              className="shrink-0 rounded-md bg-laranja px-2.5 py-1 text-[0.72rem] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
            >
              Criar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="flex w-full items-center gap-2 rounded-[9px] border-[1.5px] border-dashed border-borda-forte px-3 py-2 text-[0.8rem] font-medium text-mute hover:border-laranja hover:text-laranja-esc"
        >
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5 stroke-current" fill="none">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nova tarefa
        </button>
      )}
      {erro && <p className="text-[0.72rem] font-semibold text-vermelho">{erro}</p>}
    </div>
  );
}

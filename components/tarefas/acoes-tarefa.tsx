"use client";

import { useState } from "react";
import {
  arquivarTarefaLead,
  reatribuirTarefaLead,
  repactuarPrazoTarefaLead,
} from "@/app/(app)/lead/actions";
import { paraDatetimeLocal } from "@/lib/dados/tarefa-calculos";
import { cn } from "@/lib/utils";

/*
 * AÇÕES DE CICLO DE VIDA da tarefa (Rodada 14) — reatribuir · repactuar prazo · arquivar.
 * Painel inline (mesmo padrão do concluir-com-resultado), usado no drawer do lead e na
 * /tarefas. Só aparece em tarefa PENDENTE — em concluída/arquivada a porta recusaria (55000),
 * então a UI nem oferece.
 *
 * Motivo obrigatório em repactuar e arquivar é regra do DOMÍNIO (check_violation na porta,
 * Bloco A): o botão não submete com motivo em branco, e o banco recusa de novo se alguém
 * burlar a UI. Adiar é permitido e registrado — §10.1: adiar vira registro, não silêncio.
 */

export interface PessoaAtiva {
  id: string;
  nome: string;
}

type Modo = "reatribuir" | "repactuar" | "arquivar";

export function AcoesTarefa({
  leadId,
  tarefaId,
  prazoAtual,
  responsavelAtualId,
  pessoas,
  aoSucesso,
  onFechar,
}: {
  leadId: string | null;
  tarefaId: string;
  prazoAtual: string | null;
  responsavelAtualId: string | null;
  /** membros ATIVOS de core.v_membro — revogado não recebe tarefa (a porta recusa). */
  pessoas: PessoaAtiva[];
  aoSucesso: () => void;
  onFechar: () => void;
}) {
  const [modo, setModo] = useState<Modo | null>(null);
  const [responsavelId, setResponsavelId] = useState("");
  const [prazo, setPrazo] = useState(prazoAtual ? paraDatetimeLocal(prazoAtual) : "");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const outros = pessoas.filter((p) => p.id !== responsavelAtualId);

  function abrirModo(m: Modo) {
    setModo(m);
    setErro(null);
    setMotivo("");
    setResponsavelId("");
    setPrazo(prazoAtual ? paraDatetimeLocal(prazoAtual) : "");
  }

  async function executar() {
    if (ocupado || !modo) return;
    setOcupado(true);
    setErro(null);
    const r =
      modo === "reatribuir"
        ? await reatribuirTarefaLead(leadId, tarefaId, responsavelId)
        : modo === "repactuar"
          ? await repactuarPrazoTarefaLead(
              leadId,
              tarefaId,
              prazo ? new Date(prazo).toISOString() : "",
              motivo,
            )
          : await arquivarTarefaLead(leadId, tarefaId, motivo);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível registrar");
      return;
    }
    onFechar();
    aoSucesso();
  }

  const podeExecutar =
    modo === "reatribuir"
      ? responsavelId !== ""
      : modo === "repactuar"
        ? prazo !== "" && motivo.trim() !== ""
        : motivo.trim() !== "";

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && podeExecutar) void executar();
    if (e.key === "Escape") onFechar();
  };

  return (
    <div
      className="mt-2 border-t border-linha pt-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onFechar();
      }}
    >
      {/* escolha da ação */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["reatribuir", "Reatribuir"],
            ["repactuar", "Repactuar prazo"],
            ["arquivar", "Arquivar"],
          ] as [Modo, string][]
        ).map(([m, rotulo]) => (
          <button
            key={m}
            type="button"
            onClick={() => abrirModo(m)}
            aria-pressed={modo === m}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
              modo === m
                ? "border-navy bg-[#EAECF5] font-semibold text-navy"
                : "border-linha bg-branco text-suave hover:bg-hover hover:text-tinta",
            )}
          >
            {rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={onFechar}
          className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
        >
          Fechar
        </button>
      </div>

      {modo === "reatribuir" && (
        <div className="mt-2 flex items-center gap-1.5">
          <select
            autoFocus
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
            onKeyDown={teclas}
            aria-label="Novo responsável"
            className={cn(
              "min-w-0 flex-1 cursor-pointer rounded-md border border-linha bg-branco px-1.5 py-1 text-[12.5px] outline-none focus:border-laranja",
              responsavelId ? "text-tinta" : "text-mute",
            )}
          >
            <option value="">Passar a tarefa para…</option>
            {outros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <BotaoConfirmar rotulo="Reatribuir" habilitado={podeExecutar && !ocupado} onClick={executar} />
        </div>
      )}

      {modo === "repactuar" && (
        <div className="mt-2 flex flex-col gap-1.5">
          <input
            autoFocus
            type="datetime-local"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            onKeyDown={teclas}
            aria-label="Novo prazo (data e hora)"
            className="w-full rounded-md border border-linha bg-branco px-1.5 py-1 font-mono text-[12px] text-suave outline-none focus:border-laranja"
          />
          <div className="flex items-center gap-1.5">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={teclas}
              placeholder="Motivo — por que o prazo mudou? (obrigatório)"
              aria-label="Motivo da repactuação (obrigatório)"
              className="min-w-0 flex-1 rounded-md border border-linha-forte bg-branco px-2 py-1 text-[12.5px] outline-none focus:border-laranja"
            />
            <BotaoConfirmar rotulo="Repactuar" habilitado={podeExecutar && !ocupado} onClick={executar} />
          </div>
        </div>
      )}

      {modo === "arquivar" && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={teclas}
            placeholder="Motivo — por que sai da fila? (obrigatório)"
            aria-label="Motivo do arquivamento (obrigatório)"
            className="min-w-0 flex-1 rounded-md border border-linha-forte bg-branco px-2 py-1 text-[12.5px] outline-none focus:border-laranja"
          />
          <BotaoConfirmar rotulo="Arquivar" habilitado={podeExecutar && !ocupado} onClick={executar} />
        </div>
      )}

      {erro && <p className="mt-1.5 text-[11.5px] font-semibold text-vermelho">{erro}</p>}
    </div>
  );
}

function BotaoConfirmar({
  rotulo,
  habilitado,
  onClick,
}: {
  rotulo: string;
  habilitado: boolean;
  onClick: () => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={!habilitado}
      className="shrink-0 rounded-md bg-laranja px-2.5 py-1 text-[12px] font-semibold text-branco transition-colors hover:bg-laranja-esc disabled:opacity-50"
    >
      {rotulo}
    </button>
  );
}

/** O gatilho `⋯` — mesmo desenho nos dois lugares (drawer e /tarefas). */
export function BotaoAcoes({
  aberto,
  onToggle,
}: {
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      aria-label="Ações da tarefa"
      aria-expanded={aberto}
      className={cn(
        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-suave transition-colors hover:bg-hover hover:text-tinta",
        aberto && "bg-hover text-tinta",
      )}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]" aria-hidden>
        <circle cx="5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="19" cy="12" r="1.7" />
      </svg>
    </button>
  );
}

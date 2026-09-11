"use client";

import { useState } from "react";
import {
  arquivarTarefaLead,
  reatribuirTarefaLead,
  repactuarPrazoTarefaLead,
} from "@/app/(app)/lead/actions";
import { paraDatetimeLocal } from "@/lib/dados/tarefa-calculos";
import { presetsAdiar } from "@/lib/tarefas/adiar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AcoesDaTarefa } from "./executor";

/*
 * AÇÕES DE CICLO DE VIDA da tarefa (Rodada 14) — reatribuir · repactuar prazo · arquivar.
 * Painel inline (mesmo padrão do concluir-com-resultado), usado no drawer do lead e na
 * /tarefas. Só aparece em tarefa PENDENTE — em concluída/arquivada a porta recusaria (55000),
 * então a UI nem oferece.
 *
 * Motivo obrigatório em repactuar e arquivar é regra do DOMÍNIO (check_violation na porta,
 * Bloco A): o botão não submete com motivo em branco, e o banco recusa de novo se alguém
 * burlar a UI. Adiar é permitido e registrado — §10.1: adiar vira registro, não silêncio.
 *
 * W-D5 (10/09) · ADIAR EM UM CLIQUE (benchmark §4 item 6). O painel abre já com os três presets
 * — Amanhã · Em 3 dias · Próxima segunda (lib/tarefas/adiar.ts) — e clicar num deles EMITE na
 * hora o `tarefa_prazo_repactuado` com `motivo` = o preset. A regra do domínio não afrouxou: o
 * motivo continua indo no payload e continua obrigatório; só deixou de ser digitado. "Outra
 * data…" é o caminho antigo (data + hora + motivo), que fica para o caso que os presets não
 * cobrem. O `executor` opcional (executor.ts) é o que deixa o ensaio sem banco usar o mesmo
 * painel com estado local.
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
  executor,
  agora,
  modoInicial = null,
  semPresets = false,
}: {
  leadId: string | null;
  tarefaId: string;
  prazoAtual: string | null;
  responsavelAtualId: string | null;
  /** membros ATIVOS de core.v_membro — revogado não recebe tarefa (a porta recusa). */
  pessoas: PessoaAtiva[];
  aoSucesso: () => void;
  onFechar: () => void;
  /** W-D5 · quem escreve. Ausente = as server actions de sempre. */
  executor?: AcoesDaTarefa;
  /** W-D5 · relógio para os presets de adiar; ausente = `Date.now()` */
  agora?: number;
  /** v2 · abre já num modo (a lista chega por menu, não por "escolha a ação") */
  modoInicial?: Modo | null;
  /** v2 · a lista já oferece os presets no menu Adiar — aqui só o formulário pedido */
  semPresets?: boolean;
}) {
  const [modo, setModo] = useState<Modo | null>(modoInicial);
  const [responsavelId, setResponsavelId] = useState("");
  const [prazo, setPrazo] = useState(prazoAtual ? paraDatetimeLocal(prazoAtual) : "");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const outros = pessoas.filter((p) => p.id !== responsavelAtualId);
  const presets = presetsAdiar(agora ?? Date.now());

  const adiar = executor?.adiar ?? ((prazoIso: string, m: string) => repactuarPrazoTarefaLead(leadId, tarefaId, prazoIso, m));
  const reatribuir = executor?.reatribuir ?? ((id: string) => reatribuirTarefaLead(leadId, tarefaId, id));
  const arquivar = executor?.arquivar ?? ((m: string) => arquivarTarefaLead(leadId, tarefaId, m));

  /** um clique: o preset é o prazo E o motivo */
  async function adiarPreset(prazoIso: string, motivoPreset: string) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await adiar(prazoIso, motivoPreset);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível adiar");
      return;
    }
    onFechar();
    aoSucesso();
  }

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
        ? await reatribuir(responsavelId)
        : modo === "repactuar"
          ? await adiar(prazo ? new Date(prazo).toISOString() : "", motivo)
          : await arquivar(motivo);
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
      {/* ADIAR EM UM CLIQUE — a primeira linha do painel são os presets, porque adiar é a ação
          mais frequente da fila (Close: snooze em lote; Kommo: "In an hour, Today, Tomorrow"). */}
      {!semPresets && (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] text-mute">Adiar para</span>
        {presets.map((p) => (
          <button
            key={p.chave}
            type="button"
            disabled={ocupado}
            onClick={() => void adiarPreset(p.prazoIso, p.motivo)}
            title={`${p.motivo} · 09:00`}
            className="rounded-full border border-linha bg-branco px-2.5 py-1 text-[12px] font-medium text-tinta transition-colors hover:border-navy hover:bg-[#EAECF5] hover:text-navy disabled:opacity-50"
          >
            {p.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => abrirModo("repactuar")}
          aria-pressed={modo === "repactuar"}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
            modo === "repactuar"
              ? "border-navy bg-[#EAECF5] font-semibold text-navy"
              : "border-linha bg-branco text-suave hover:bg-hover hover:text-tinta",
          )}
        >
          Outra data…
        </button>
        <button
          type="button"
          onClick={onFechar}
          className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
        >
          Fechar
        </button>
      </div>
      )}

      {/* as outras duas ações de ciclo de vida */}
      {!semPresets && (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["reatribuir", "Reatribuir"],
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
      </div>
      )}
      {semPresets && (
        <div className="flex items-center gap-1.5 text-[12.5px] text-suave">
          <span className="font-medium text-tinta">
            {modo === "reatribuir" ? "Passar a tarefa para outra pessoa" : modo === "repactuar" ? "Adiar para outra data" : "Tirar da fila"}
          </span>
          <button
            type="button"
            onClick={onFechar}
            className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
          >
            Fechar
          </button>
        </div>
      )}

      {modo === "reatribuir" && (
        <div className="mt-2 flex items-center gap-1.5">
          <Select
            items={Object.fromEntries(outros.map((p) => [p.id, p.nome]))}
            value={responsavelId || null}
            onValueChange={(v) => setResponsavelId((v as string | null) ?? "")}
          >
            <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Novo responsável">
              <SelectValue placeholder="Passar a tarefa para…" />
            </SelectTrigger>
            <SelectContent>
              {outros.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <BotaoConfirmar rotulo="Adiar" habilitado={podeExecutar && !ocupado} onClick={executar} />
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnotacaoLead, MencaoLead } from "@/lib/dados/lead-painel";
import {
  aplicarMencao,
  avisoSemAcesso,
  gatilhoMencao,
  mencoesVivas,
  segmentosComMencao,
  separarMencionaveis,
  type Mencionavel,
  type MencaoResolvida,
  type TipoMencionavel,
} from "@/lib/conversas/mencao";
import { criarAnotacaoLead, marcarMencaoLida } from "@/app/(app)/lead/actions";
import { dataHoraCurta, iniciaisDe } from "@/lib/dados/tarefa-calculos";
import { cn } from "@/lib/utils";

/*
 * NOTAS do lead — projeção core.anotacao (R8, remodelada na R13 / Bloco C).
 * Mockup: Design/tarefas-lead-v3.html (bloco "Notas").
 *
 * Rodada 13 acrescenta:
 *  · menção `@` resolvida para uuid na escrita, com humanos e agentes separados (C4/C5);
 *  · aviso efêmero e só pro autor quando o mencionado não tem acesso — a nota vai assim
 *    mesmo (C8, padrão Slack);
 *  · acuse de leitura da menção, o "olhinhos" do Notion: quem foi mencionado e abriu o
 *    painel emite `mencao_lida`, e o autor passa a ver "visto" (C7).
 */

export function AnotacoesLead({
  leadId,
  anotacoes,
  mencoes,
  mencionaveis,
  meuId,
  autorEmail,
  aoAtualizar,
}: {
  leadId: string;
  anotacoes: AnotacaoLead[];
  mencoes: MencaoLead[];
  mencionaveis: Mencionavel[];
  meuId: string | null;
  autorEmail: string | null;
  aoAtualizar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [resolvidas, setResolvidas] = useState<MencaoResolvida[]>([]);
  const [gatilho, setGatilho] = useState<{ inicio: number; termo: string } | null>(null);
  const [iAlvo, setIAlvo] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const porId = useMemo(() => new Map(mencionaveis.map((m) => [m.id, m])), [mencionaveis]);
  const lista = useMemo(
    () => (gatilho ? separarMencionaveis(mencionaveis, gatilho.termo) : null),
    [gatilho, mencionaveis],
  );
  const alvos = useMemo(() => (lista ? [...lista.humanos, ...lista.agentes] : []), [lista]);
  useEffect(() => setIAlvo(0), [gatilho?.termo]);

  // menções por nota, para destaque na leitura e para o acuse de recebimento
  const mencoesPorNota = useMemo(() => {
    const mapa = new Map<string, MencaoLead[]>();
    for (const m of mencoes) {
      if (m.origem_tipo !== "nota") continue;
      const l = mapa.get(m.origem_id) ?? [];
      l.push(m);
      mapa.set(m.origem_id, l);
    }
    return mapa;
  }, [mencoes]);

  /**
   * C7 — o acuse. Quem foi mencionado e está vendo a nota marca visto uma vez. Best-effort:
   * falhar aqui não pode virar erro pra ninguém, e a projeção do Bloco B é quem consolida.
   */
  const jaMarcadas = useRef(new Set<string>());
  useEffect(() => {
    if (!meuId) return;
    for (const m of mencoes) {
      if (m.mencionado_id !== meuId || m.lida_em || jaMarcadas.current.has(m.id)) continue;
      jaMarcadas.current.add(m.id);
      void marcarMencaoLida(m.id);
    }
  }, [mencoes, meuId]);

  function escolher(alvo: Mencionavel) {
    if (!gatilho) return;
    const caret = campoRef.current?.selectionStart ?? texto.length;
    const r = aplicarMencao(texto, caret, gatilho, alvo);
    setTexto(r.texto);
    setResolvidas((m) => [...m, r.mencao]);
    setGatilho(null);
    requestAnimationFrame(() => {
      campoRef.current?.focus();
      campoRef.current?.setSelectionRange(r.caret, r.caret);
    });
  }

  async function criar() {
    if (!texto.trim() || ocupado) return;
    const vivas = mencoesVivas(texto, resolvidas);
    setOcupado(true);
    setErro(null);
    const r = await criarAnotacaoLead(leadId, {
      texto,
      tipo: "interna",
      autorId: meuId,
      autorEmail,
      mencoes: vivas,
    });
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "erro ao salvar");
      return;
    }
    setTexto("");
    setResolvidas([]);
    setAviso(avisoSemAcesso(vivas));
    aoAtualizar();
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (gatilho && alvos.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIAlvo((i) => (i + (e.key === "ArrowDown" ? 1 : alvos.length - 1)) % alvos.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        escolher(alvos[iAlvo] ?? alvos[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setGatilho(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void criar();
    }
  }

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">Notas</h3>
        {anotacoes.length > 0 && (
          <span className="font-mono text-[10.5px] tabular-nums text-mute">{anotacoes.length}</span>
        )}
      </div>

      {anotacoes.length === 0 && (
        <p className="px-1 pb-1.5 pt-[22px] text-[13px] leading-normal text-suave">
          Nenhuma nota. Digite{" "}
          <code className="rounded border border-linha bg-board px-1.5 py-px font-mono text-[12.5px] text-tinta">
            /nota
          </code>{" "}
          para registrar algo que só a equipe vê.
        </p>
      )}

      {anotacoes.map((n) => {
        const daNota = mencoesPorNota.get(n.id) ?? [];
        const rotulos = daNota
          .map((m) => porId.get(m.mencionado_id))
          .filter((a): a is Mencionavel => !!a)
          .map((a) => ({ rotulo: `@${a.nome}`, tipo: a.tipo as TipoMencionavel }));
        const vistas = daNota.filter((m) => m.lida_em);
        const souAutor = !!meuId && n.autor_id === meuId;
        return (
          <article
            key={n.id}
            className="mb-2 rounded-lg border border-nota-linha border-l-2 border-l-amarelo bg-nota-fundo px-3 py-2.5 last:mb-0"
          >
            <header className="mb-1 flex items-center gap-2">
              <span className="truncate text-[11.5px] font-semibold text-tinta">
                {nomeDoAutor(n, porId)}
              </span>
              <time
                dateTime={n.criado_em}
                className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-suave"
              >
                {dataHoraCurta(n.criado_em)}
              </time>
            </header>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-tinta">
              {segmentosComMencao(n.texto, rotulos).map((s, i) =>
                s.tipo === "mencao" ? (
                  <span
                    key={i}
                    className={cn(
                      "rounded px-[3px] font-medium",
                      s.alvo === "agente"
                        ? "bg-laranja-cl font-mono text-[12px] text-laranja-esc"
                        : "bg-bolha-out text-navy",
                    )}
                  >
                    {s.texto}
                  </span>
                ) : (
                  <span key={i}>{s.texto}</span>
                ),
              )}
            </p>
            {/* C7 — o autor vê quem já viu a menção; quem não é autor não precisa desse ruído */}
            {souAutor && vistas.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-suave">
                <svg viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 stroke-current" fill="none">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                Visto por {vistas.map((m) => porId.get(m.mencionado_id)?.nome ?? "alguém").join(", ")}
              </p>
            )}
          </article>
        );
      })}

      {/* escrever */}
      <div className="relative mt-2">
        {lista && alvos.length > 0 && (
          <div
            role="listbox"
            aria-label="Mencionar"
            className="absolute bottom-full left-0 z-30 mb-2 w-full rounded-lg border border-linha bg-branco p-[5px] shadow-forte"
          >
            {lista.humanos.length > 0 && <Cabecalho>Pessoas</Cabecalho>}
            {lista.humanos.map((m, i) => (
              <Opcao key={m.id} alvo={m} sel={i === iAlvo} aoEntrar={() => setIAlvo(i)} aoEscolher={() => escolher(m)} />
            ))}
            {lista.agentes.length > 0 && <Cabecalho>Agentes</Cabecalho>}
            {lista.agentes.map((m, i) => {
              const idx = lista.humanos.length + i;
              return (
                <Opcao key={m.id} alvo={m} sel={idx === iAlvo} aoEntrar={() => setIAlvo(idx)} aoEscolher={() => escolher(m)} />
              );
            })}
            {lista.agentes.length > 0 && (
              <p className="mt-1 border-t border-linha px-2.5 pb-[5px] pt-[7px] text-[11px] leading-snug text-mute">
                Agentes ainda não respondem a menções — a menção fica registrada.
              </p>
            )}
          </div>
        )}

        <div className="flex items-end gap-1.5 rounded-[9px] border-[1.5px] border-borda-forte bg-branco py-1.5 pl-2.5 pr-1.5 focus-within:border-foco-comp">
          <textarea
            ref={campoRef}
            rows={1}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setGatilho(gatilhoMencao(e.target.value, e.target.selectionStart ?? e.target.value.length));
            }}
            onKeyDown={aoTeclar}
            placeholder="Nota para a equipe — @ avisa alguém"
            aria-label="Nova nota interna"
            className="max-h-24 min-w-0 flex-1 resize-none bg-transparent py-1 text-[0.8rem] outline-none placeholder:text-mute"
          />
          <button
            type="button"
            onClick={() => void criar()}
            disabled={ocupado || !texto.trim()}
            title="Salvar nota"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-laranja text-branco transition-colors hover:bg-laranja-esc disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>

      {/* C8 — efêmero e só pro autor: a nota já foi salva */}
      {aviso && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amarelo-bd bg-amarelo-bg px-2 py-1.5 text-[11.5px] leading-snug text-tinta">
          <span className="flex-1">{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="shrink-0 font-semibold text-suave hover:text-tinta"
          >
            Ok
          </button>
        </p>
      )}
      {erro && <p className="mt-1.5 text-[11.5px] font-semibold text-vermelho">{erro}</p>}
    </div>
  );
}

function nomeDoAutor(n: AnotacaoLead, porId: Map<string, Mencionavel>): string {
  if (n.autor_id) return porId.get(n.autor_id)?.nome ?? "equipe";
  const bruto = (n.autor ?? "").trim();
  if (!bruto || /^(humano:|agente:|sistema$)/i.test(bruto)) return "equipe";
  return bruto.includes("@") ? bruto.split("@")[0] : bruto;
}

function Cabecalho({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-[5px] pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
      {children}
    </div>
  );
}

function Opcao({
  alvo,
  sel,
  aoEntrar,
  aoEscolher,
}: {
  alvo: Mencionavel;
  sel: boolean;
  aoEntrar: () => void;
  aoEscolher: () => void;
}) {
  const agente = alvo.tipo === "agente";
  return (
    <button
      type="button"
      role="option"
      aria-selected={sel}
      onMouseEnter={aoEntrar}
      onClick={aoEscolher}
      className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left", sel && "bg-hover")}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center text-[10px] font-semibold",
          agente
            ? "rounded-md border border-[#F4C7AC] bg-laranja-cl font-mono text-[11px] text-laranja-esc"
            : "rounded-full bg-navy text-branco",
        )}
      >
        {iniciaisDe(alvo.nome)}
      </span>
      <span className={cn("truncate text-[13px] font-medium", agente ? "text-suave" : "text-tinta")}>
        {alvo.nome}
      </span>
      {agente && (
        <span className="shrink-0 rounded-full border border-linha px-1.5 py-px font-mono text-[10px] text-mute">
          em breve
        </span>
      )}
      {!agente && !alvo.ativo && (
        <span className="shrink-0 rounded-full border border-linha px-1.5 py-px font-mono text-[10px] text-mute">
          sem acesso
        </span>
      )}
      {alvo.papel && <span className="ml-auto shrink-0 text-[11.5px] text-suave">{alvo.papel}</span>}
    </button>
  );
}

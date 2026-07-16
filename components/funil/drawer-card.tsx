"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardLead, EtapaFunil, Origem } from "@/lib/dados/funil";
import {
  detalheMock,
  type Anotacao,
  type Tarefa,
  type TipoAnexo,
  type TipoEvento,
  type TipoResp,
} from "@/lib/dados/lead-detalhe";
import { registrarEventoUI } from "@/app/(app)/funil/actions";
import { cn } from "@/lib/utils";

const RESP_COR: Record<TipoResp, string> = { dm: "bg-navy", sara: "bg-roxo", fono: "bg-verde" };
const ORIGEM_TXT: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };
const ANEXO_COR: Record<TipoAnexo, string> = { pdf: "bg-vermelho", img: "bg-roxo", aud: "bg-verde" };
const EV_COR: Record<TipoEvento, string> = {
  in: "bg-laranja",
  out: "bg-navy",
  prop: "bg-azul",
  appr: "bg-verde",
  stage: "bg-amarelo",
};

function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}
function moeda(v: number | null): string {
  return v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function faixaCor(faixa: string): string {
  if (faixa === "A" || faixa === "B") return "bg-verde";
  if (faixa === "C") return "bg-amarelo";
  return "bg-vermelho";
}

type Aba = "tarefas" | "notas" | "anexos" | "hist";

export function DrawerCard({
  lead,
  etapa,
  fonte,
  onFechar,
}: {
  lead: CardLead | null;
  etapa: EtapaFunil | null;
  fonte: "real" | "mock";
  onFechar: () => void;
}) {
  const router = useRouter();
  const aberto = !!lead;
  const detalhe = useMemo(() => (lead ? detalheMock(lead) : null), [lead]);

  const [aba, setAba] = useState<Aba>("tarefas");
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [novaNota, setNovaNota] = useState("");
  const [novaTarefa, setNovaTarefa] = useState("");
  const [addTarefa, setAddTarefa] = useState(false);
  const [levindoStatus, setLevindoStatus] = useState<"pendente" | "aprovada" | "rejeitada">("pendente");
  const [toast, setToast] = useState<string | null>(null);

  // (re)sincroniza estado local quando abre outro card
  const leadId = lead?.lead_id;
  useEffect(() => {
    if (detalhe) {
      setTarefas(detalhe.tarefas);
      setAnotacoes(detalhe.anotacoes);
      setNovaNota("");
      setNovaTarefa("");
      setAddTarefa(false);
      setAba("tarefas");
      setLevindoStatus("pendente");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function avisar(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function emitir(tipo: string, payload: Record<string, unknown>) {
    if (fonte === "real" && leadId) void registrarEventoUI(tipo, { lead_id: leadId, ...payload }, leadId);
  }

  function toggleTarefa(id: string) {
    setTarefas((prev) =>
      prev.map((t) => (t.id === id ? { ...t, concluida: !t.concluida } : t)),
    );
    const t = tarefas.find((x) => x.id === id);
    if (t && !t.concluida) emitir("tarefa_concluida", { titulo: t.titulo, resultado: "concluída" });
  }

  function criarTarefa() {
    const titulo = novaTarefa.trim();
    if (!titulo) return;
    const t: Tarefa = {
      id: `t-${titulo.length}-${tarefas.length}`,
      titulo,
      prazo: null,
      responsavel: lead?.responsavel ?? { tipo: "dm", nome: "Diogo ME" },
      concluida: false,
    };
    setTarefas((prev) => [t, ...prev]);
    setNovaTarefa("");
    setAddTarefa(false);
    emitir("tarefa_criada", { titulo, responsavel: t.responsavel.nome });
    avisar("Tarefa criada — nasce como evento no ledger.");
  }

  function criarNota() {
    const texto = novaNota.trim();
    if (!texto) return;
    const n: Anotacao = {
      id: `n-${anotacoes.length}`,
      autor: "Você",
      autorTipo: "dm",
      quando: "agora",
      texto,
    };
    setAnotacoes((prev) => [n, ...prev]);
    setNovaNota("");
    emitir("anotacao_adicionada", { autor: "humano", texto });
    avisar("Anotação registrada no ledger.");
  }

  function validarLevindo(decisao: "aprovada" | "rejeitada") {
    setLevindoStatus(decisao);
    avisar(
      decisao === "aprovada"
        ? "Condições de crédito aprovadas (HITL)."
        : "Análise do Levindo rejeitada.",
    );
  }

  return (
    <>
      <div
        onClick={onFechar}
        className={cn(
          "fixed inset-0 z-40 bg-navy/25 backdrop-blur-[1.5px] transition-opacity",
          aberto ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[472px] max-w-[96vw] flex-col bg-creme shadow-[-18px_0_50px_rgba(37,47,99,0.18)] transition-transform",
          aberto ? "translate-x-0" : "translate-x-full",
        )}
      >
        {lead && detalhe && (
          <>
            {/* header */}
            <div className="flex-shrink-0 border-b border-borda bg-branco px-5 pt-4">
              <div className="mb-4 flex items-center gap-2.5">
                {etapa && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                    style={{ color: etapa.cor, borderColor: etapa.cor + "55", background: etapa.cor + "18" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: etapa.cor }} />
                    {etapa.nome}
                  </span>
                )}
                <span className="flex-1" />
                <button
                  onClick={() => router.push(`/conversas?lead=${lead.lead_id}`)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-laranja-cl px-3 py-1.5 text-xs font-semibold text-laranja-esc hover:bg-pessego"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} className="h-3.5 w-3.5 stroke-current" fill="none">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Abrir conversa
                </button>
                <button
                  onClick={onFechar}
                  className="grid h-8 w-8 place-items-center rounded-md bg-creme text-suave hover:bg-borda hover:text-navy"
                  aria-label="Fechar"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} className="h-4 w-4 stroke-current" fill="none">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-3.5 pb-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3a4788] to-[#252F63] text-xl font-bold text-branco shadow-[0_4px_13px_rgba(37,47,99,0.25)]">
                  {iniciais(lead.nome ?? "Lead")}
                </span>
                <div className="min-w-0">
                  <div className="font-serif text-2xl font-semibold leading-tight text-navy">
                    {lead.nome ?? "Lead sem nome"}
                  </div>
                  <div className="mt-1 text-sm text-suave">
                    {lead.idade != null && `${lead.idade} anos · `}paciente
                    {detalhe.cidade && <span className="text-mute"> · {detalhe.cidade}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* facts */}
            <div className="grid flex-shrink-0 grid-cols-2 gap-px border-b border-borda bg-borda">
              <Fato rotulo="Telefone">
                {lead.origem === "wa" && <span className="h-2 w-2 rounded-full bg-verde" />}
                {lead.telefone ?? "—"}
              </Fato>
              <Fato rotulo="Origem">{lead.origem ? ORIGEM_TXT[lead.origem] : "—"}</Fato>
              <Fato rotulo="Responsável">{lead.responsavel?.nome ?? "—"}</Fato>
              <Fato rotulo="Valor estimado">{moeda(lead.valor)}</Fato>
            </div>

            {/* body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
              {/* Levindo */}
              {detalhe.levindo && (
                <div className="mb-5 overflow-hidden rounded-lg border border-azul-bd bg-branco shadow-suave">
                  <div className="flex items-center gap-3 border-b border-borda px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-branco">
                      L
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-navy">Levindo · análise de crédito</div>
                      <div className="text-xs text-mute">Política Comercial v3 · rodado há {detalhe.levindo.rodadoHa}</div>
                    </div>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md font-serif text-lg font-bold text-branco", faixaCor(detalhe.levindo.faixa))}>
                      {detalhe.levindo.faixa}
                    </span>
                  </div>
                  <div className="px-4 py-3.5">
                    <p className="mb-3 text-sm leading-relaxed text-texto" dangerouslySetInnerHTML={{ __html: detalhe.levindo.diagnostico }} />
                    <div className="mb-3.5 flex flex-col gap-2">
                      {detalhe.levindo.condicoes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-sm text-texto">
                          <span className={cn("grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full", c.ok ? "bg-verde-bg" : "bg-vermelho-bg")}>
                            <svg viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" className={cn("h-2.5 w-2.5", c.ok ? "stroke-verde" : "stroke-vermelho")} fill="none">
                              {c.ok ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
                            </svg>
                          </span>
                          <span dangerouslySetInnerHTML={{ __html: c.texto }} />
                        </div>
                      ))}
                    </div>
                    {levindoStatus === "pendente" ? (
                      <div className="flex items-center gap-2.5 border-t border-borda pt-3">
                        <button
                          onClick={() => validarLevindo("aprovada")}
                          className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-4 py-2 text-sm font-semibold text-branco shadow-laranja hover:bg-laranja-esc"
                        >
                          <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4 stroke-current" fill="none">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          Aprovar condições
                        </button>
                        <button
                          onClick={() => validarLevindo("rejeitada")}
                          className="rounded-md border-[1.5px] border-borda-forte bg-branco px-4 py-2 text-sm font-semibold text-suave hover:bg-creme hover:text-navy"
                        >
                          Rejeitar
                        </button>
                        <span className="ml-auto text-xs text-mute">
                          valida <b className="text-suave">{detalhe.levindo.validador}</b>
                        </span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "rounded-md border-t px-3 py-2.5 text-sm font-semibold",
                          levindoStatus === "aprovada" ? "bg-verde-bg text-verde" : "bg-vermelho-bg text-vermelho",
                        )}
                      >
                        {levindoStatus === "aprovada"
                          ? `✓ Condições aprovadas por ${detalhe.levindo.validador}`
                          : `✕ Análise rejeitada por ${detalhe.levindo.validador}`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* tabs */}
              <div className="mb-4 flex gap-1 border-b-[1.5px] border-borda">
                <AbaBtn ativa={aba === "tarefas"} onClick={() => setAba("tarefas")} rotulo="Tarefas" cnt={tarefas.length} />
                <AbaBtn ativa={aba === "notas"} onClick={() => setAba("notas")} rotulo="Anotações" cnt={anotacoes.length} />
                <AbaBtn ativa={aba === "anexos"} onClick={() => setAba("anexos")} rotulo="Anexos" cnt={detalhe.anexos.length} />
                <AbaBtn ativa={aba === "hist"} onClick={() => setAba("hist")} rotulo="Histórico" />
              </div>

              {/* tarefas */}
              {aba === "tarefas" && (
                <div>
                  {tarefas.map((t) => (
                    <div key={t.id} className="mb-2 flex items-start gap-3 rounded-lg border border-borda bg-branco px-3.5 py-3 hover:border-borda-forte hover:shadow-suave">
                      <button
                        onClick={() => toggleTarefa(t.id)}
                        className={cn(
                          "mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md border-2",
                          t.concluida ? "border-verde bg-verde" : "border-borda-forte hover:border-laranja",
                        )}
                      >
                        <svg viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" className={cn("h-2.5 w-2.5 stroke-branco", t.concluida ? "opacity-100" : "opacity-0")} fill="none">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-sm font-medium leading-snug text-navy", t.concluida && "text-mute line-through")}>
                          {t.titulo}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-suave">
                          {t.prazo && (
                            <span className={cn("inline-flex items-center gap-1 font-semibold", t.prazoNivel === "late" ? "text-vermelho" : t.prazoNivel === "soon" ? "text-amarelo" : "")}>
                              {t.prazo}
                            </span>
                          )}
                          <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[0.58rem] font-bold text-branco", RESP_COR[t.responsavel.tipo])}>
                            {t.responsavel.tipo === "fono" ? "F" : iniciais(t.responsavel.nome)}
                          </span>
                          {t.responsavel.nome}
                        </div>
                      </div>
                    </div>
                  ))}
                  {addTarefa ? (
                    <div className="mt-1 flex items-center gap-2 rounded-lg border-[1.5px] border-borda-forte bg-branco px-3 py-2">
                      <input
                        autoFocus
                        value={novaTarefa}
                        onChange={(e) => setNovaTarefa(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && criarTarefa()}
                        placeholder="Descreva a tarefa…"
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-mute"
                      />
                      <button onClick={criarTarefa} className="rounded-md bg-laranja px-3 py-1.5 text-xs font-semibold text-branco hover:bg-laranja-esc">
                        Criar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddTarefa(true)}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg border-[1.5px] border-dashed border-borda-forte px-3.5 py-3 text-sm font-medium text-mute hover:border-laranja hover:text-laranja-esc"
                    >
                      <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 stroke-current" fill="none">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Nova tarefa
                    </button>
                  )}
                </div>
              )}

              {/* anotações */}
              {aba === "notas" && (
                <div>
                  {anotacoes.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        "mb-2.5 rounded-md border border-borda border-l-[3px] bg-branco px-3.5 py-3",
                        n.ia ? "border-l-azul-bd bg-gradient-to-b from-[#fbfcff] to-branco" : "border-l-laranja-cl",
                      )}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={cn("grid h-[22px] w-[22px] place-items-center rounded-full text-[0.6rem] font-bold text-branco", n.ia ? "bg-gradient-to-br from-[#F2803F] to-[#EC662E]" : RESP_COR[(n.autorTipo as TipoResp) ?? "dm"])}>
                          {n.ia ? "C" : iniciais(n.autor)}
                        </span>
                        <span className="text-xs font-semibold text-navy">{n.autor}</span>
                        <span className="ml-auto text-xs text-mute">{n.quando}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-texto" dangerouslySetInnerHTML={{ __html: n.texto }} />
                    </div>
                  ))}
                  <div className="mt-1 flex items-end gap-2 rounded-lg border-[1.5px] border-borda-forte bg-branco py-2 pl-3.5 pr-2">
                    <textarea
                      rows={1}
                      value={novaNota}
                      onChange={(e) => setNovaNota(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          criarNota();
                        }
                      }}
                      placeholder="Escrever anotação para a equipe…"
                      className="max-h-24 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-mute"
                    />
                    <button onClick={criarNota} className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-laranja text-branco hover:bg-laranja-esc">
                      <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
                        <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* anexos */}
              {aba === "anexos" && (
                <div>
                  {detalhe.anexos.map((a) => (
                    <div key={a.id} className="mb-2 flex items-center gap-3 rounded-lg border border-borda bg-branco px-3.5 py-3 hover:border-borda-forte hover:shadow-suave">
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md text-[0.64rem] font-bold text-branco", ANEXO_COR[a.tipo])}>
                        {a.tipo.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-navy">{a.nome}</div>
                        <div className="mt-0.5 text-xs text-mute">{a.meta}</div>
                      </div>
                    </div>
                  ))}
                  <button className="mt-1 flex w-full items-center gap-2 rounded-lg border-[1.5px] border-dashed border-borda-forte px-3.5 py-3 text-sm font-medium text-mute hover:border-laranja hover:text-laranja-esc">
                    <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 stroke-current" fill="none">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Anexar arquivo
                  </button>
                </div>
              )}

              {/* histórico */}
              {aba === "hist" && (
                <div className="pl-1.5">
                  {detalhe.historico.map((ev, i) => (
                    <div key={ev.id} className="relative ml-1.5 py-0.5 pb-3.5 pl-[18px]">
                      {i < detalhe.historico.length - 1 && (
                        <span className="absolute bottom-[-8px] left-0 top-1.5 w-0.5 bg-borda-forte" />
                      )}
                      <span className={cn("absolute left-[-4px] top-1 h-2.5 w-2.5 rounded-full border-2 border-creme", EV_COR[ev.tipo])} />
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-navy">{ev.titulo}</span>
                        <span className="ml-auto font-mono text-xs text-mute">{ev.quando}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-suave" dangerouslySetInnerHTML={{ __html: ev.corpo }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {toast && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-verde-bd bg-branco px-4 py-2.5 text-sm text-navy shadow-forte">
                {toast}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function Fato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-branco px-5 py-3">
      <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-mute">{rotulo}</div>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-navy">{children}</div>
    </div>
  );
}

function AbaBtn({ ativa, onClick, rotulo, cnt }: { ativa: boolean; onClick: () => void; rotulo: string; cnt?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold transition-colors",
        ativa ? "text-laranja-esc" : "text-suave hover:text-navy",
      )}
    >
      {rotulo}
      {cnt != null && (
        <span className={cn("rounded-full px-1.5 text-[0.68rem] font-bold", ativa ? "bg-laranja-cl text-laranja-esc" : "bg-borda text-suave")}>
          {cnt}
        </span>
      )}
      {ativa && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-laranja" />}
    </button>
  );
}

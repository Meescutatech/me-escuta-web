"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardLead, EtapaFunil, Origem, TipoResp } from "@/lib/dados/funil";
import { registrarEventoUI } from "@/app/(app)/funil/actions";
import { cn } from "@/lib/utils";

/*
 * Drawer do card — versão HONESTA (Rodada 7, D3): mostra só o que existe de verdade no card
 * (facts da v_lead_card) e o que o usuário criar NESTA sessão (tarefa/anotação viram eventos
 * reais no ledger pela porta). Sem detalhe sintetizado: nada de cidade, análise do Levindo,
 * anexos ou histórico inventados. Leitura real do histórico por lead (core.evento) e projeção
 * de tarefas/anotações são rodadas futuras (0009+).
 */

const RESP_COR: Record<TipoResp, string> = { dm: "bg-navy", sara: "bg-roxo", fono: "bg-verde" };
const ORIGEM_TXT: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

interface Tarefa {
  id: string;
  titulo: string;
  responsavel: { tipo: TipoResp; nome: string };
  concluida: boolean;
}

interface Anotacao {
  id: string;
  autor: string;
  autorTipo: TipoResp;
  texto: string;
  quando: string;
}

function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}
function moeda(v: number | null): string {
  return v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

type Aba = "tarefas" | "notas" | "hist";

export function DrawerCard({
  lead,
  etapa,
  onFechar,
}: {
  lead: CardLead | null;
  etapa: EtapaFunil | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const aberto = !!lead;

  const [aba, setAba] = useState<Aba>("tarefas");
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [novaNota, setNovaNota] = useState("");
  const [novaTarefa, setNovaTarefa] = useState("");
  const [addTarefa, setAddTarefa] = useState(false);
  const [levindoSolicitado, setLevindoSolicitado] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // (re)sincroniza estado local quando abre outro card
  const leadId = lead?.lead_id;
  useEffect(() => {
    setTarefas([]);
    setAnotacoes([]);
    setNovaNota("");
    setNovaTarefa("");
    setAddTarefa(false);
    setAba("tarefas");
    setLevindoSolicitado(false);
  }, [leadId]);

  function avisar(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function emitir(tipo: string, payload: Record<string, unknown>) {
    if (leadId) void registrarEventoUI(tipo, { lead_id: leadId, ...payload }, leadId);
  }

  function toggleTarefa(id: string) {
    const t = tarefas.find((x) => x.id === id);
    setTarefas((prev) => prev.map((x) => (x.id === id ? { ...x, concluida: !x.concluida } : x)));
    if (t && !t.concluida) emitir("tarefa_concluida", { titulo: t.titulo, resultado: "concluída" });
  }

  function criarTarefa() {
    const titulo = novaTarefa.trim();
    if (!titulo) return;
    const t: Tarefa = {
      id: `t-${titulo.length}-${tarefas.length}`,
      titulo,
      responsavel: lead?.responsavel ?? { tipo: "dm", nome: "Você" },
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

  function acionarLevindo() {
    setLevindoSolicitado(true);
    emitir("levindo_acionado", { motivo: "solicitado no card" });
    avisar("Solicitação registrada no ledger.");
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
        {lead && (
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
                  {lead.idade != null && <div className="mt-1 text-sm text-suave">{lead.idade} anos</div>}
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
              <Fato rotulo="Valor">{moeda(lead.valor)}</Fato>
            </div>

            {/* body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
              {/* Levindo — o pedido é um evento real; a análise chega como sugestão (rodada futura) */}
              {!levindoSolicitado ? (
                <button
                  onClick={acionarLevindo}
                  className="mb-5 flex w-full items-center gap-3 rounded-lg border border-azul-bd bg-branco px-4 py-3 text-left shadow-suave transition-colors hover:bg-azul-bg"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-branco">
                    L
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-navy">Acionar Levindo</div>
                    <div className="text-xs text-mute">Solicitar análise de crédito (Política Comercial v3)</div>
                  </div>
                  <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 stroke-laranja-esc" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              ) : (
                <div className="mb-5 flex items-center gap-3 rounded-lg border border-azul-bd bg-branco px-4 py-3 shadow-suave">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-branco">
                    L
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-navy">Análise solicitada</div>
                    <div className="text-xs text-mute">
                      Pedido registrado no ledger — o resultado chega como sugestão pra você validar.
                    </div>
                  </div>
                </div>
              )}

              {/* tabs */}
              <div className="mb-4 flex gap-1 border-b-[1.5px] border-borda">
                <AbaBtn ativa={aba === "tarefas"} onClick={() => setAba("tarefas")} rotulo="Tarefas" cnt={tarefas.length} />
                <AbaBtn ativa={aba === "notas"} onClick={() => setAba("notas")} rotulo="Anotações" cnt={anotacoes.length} />
                <AbaBtn ativa={aba === "hist"} onClick={() => setAba("hist")} rotulo="Histórico" />
              </div>

              {/* tarefas */}
              {aba === "tarefas" && (
                <div>
                  {tarefas.length === 0 && !addTarefa && (
                    <p className="mb-2 text-sm text-mute">Nenhuma tarefa pra este lead ainda.</p>
                  )}
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
                  {anotacoes.length === 0 && (
                    <p className="mb-2 text-sm text-mute">Nenhuma anotação ainda.</p>
                  )}
                  {anotacoes.map((n) => (
                    <div
                      key={n.id}
                      className="mb-2.5 rounded-md border border-borda border-l-[3px] border-l-laranja-cl bg-branco px-3.5 py-3"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={cn("grid h-[22px] w-[22px] place-items-center rounded-full text-[0.6rem] font-bold text-branco", RESP_COR[n.autorTipo])}>
                          {iniciais(n.autor)}
                        </span>
                        <span className="text-xs font-semibold text-navy">{n.autor}</span>
                        <span className="ml-auto text-xs text-mute">{n.quando}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-texto">{n.texto}</p>
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

              {/* histórico — leitura real de core.evento por lead chega em rodada futura */}
              {aba === "hist" && (
                <p className="text-sm text-mute">
                  O histórico deste lead vive no ledger. A leitura por card ainda não foi ligada —
                  enquanto isso, a <b className="text-suave">Timeline</b> mostra o ledger completo.
                </p>
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

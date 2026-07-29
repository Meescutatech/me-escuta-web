"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardLead, EtapaFunil, Origem } from "@/lib/dados/funil";
import type { PainelLead } from "@/lib/dados/lead-painel";
import { lerPainelLeadAction } from "@/app/(app)/lead/actions";
import { atribuirDono, registrarEventoUI } from "@/app/(app)/funil/actions";
import { FichaKommo } from "@/components/lead/ficha-kommo";
import { TarefasLead } from "@/components/lead/tarefas-lead";
import { AnotacoesLead } from "@/components/lead/anotacoes-lead";
import { AbaHistorico } from "@/components/lead/aba-historico";
import { mapaDeAgentes, mapaDeEtapas, mapaDePessoas } from "@/components/lead/regras/historico.ts";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import { cn } from "@/lib/utils";

/*
 * Drawer do card (Rodada 8): mesmo painel de coleta da conversa — FICHA (config ficha_lead +
 * core.lead_campo) + TAREFAS (core.tarefa; conclusão SEMPRE com tarefa_id real — conserto do
 * bug da R7 que emitia tarefa_concluida sem id e a projeção nunca refletia) + ANOTAÇÕES
 * (core.anotacao). Dados buscados ao abrir via server action (mesma sessão/RLS); recarrega
 * após cada escrita. Componentes compartilhados com a zona 3 de /conversas.
 */

const ORIGEM_TXT: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}
function moeda(v: number | null): string {
  return v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

type Aba = "ficha" | "tarefas" | "notas" | "historico";

export function DrawerCard({
  lead,
  etapa,
  etapas,
  autorEmail,
  autorId,
  mencionaveis,
  tiposTarefa,
  onFechar,
}: {
  lead: CardLead | null;
  etapa: EtapaFunil | null;
  /**
   * M4 · a lista COMPLETA de etapas, não só a atual. O drawer só recebia `etapa` (a corrente), e
   * o histórico precisa traduzir os slugs de TODAS as etapas por onde o lead passou. Com só a
   * atual, toda etapa anterior seria marcada "fora da config" — uma marca FALSA, que é pior que
   * mostrar o slug cru: ela afirma que a config está errada quando quem está incompleto é o dado
   * que a tela recebeu.
   */
  etapas: EtapaFunil[];
  autorEmail: string | null;
  autorId: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const aberto = !!lead;

  const [aba, setAba] = useState<Aba>("ficha");
  const [painel, setPainel] = useState<PainelLead | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [levindoSolicitado, setLevindoSolicitado] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [versao, setVersao] = useState(0); // bump = recarregar painel após escrita
  const [atribuindo, setAtribuindo] = useState(false);

  const leadId = lead?.lead_id ?? null;

  // zera o estado ao trocar de card
  useEffect(() => {
    setAba("ficha");
    setLevindoSolicitado(false);
    setPainel(null);
    setVersao(0);
  }, [leadId]);

  // busca o painel ao abrir (e a cada recarga pós-escrita) via server action — mesma sessão/RLS
  useEffect(() => {
    if (!leadId) return;
    let vivo = true;
    setCarregando(true);
    lerPainelLeadAction(leadId)
      .then((p) => {
        if (vivo) setPainel(p);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [leadId, versao]);

  function recarregar() {
    setVersao((v) => v + 1);
    router.refresh(); // board também reflete (lead_atualizado pode mudar valor/nome no card)
  }

  function avisar(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function trocarDono(donoId: string | null) {
    if (!leadId || atribuindo) return;
    setAtribuindo(true);
    const res = await atribuirDono(leadId, donoId);
    setAtribuindo(false);
    if (res.ok) {
      avisar(donoId ? "Responsável atribuído." : "Responsável removido.");
      router.refresh(); // board re-projeta dono_id/dono_nome no card
    } else {
      avisar(`Não foi possível atribuir: ${res.motivo ?? "erro"}`);
    }
  }

  // F6 — `levindo_acionado` é EXCEÇÃO DECLARADA: tipo deliberadamente sem projetor (vive só no
  // ledger, para o runtime consumir). O que a UI pode confirmar é que o evento entrou, e é isso que
  // registrarEventoUI confere. Deixou de ser `void`: dizer "registrada" sem olhar a resposta era
  // exatamente o defeito que o F6 existe para tirar.
  async function acionarLevindo() {
    if (!leadId) return;
    setLevindoSolicitado(true);
    const res = await registrarEventoUI(
      "levindo_acionado",
      { lead_id: leadId, motivo: "solicitado no card" },
      leadId,
    );
    if (res.ok) avisar("Solicitação registrada no ledger.");
    else {
      setLevindoSolicitado(false);
      avisar(`Não foi possível registrar: ${res.motivo ?? "erro"}`);
    }
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
              {/* atribuição por uuid (0060): select de membro ativo → evento dono_atribuido.
                  Vocabulário = mencionáveis humanos (a página já injeta). Chip legado (Clara,
                  texto do import) segue no card até o vínculo real ser atribuído. */}
              <Fato rotulo="Responsável">
                <select
                  value={lead.dono_id ?? ""}
                  disabled={atribuindo}
                  onChange={(e) => void trocarDono(e.target.value || null)}
                  aria-label="Responsável pelo lead"
                  className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-navy outline-none disabled:opacity-50"
                >
                  <option value="">
                    {lead.dono_id == null && lead.responsavel ? `Sem vínculo (${lead.responsavel.nome})` : "Sem responsável"}
                  </option>
                  {mencionaveis
                    .filter((m) => m.tipo === "humano" && m.ativo)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                </select>
              </Fato>
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
                <AbaBtn ativa={aba === "ficha"} onClick={() => setAba("ficha")} rotulo="Ficha" />
                <AbaBtn
                  ativa={aba === "tarefas"}
                  onClick={() => setAba("tarefas")}
                  rotulo="Tarefas"
                  cnt={painel ? painel.tarefas.filter((t) => t.status !== "concluida").length : undefined}
                />
                <AbaBtn
                  ativa={aba === "notas"}
                  onClick={() => setAba("notas")}
                  rotulo="Anotações"
                  cnt={painel?.anotacoes.length}
                />
                {/* M4 · ÚLTIMA da régua e SEM contagem: o número seria 1, 2 ou 3 em 100% dos
                    leads, e badge de "2" não informa. Esta é a MESMA aba do painel do inbox —
                    um componente só, porque entregar num lugar e não no outro deixa o histórico
                    existindo em metade do produto, e passa em revisão porque quem revisa abre um. */}
                <AbaBtn
                  ativa={aba === "historico"}
                  onClick={() => setAba("historico")}
                  rotulo="Histórico"
                />
              </div>

              {carregando && !painel ? (
                <p className="text-sm text-mute">Carregando…</p>
              ) : !painel ? (
                <p className="text-sm text-mute">Não foi possível carregar o painel — tente reabrir o card.</p>
              ) : (
                <>
                  {aba === "ficha" && (
                    <FichaKommo leadId={lead.lead_id} ficha={painel.ficha} aoAtualizar={recarregar} />
                  )}
                  {aba === "tarefas" && (
                    <TarefasLead
                      leadId={lead.lead_id}
                      tarefas={painel.tarefas}
                      mencionaveis={mencionaveis}
                      tiposTarefa={tiposTarefa}
                      autorId={autorId}
                      autorEmail={autorEmail}
                      aoAtualizar={recarregar}
                    />
                  )}
                  {aba === "notas" && (
                    <AnotacoesLead
                      leadId={lead.lead_id}
                      anotacoes={painel.anotacoes}
                      mencoes={painel.mencoes}
                      mencionaveis={mencionaveis}
                      meuId={autorId}
                      autorEmail={autorEmail}
                      aoAtualizar={recarregar}
                    />
                  )}
                  {aba === "historico" && (
                    <AbaHistorico
                      historico={painel.historico.eventos}
                      donoLegado={painel.historico.donoLegado}
                      pessoas={mapaDePessoas(mencionaveis)}
                      agentes={mapaDeAgentes(mencionaveis)}
                      etapas={mapaDeEtapas(etapas)}
                    />
                  )}
                </>
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

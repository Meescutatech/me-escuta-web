"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardLead, EtapaFunil } from "@/lib/dados/funil";
import type { PainelLead } from "@/lib/dados/lead-painel";
import type { Mensagem } from "@/lib/dados/conversas";
import type { ValorCampo } from "@/lib/dados/ficha-calculos";
import { lerPainelLeadAction, salvarCampoFicha } from "@/app/(app)/lead/actions";
import { atribuirDono, lerConversaDoLeadAcao, registrarEventoUI } from "@/app/(app)/funil/actions";
import { classificarPrazo, escolherProximaTarefa, textoPrazoCurto, type EstadoPrazo } from "@/lib/dados/funil-calculos";
import { dataUltimaMensagem } from "@/lib/dados/funil-ordenacao";
import { textoTempoCurto } from "@/lib/tempo";
import type { EnsaioFunil } from "@/lib/ensaio/funil-extra";
import { TarefasLead } from "@/components/lead/tarefas-lead";
import { AnotacoesLead } from "@/components/lead/anotacoes-lead";
import { AbaHistorico } from "@/components/lead/aba-historico";
import { mapaDeAgentes, mapaDeEtapas, mapaDePessoas } from "@/components/lead/regras/historico.ts";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FioLead } from "./fio-lead";
import { FichaLead } from "./ficha-lead";
import { cn } from "@/lib/utils";

/*
 * DRAWER DO LEAD — v3 (W-D6, 10/09 23:40).
 *
 * Diogo, sobre a v2: "horrível, não serve para nada — eu deveria ver a conversa, os dados". A v2
 * gastava o topo com três cartões de destaque, um botão verde gigante de audiometria e um cartão
 * "Acionar Levindo", e a conversa ficava atrás de uma aba. Agora o CENTRO é a conversa e a ficha:
 *
 *  (a) cabeçalho em UMA faixa: nome 18px · idade · telefone · cidade · etapa (texto com ponto de
 *      cor) · responsável (popover, não <select>) · "Responder" · "⋯" (Levindo, abrir no inbox).
 *  (b) UMA linha de 12px muted com o que os destaques diziam: próxima tarefa · último contato ·
 *      tempo na etapa · valor. A audiometria virou uma linha da ficha (✓ quando "Sim"); o Levindo
 *      virou um item do "⋯" e um link discreto na aba Tarefas.
 *  (c) corpo em DUAS colunas quando o drawer é largo (`clamp(640px, 44vw, 880px)` → a partir de
 *      ~1700px de viewport): esquerda a CONVERSA (últimas 20 mensagens, rolável, "Responder" abre
 *      /conversas?c=), direita a FICHA editável no lugar com abas pequenas Ficha · Tarefas ·
 *      Anotações · Histórico. Estreito: abas Conversa | Ficha alternam.
 *
 * Referência: LiderHub `features/inbox/ui/data-panel/` (aba Contexto = grade de propriedades
 * editáveis) + `features/contacts/ui/detail/contact-aside-fields.tsx`. Porte de forma; o domínio
 * (paciente, fono, `core.*`) é o nosso. Escrita continua pela porta: ficha → `salvarCampoFicha`
 * (`lead_atualizado`), responsável → `atribuirDono`, Levindo → `levindo_acionado`. Em ensaio nada
 * vai ao banco: o painel e a conversa chegam por `ensaio` e a edição pinta localmente.
 *
 * O que ficou da R8/W3/M4 e continua valendo: a projeção é a verdade (recarrega após escrita);
 * `levindo_acionado` é exceção declarada sem projetor (F6 — a UI confirma que o evento ENTROU);
 * o histórico recebe TODAS as etapas para traduzir slug (M4).
 */

const ORIGEM_TXT: Record<string, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

const TOM_PRAZO: Record<EstadoPrazo, string> = {
  vencida: "text-vermelho",
  hoje: "text-amarelo",
  futura: "text-suave",
  sem_prazo: "text-mute",
};

/** Últimas N mensagens no fio do drawer — a conversa inteira mora em /conversas. */
const ULTIMAS_MENSAGENS = 20;

/** Largura de viewport a partir da qual o drawer (44vw) tem espaço para DUAS colunas. */
const LARGO_MIN_PX = 1700;

function iniciais(nome: string): string {
  const p = nome.replace(/→|·|\(.*\)/g, " ").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1] ? p[1][0] : "")).toUpperCase();
}
function moeda(v: number | null): string {
  return v == null ? "" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtTelefone(t: string | null): string {
  if (!t) return "";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

function useLargo(): boolean {
  const [largo, setLargo] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LARGO_MIN_PX}px)`);
    const aplicar = () => setLargo(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);
  return largo;
}

type AbaDados = "ficha" | "tarefas" | "notas" | "historico";
type AbaEstreita = "conversa" | "dados";

export function DrawerCard({
  lead,
  etapa,
  etapas,
  autorEmail,
  autorId,
  mencionaveis,
  tiposTarefa,
  onFechar,
  agora = Date.now(),
  ensaio = null,
  abaInicial = null,
}: {
  lead: CardLead | null;
  etapa: EtapaFunil | null;
  /** a lista COMPLETA de etapas (M4): o histórico traduz os slugs de todas por onde o lead passou */
  etapas: EtapaFunil[];
  autorEmail: string | null;
  autorId: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  onFechar: () => void;
  /** relógio do board (tick por minuto) */
  agora?: number;
  /** modo ensaio: painel + conversa por lead vêm daqui; nenhuma action é chamada */
  ensaio?: EnsaioFunil | null;
  /** deep-link `?aba=conversa|ficha|tarefas|notas|historico` */
  abaInicial?: string | null;
}) {
  const router = useRouter();
  const aberto = !!lead;
  const largo = useLargo();

  const [abaDados, setAbaDados] = useState<AbaDados>("ficha");
  const [abaEstreita, setAbaEstreita] = useState<AbaEstreita>("conversa");
  const [painel, setPainel] = useState<PainelLead | null>(null);
  const [carregando, setCarregando] = useState(false);
  /** `undefined` = ainda não perguntamos; `null` = sem conversa (ou leitura falhou) */
  const [conversa, setConversa] = useState<{ conversaId: string; mensagens: Mensagem[]; canal: string | null } | null | undefined>(undefined);
  const [levindoSolicitado, setLevindoSolicitado] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [atribuindo, setAtribuindo] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [donoAberto, setDonoAberto] = useState(false);

  const leadId = lead?.lead_id ?? null;

  // zera ao trocar de card; a aba pedida pelo deep-link vale na primeira abertura
  useEffect(() => {
    const dados: AbaDados[] = ["ficha", "tarefas", "notas", "historico"];
    setAbaDados(dados.includes(abaInicial as AbaDados) ? (abaInicial as AbaDados) : "ficha");
    setAbaEstreita(abaInicial && abaInicial !== "conversa" ? "dados" : "conversa");
    setLevindoSolicitado(false);
    setPainel(null);
    setConversa(undefined);
    setVersao(0);
    setMenuAberto(false);
    setDonoAberto(false);
  }, [leadId, abaInicial]);

  // painel: server action (mesma sessão/RLS) ou props em ensaio
  useEffect(() => {
    if (!leadId) return;
    if (ensaio) {
      setPainel(ensaio.paineis[leadId] ?? null);
      setCarregando(false);
      return;
    }
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
  }, [leadId, versao, ensaio]);

  // conversa: a leitura mais pesada — dispara ao abrir (a conversa é o centro agora)
  useEffect(() => {
    if (!leadId || conversa !== undefined) return;
    if (ensaio) {
      setConversa(ensaio.conversas[leadId] ?? null);
      return;
    }
    let vivo = true;
    lerConversaDoLeadAcao(leadId).then((c) => {
      if (vivo) setConversa(c);
    });
    return () => {
      vivo = false;
    };
  }, [leadId, conversa, ensaio]);

  function recarregar() {
    setVersao((v) => v + 1);
    router.refresh();
  }
  function avisar(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function trocarDono(donoId: string | null) {
    if (!leadId || atribuindo) return;
    setAtribuindo(true);
    setDonoAberto(false);
    if (ensaio) {
      setAtribuindo(false);
      avisar(donoId ? "Responsável atribuído." : "Responsável removido.");
      return;
    }
    const res = await atribuirDono(leadId, donoId);
    setAtribuindo(false);
    if (res.ok) {
      avisar(donoId ? "Responsável atribuído." : "Responsável removido.");
      router.refresh();
    } else {
      avisar(`Não foi possível atribuir: ${res.motivo ?? "erro"}`);
    }
  }

  /** A ficha grava pela porta (`lead_atualizado`); em ensaio pinta o valor localmente. */
  async function salvarCampo(slug: string, valor: ValorCampo): Promise<{ ok: boolean; motivo?: string }> {
    if (!leadId) return { ok: false, motivo: "lead sem id" };
    if (ensaio) {
      setPainel((p) => (p && p.ficha.valores ? { ...p, ficha: { ...p.ficha, valores: { ...p.ficha.valores, [slug]: valor } } } : p));
      return { ok: true };
    }
    const res = await salvarCampoFicha(leadId, slug, valor);
    if (res.ok) recarregar();
    return { ok: res.ok, motivo: res.motivo };
  }

  // F6 — `levindo_acionado` vive só no ledger; o que a UI confirma é que o evento entrou.
  async function acionarLevindo() {
    if (!leadId || levindoSolicitado) return;
    setMenuAberto(false);
    setLevindoSolicitado(true);
    if (ensaio) return avisar("Análise de crédito solicitada — o Levindo responde como sugestão.");
    const res = await registrarEventoUI("levindo_acionado", { lead_id: leadId, motivo: "solicitado no card" }, leadId);
    if (res.ok) avisar("Análise de crédito solicitada — o Levindo responde como sugestão.");
    else {
      setLevindoSolicitado(false);
      avisar(`Não foi possível registrar: ${res.motivo ?? "erro"}`);
    }
  }

  // ── a linha meta: próxima tarefa (do painel quando carregado), último contato, etapa, valor
  const proximaDoPainel = painel ? escolherProximaTarefa(painel.tarefas) : undefined;
  const proxima = proximaDoPainel !== undefined ? proximaDoPainel : lead?.proxima_tarefa;
  const estadoPrazo = proxima ? classificarPrazo(proxima.prazo, agora) : null;
  const ultima = lead?.ultima_mensagem ?? null;
  const fechado = lead?.etapa === "ganho" || lead?.etapa === "perdido";
  const hrefResponder = lead
    ? conversa?.conversaId
      ? `/conversas?c=${conversa.conversaId}`
      : `/conversas?lead=${lead.lead_id}`
    : "/conversas";
  const humanos = mencionaveis.filter((m) => m.tipo === "humano" && m.ativo);
  const nomeDono = lead?.dono_nome ?? lead?.responsavel?.nome ?? null;

  const mensagensFio = conversa?.mensagens ?? [];
  const truncado = mensagensFio.length > ULTIMAS_MENSAGENS;
  const ultimas = truncado ? mensagensFio.slice(-ULTIMAS_MENSAGENS) : mensagensFio;

  const painelConversa = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto bg-board px-4 py-3">
        {truncado && (
          <p className="mb-2 text-center text-[11.5px] text-mute">
            Últimas {ULTIMAS_MENSAGENS} de {mensagensFio.length} mensagens ·{" "}
            <button type="button" onClick={() => router.push(hrefResponder)} className="text-navy underline-offset-2 hover:underline">
              ver a conversa inteira
            </button>
          </p>
        )}
        {conversa === undefined ? (
          <p className="py-8 text-center text-[13px] text-mute">Carregando a conversa…</p>
        ) : conversa === null ? (
          <p className="py-8 text-center text-[13px] leading-relaxed text-mute">
            Sem conversa registrada com este lead.
            <br />
            Quem chega por ligação ou indicação entra aqui quando responder no WhatsApp.
          </p>
        ) : (
          <FioLead mensagens={ultimas} nomeLead={lead?.nome ?? "Lead"} />
        )}
      </div>
      {/* o "composer" do drawer é um convite: escrever é em /conversas (composer, janela de 24h,
          número de saída). O botão diz exatamente o que acontece. */}
      <button
        type="button"
        onClick={() => router.push(hrefResponder)}
        className="flex shrink-0 items-center gap-2.5 border-t border-linha bg-branco px-4 py-2.5 text-left transition-colors hover:bg-hover"
      >
        <span className="min-w-0 flex-1 truncate rounded-[6px] border border-linha bg-board px-3 py-1.5 text-[13px] text-mute">
          Responder{conversa?.canal ? ` pelo número ${conversa.canal}` : ""}…
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-laranja px-3 py-1.5 text-xs font-semibold text-branco">
          Abrir conversa
          <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </button>
    </div>
  );

  const painelDados = lead && (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-linha px-2">
        <AbaPequena ativa={abaDados === "ficha"} onClick={() => setAbaDados("ficha")} rotulo="Ficha" />
        <AbaPequena
          ativa={abaDados === "tarefas"}
          onClick={() => setAbaDados("tarefas")}
          rotulo="Tarefas"
          cnt={painel ? painel.tarefas.filter((t) => t.status !== "concluida").length : undefined}
        />
        <AbaPequena ativa={abaDados === "notas"} onClick={() => setAbaDados("notas")} rotulo="Anotações" cnt={painel?.anotacoes.length} />
        <AbaPequena ativa={abaDados === "historico"} onClick={() => setAbaDados("historico")} rotulo="Histórico" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {carregando && !painel ? (
          <p className="px-1 text-[13px] text-mute">Carregando…</p>
        ) : !painel ? (
          <p className="px-1 text-[13px] text-mute">Não foi possível carregar o painel — tente reabrir o card.</p>
        ) : (
          <>
            {abaDados === "ficha" && <FichaLead ficha={painel.ficha} onSalvar={salvarCampo} />}
            {abaDados === "tarefas" && (
              <>
                <TarefasLead
                  leadId={lead.lead_id}
                  tarefas={painel.tarefas}
                  mencionaveis={mencionaveis}
                  tiposTarefa={tiposTarefa}
                  autorId={autorId}
                  autorEmail={autorEmail}
                  aoAtualizar={recarregar}
                />
                {/* Levindo: um link discreto entre as ações, não um cartão. Crédito nunca é
                    automático (Constituição §1.2) — o pedido entra no ledger e a resposta vem
                    como sugestão para validar. */}
                <div className="mt-4 border-t border-linha pt-3">
                  {levindoSolicitado ? (
                    <p className="text-[12.5px] text-suave">Análise de crédito solicitada — o Levindo responde como sugestão para você validar.</p>
                  ) : (
                    <button type="button" onClick={acionarLevindo} className="text-[12.5px] text-navy underline-offset-2 hover:underline">
                      Pedir análise de crédito ao Levindo
                    </button>
                  )}
                </div>
              </>
            )}
            {abaDados === "notas" && (
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
            {abaDados === "historico" && (
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
    </div>
  );

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
          "fixed right-0 top-0 z-50 flex h-full w-[clamp(640px,44vw,880px)] max-w-[96vw] flex-col bg-branco shadow-[-18px_0_50px_rgba(37,47,99,0.18)] transition-transform",
          aberto ? "translate-x-0" : "translate-x-full",
        )}
        aria-label={lead ? `Lead ${lead.nome ?? ""}` : undefined}
      >
        {lead && (
          <>
            {/* (a) CABEÇALHO EM UMA FAIXA */}
            <div className="flex shrink-0 items-center gap-3 border-b border-linha px-4 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-bold text-branco">
                {iniciais(lead.nome ?? "Lead")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="min-w-0 truncate text-[18px] font-semibold leading-tight text-tinta">{lead.nome ?? "Lead sem nome"}</h2>
                  {etapa && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-suave" title="Etapa no funil">
                      <span className="h-2 w-2 rounded-full" style={{ background: etapa.cor }} aria-hidden />
                      {etapa.nome}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[12.5px] text-suave">
                  {lead.idade != null && <span>{lead.idade} anos</span>}
                  {lead.idade != null && lead.telefone && <span aria-hidden className="text-mute">·</span>}
                  {lead.telefone && <span className="tabular-nums">{fmtTelefone(lead.telefone)}</span>}
                  {lead.cidade && (lead.idade != null || lead.telefone) && <span aria-hidden className="text-mute">·</span>}
                  {lead.cidade && <span>{lead.cidade}</span>}
                  {lead.origem && (
                    <>
                      <span aria-hidden className="text-mute">·</span>
                      <span>{ORIGEM_TXT[lead.origem]}</span>
                    </>
                  )}
                  <span aria-hidden className="text-mute">·</span>
                  {/* responsável: popover com a lista de pessoas, nunca <select> nativo */}
                  <Popover open={donoAberto} onOpenChange={setDonoAberto}>
                    <PopoverTrigger
                      type="button"
                      disabled={atribuindo}
                      className={cn("-mx-1 inline-flex items-center gap-1 rounded-[4px] px-1 transition-colors hover:bg-hover", atribuindo && "opacity-50")}
                      aria-label="Responsável pelo lead"
                    >
                      <span className={cn(nomeDono ? "text-tinta" : "text-mute")}>{nomeDono ?? "sem responsável"}</span>
                      <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 stroke-mute" fill="none" aria-hidden>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-1.5" role="radiogroup" aria-label="Responsável">
                      {humanos.map((m) => {
                        const marcado = m.id === lead.dono_id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={marcado}
                            onClick={() => void trocarDono(m.id)}
                            className={cn("flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover", marcado ? "font-medium text-tinta" : "text-suave")}
                          >
                            <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", marcado ? "border-laranja" : "border-linha-forte")}>
                              {marcado && <span className="h-2 w-2 rounded-full bg-laranja" />}
                            </span>
                            {m.nome}
                          </button>
                        );
                      })}
                      {lead.dono_id && (
                        <button type="button" onClick={() => void trocarDono(null)} className="mt-1 w-full rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-mute hover:bg-hover">
                          Remover responsável
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <button
                onClick={() => router.push(hrefResponder)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-laranja px-3 py-1.5 text-xs font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none" aria-hidden>
                  <path d="M9 14 4 9l5-5" />
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
                Responder
              </button>
              <Popover open={menuAberto} onOpenChange={setMenuAberto}>
                <PopoverTrigger
                  type="button"
                  aria-label="Mais ações"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-suave transition-colors hover:bg-hover hover:text-tinta"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-60 p-1.5">
                  <ItemMenu onClick={acionarLevindo} desabilitado={levindoSolicitado}>
                    {levindoSolicitado ? "Análise de crédito solicitada" : "Pedir análise de crédito (Levindo)"}
                  </ItemMenu>
                  <ItemMenu onClick={() => router.push(hrefResponder)}>Abrir na caixa de conversas</ItemMenu>
                  {lead.telefone && (
                    <ItemMenu
                      onClick={() => {
                        void navigator.clipboard?.writeText(lead.telefone ?? "");
                        setMenuAberto(false);
                        avisar("Telefone copiado.");
                      }}
                    >
                      Copiar telefone
                    </ItemMenu>
                  )}
                </PopoverContent>
              </Popover>
              <button
                onClick={onFechar}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-suave transition-colors hover:bg-hover hover:text-tinta"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2} className="h-4 w-4 stroke-current" fill="none" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* (b) A LINHA META — o que os três cartões diziam, em 12px */}
            <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 border-b border-linha bg-board px-4 py-1.5 text-[12px] text-mute">
              {proxima ? (
                <span className="min-w-0 truncate" title={proxima.titulo}>
                  próxima: <span className="text-tinta">{proxima.titulo}</span>{" "}
                  <span className={cn("font-medium", TOM_PRAZO[estadoPrazo ?? "sem_prazo"])}>· {textoPrazoCurto(proxima.prazo, agora)}</span>
                </span>
              ) : proxima === null && !fechado ? (
                <button
                  type="button"
                  onClick={() => {
                    setAbaDados("tarefas");
                    setAbaEstreita("dados");
                  }}
                  className="underline-offset-2 hover:text-tinta hover:underline"
                >
                  sem próxima ação — criar tarefa
                </button>
              ) : null}
              {ultima && (
                <>
                  <span aria-hidden>·</span>
                  <span className="min-w-0 truncate" title={ultima.texto}>
                    {ultima.de === "cliente" ? "ele falou" : "nós falamos"} {dataUltimaMensagem(ultima.em, agora)}
                  </span>
                </>
              )}
              {lead.entrou_etapa_em && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">há {textoTempoCurto(lead.entrou_etapa_em, agora)} na etapa</span>
                </>
              )}
              {lead.valor != null && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums text-tinta">{moeda(lead.valor)}</span>
                </>
              )}
              {lead.tags.length > 0 && (
                <span className="ml-auto flex flex-wrap gap-1">
                  {lead.tags.map((t) => (
                    <span key={t} className="rounded-full bg-laranja-cl px-1.5 py-px text-[10.5px] font-medium text-laranja-esc">
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>

            {/* (c) O CORPO: conversa · ficha */}
            {largo ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] divide-x divide-linha">
                {painelConversa}
                {painelDados}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 gap-0.5 border-b border-linha px-2">
                  <AbaPequena ativa={abaEstreita === "conversa"} onClick={() => setAbaEstreita("conversa")} rotulo="Conversa" />
                  <AbaPequena ativa={abaEstreita === "dados"} onClick={() => setAbaEstreita("dados")} rotulo="Ficha" />
                </div>
                {abaEstreita === "conversa" ? painelConversa : painelDados}
              </div>
            )}

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

function AbaPequena({ ativa, onClick, rotulo, cnt }: { ativa: boolean; onClick: () => void; rotulo: string; cnt?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-2.5 py-2 text-[12.5px] font-medium transition-colors",
        ativa ? "text-tinta" : "text-suave hover:text-tinta",
      )}
    >
      {rotulo}
      {cnt != null && cnt > 0 && (
        <span className={cn("rounded-full px-1.5 font-mono text-[10px] tabular-nums", ativa ? "bg-laranja-cl text-laranja-esc" : "bg-hover text-suave")}>{cnt}</span>
      )}
      {ativa && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-laranja" />}
    </button>
  );
}

function ItemMenu({ onClick, desabilitado, children }: { onClick: () => void; desabilitado?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={desabilitado}
      onClick={onClick}
      className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[13px] text-tinta transition-colors hover:bg-hover disabled:cursor-default disabled:text-mute"
    >
      {children}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardLead, EtapaFunil, Origem } from "@/lib/dados/funil";
import type { PainelLead } from "@/lib/dados/lead-painel";
import type { Mensagem } from "@/lib/dados/conversas";
import { lerPainelLeadAction, salvarCampoFicha } from "@/app/(app)/lead/actions";
import { atribuirDono, lerConversaDoLeadAcao, registrarEventoUI } from "@/app/(app)/funil/actions";
import { classificarPrazo, escolherProximaTarefa, textoPrazoCurto, type EstadoPrazo } from "@/lib/dados/funil-calculos";
import { dataUltimaMensagem, prioridadeCard, ROTULO_FAIXA, TEXTO_COR_FAIXA, SLA_PADRAO_DECLARADO } from "@/lib/dados/funil-ordenacao";
import { textoTempoCurto } from "@/lib/tempo";
import type { EnsaioFunil } from "@/lib/ensaio/funil-extra";
import { FioLead } from "./fio-lead";
import { BotaoAudiometria, type EstadoAudiometria } from "@/components/lead/botao-audiometria";
import { FichaKommo } from "@/components/lead/ficha-kommo";
import { TarefasLead } from "@/components/lead/tarefas-lead";
import { AnotacoesLead } from "@/components/lead/anotacoes-lead";
import { AbaHistorico } from "@/components/lead/aba-historico";
import { mapaDeAgentes, mapaDeEtapas, mapaDePessoas } from "@/components/lead/regras/historico.ts";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import { valorParaTexto } from "@/lib/dados/ficha-calculos";
import { cn } from "@/lib/utils";

/*
 * Drawer do card (Rodada 8): mesmo painel de coleta da conversa — FICHA (config ficha_lead +
 * core.lead_campo) + TAREFAS (core.tarefa; conclusão SEMPRE com tarefa_id real — conserto do
 * bug da R7 que emitia tarefa_concluida sem id e a projeção nunca refletia) + ANOTAÇÕES
 * (core.anotacao). Dados buscados ao abrir via server action (mesma sessão/RLS); recarrega
 * após cada escrita. Componentes compartilhados com a zona 3 de /conversas.
 *
 * ── W-D6 (10/09) · o drawer virou o PAINEL DO LEAD, com a conversa dentro ──────────────────
 * Referência: LiderHub `features/inbox/ui/data-panel/` (abas com `?tab`, cada aba com o próprio
 * vazio) e `features/contacts/ui/detail/contact-highlights.tsx` (o bento de destaques). O que
 * entrou, e por quê:
 *  · 560px em vez de 472: a ficha do paciente (cidade, para quem é, já usa aparelho) é o que a
 *    fono quer ver, e a 472 as abas da ficha quebravam linha.
 *  · linha de identidade: idade · telefone · cidade declarada — os três fatos que a Sara diz em
 *    voz alta antes de responder.
 *  · DESTAQUES: próxima tarefa (com o tom do prazo), último contato (quem falou por último) e
 *    tempo na etapa (com a faixa). Grade com hairline, não cards: três fatos, um relance.
 *  · aba CONVERSA (card G6): o fio em leitura, sem sair do funil; "Responder" abre /conversas na
 *    conversa certa. Responder aqui não — composer, janela de 24h e número moram lá.
 *  · em ENSAIO o painel e a conversa chegam por props (`ensaio`) e nada vai ao banco; marcar a
 *    audiometria pinta localmente para o fluxo poder ser ensaiado ponta a ponta.
 */

const ORIGEM_TXT: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}
function moeda(v: number | null): string {
  return v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/*
 * W3 · AUDIOMETRIA — de-para entre a PROJEÇÃO e o botão.
 *
 * A config `ficha_lead` v2 declara o campo `audiometria` como `selecao` com opções ["Não","Sim"],
 * e é assim que ele está projetado em `core.lead_campo` (medido 22/08: 15 "Sim", 4 "Não").
 * O de-para vive aqui, num lugar só, porque a UI fala em fez/não-fez e o dado fala em Sim/Não —
 * traduzir nos dois sentidos no mesmo arquivo é o que impede as duas metades de divergirem.
 * Qualquer coisa fora do vocabulário vira "indefinido": chutar seria pintar o gate de verde ou
 * vermelho por causa de um valor que ninguém escreveu.
 */
const SLUG_AUDIOMETRIA = "audiometria";
const SLUG_HORA_AUDIOMETRIA = "hora_audiometria";

function audiometriaDoValor(valor: unknown): EstadoAudiometria {
  if (valor == null) return "indefinido";
  const v = String(valor).trim().toLowerCase();
  if (v === "sim" || v === "true") return "fez";
  if (v === "nao" || v === "n\u00e3o" || v === "false") return "nao_fez";
  return "indefinido";
}

function valorDaAudiometria(estado: EstadoAudiometria): string | null {
  if (estado === "fez") return "Sim";
  if (estado === "nao_fez") return "N\u00e3o";
  return null;
}

/** Legenda do botão: o horário do exame, quando a ficha tem um. Nunca "marcado por fulano" —
 *  a projeção da ficha não guarda quem marcou, e inventar autoria é pior que não mostrar nada. */
function textoHoraAudiometria(valores: Record<string, unknown> | null): string | undefined {
  const bruto = valores?.[SLUG_HORA_AUDIOMETRIA];
  if (bruto == null || bruto === "") return undefined;
  const t = valorParaTexto("data_hora", bruto);
  return t === "\u2014" ? undefined : `exame na ficha: ${t}`;
}

type Aba = "ficha" | "conversa" | "tarefas" | "notas" | "historico";

const TOM_PRAZO: Record<EstadoPrazo, string> = {
  vencida: "bg-vermelho-bg text-vermelho",
  hoje: "bg-amarelo-bg text-amarelo",
  futura: "bg-hover text-suave",
  sem_prazo: "bg-hover text-mute",
};

/** (31) 99881-1234 — mesma regra do card. */
function fmtTelefone(t: string | null): string {
  if (!t) return "";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

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
  /** relógio do board (tick por minuto) — destaques e prazos derivam dele */
  agora?: number;
  /** W-D6 · modo ensaio: painel + conversa por lead vêm daqui; nenhuma action é chamada */
  ensaio?: EnsaioFunil | null;
  /** aba com que o drawer abre (deep-link `?aba=`); inválida ou ausente = Ficha */
  abaInicial?: string | null;
}) {
  const router = useRouter();
  const aberto = !!lead;

  const [aba, setAba] = useState<Aba>("ficha");
  const [painel, setPainel] = useState<PainelLead | null>(null);
  const [carregando, setCarregando] = useState(false);
  /** `undefined` = ainda não perguntamos; `null` = sem conversa (ou leitura falhou) */
  const [conversa, setConversa] = useState<{ conversaId: string; mensagens: Mensagem[]; canal: string | null } | null | undefined>(undefined);
  const [levindoSolicitado, setLevindoSolicitado] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [versao, setVersao] = useState(0); // bump = recarregar painel após escrita
  const [atribuindo, setAtribuindo] = useState(false);

  const leadId = lead?.lead_id ?? null;

  const ABAS: Aba[] = ["ficha", "conversa", "tarefas", "notas", "historico"];
  // zera o estado ao trocar de card (a aba pedida pelo deep-link vale só na primeira abertura)
  useEffect(() => {
    setAba(ABAS.includes(abaInicial as Aba) ? (abaInicial as Aba) : "ficha");
    setLevindoSolicitado(false);
    setPainel(null);
    setConversa(undefined);
    setVersao(0);
  }, [leadId]);

  // busca o painel ao abrir (e a cada recarga pós-escrita) via server action — mesma sessão/RLS.
  // Em ensaio o painel vem por props, síncrono: o drawer abre já preenchido.
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

  // a conversa só é lida quando a aba abre (e uma vez por lead): é a leitura mais pesada do
  // painel (até 500 mensagens + URLs de mídia) e a maioria das aberturas do drawer não chega nela.
  useEffect(() => {
    if (!leadId || aba !== "conversa" || conversa !== undefined) return;
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
  }, [leadId, aba, conversa, ensaio]);

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

  /*
   * W3 (P7 do workshop) — O CLIQUE PASSOU A GRAVAR.
   *
   * Até 22/08 `<BotaoAudiometria />` era chamado SEM props: todo lead abria em "indefinido" e a
   * marcação morria no useState do componente. O caminho de escrita já existia inteiro —
   * `salvarCampoFicha` emite `lead_atualizado` pela porta e a projeção é síncrona —, só ninguém
   * tinha ligado os dois. É a mesma porta que a aba Ficha usa, então marcar aqui e marcar lá
   * produzem o MESMO evento; não há um segundo caminho de escrita para divergir.
   *
   * Devolve o resultado ao botão em vez de engolir: o botão desfaz a pintura otimista quando a
   * porta recusa. Sarah tem que ver a recusa, não uma marca verde sobre um banco que não mudou.
   */
  async function gravarAudiometria(estado: EstadoAudiometria) {
    if (!leadId) return { ok: false, motivo: "lead sem id" };
    const valor = valorDaAudiometria(estado);
    if (valor == null) return { ok: false, motivo: "estado sem valor na ficha" };
    if (ensaio) {
      // ensaio: o efeito aparece na ficha local, sem porta — o fluxo inteiro dá para ensaiar
      setPainel((p) => (p && p.ficha.valores ? { ...p, ficha: { ...p.ficha, valores: { ...p.ficha.valores, [SLUG_AUDIOMETRIA]: valor } } } : p));
      avisar(estado === "fez" ? "Audiometria marcada como feita." : "Audiometria marcada como pendente.");
      return { ok: true };
    }
    const res = await salvarCampoFicha(leadId, SLUG_AUDIOMETRIA, valor);
    if (res.ok) {
      avisar(estado === "fez" ? "Audiometria marcada como feita." : "Audiometria marcada como pendente.");
      recarregar(); // a aba Ficha e o card do funil leem a mesma projeção
    }
    return { ok: res.ok, motivo: res.motivo };
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

  // ── W-D6 · destaques: próxima tarefa (do painel quando carregado — é a verdade mais fresca —,
  // senão a do card), último contato e tempo na etapa com a faixa do board
  const proximaDoPainel = painel ? escolherProximaTarefa(painel.tarefas) : undefined;
  const proxima = proximaDoPainel !== undefined ? proximaDoPainel : lead?.proxima_tarefa;
  const estadoPrazo = proxima ? classificarPrazo(proxima.prazo, agora) : null;
  const nomeDono = proxima
    ? (proxima.responsavel_id && mencionaveis.find((m) => m.id === proxima.responsavel_id)?.nome.split(" ")[0]) ||
      (proxima.responsavel ? proxima.responsavel.split("@")[0] : null)
    : null;
  const ultima = lead?.ultima_mensagem ?? null;
  const prio = lead ? prioridadeCard(lead, SLA_PADRAO_DECLARADO, agora) : null;
  const fechado = lead?.etapa === "ganho" || lead?.etapa === "perdido";
  const hrefResponder = lead
    ? conversa?.conversaId
      ? `/conversas?c=${conversa.conversaId}`
      : `/conversas?lead=${lead.lead_id}`
    : "/conversas";

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
          // largura acompanha a tela (regra 23:20): 560px em 1440, ~690px em 1920 — a conversa e a ficha
          // ganham o espaço; teto de 720 para o fio não virar linha de 120 caracteres
          "fixed right-0 top-0 z-50 flex h-full w-[clamp(560px,36vw,720px)] max-w-[96vw] flex-col bg-creme shadow-[-18px_0_50px_rgba(37,47,99,0.18)] transition-transform",
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
                {/* W-D6: "Abrir conversa" virou "Responder" — ler é aqui (aba Conversa); só
                    responder sai do funil, e o botão diz exatamente isso. */}
                <button
                  onClick={() => router.push(hrefResponder)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-3 py-1.5 text-xs font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none" aria-hidden>
                    <path d="M9 14 4 9l5-5" />
                    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                  </svg>
                  Responder
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
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-2xl font-semibold leading-tight text-navy">
                    {lead.nome ?? "Lead sem nome"}
                  </div>
                  {/* os três fatos que a Sara diz em voz alta antes de responder */}
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-suave">
                    {lead.idade != null && <span>{lead.idade} anos</span>}
                    {lead.idade != null && lead.telefone && <span aria-hidden className="text-mute">·</span>}
                    {lead.telefone && <span className="tabular-nums">{fmtTelefone(lead.telefone)}</span>}
                    {lead.cidade && (lead.idade != null || lead.telefone) && <span aria-hidden className="text-mute">·</span>}
                    {lead.cidade && <span>{lead.cidade}</span>}
                  </div>
                  {lead.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lead.tags.map((t) => (
                        <span key={t} className="rounded-full bg-laranja-cl px-2 py-0.5 text-[11px] font-medium text-laranja-esc">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* DESTAQUES (LiderHub contact-highlights, sem os cards): três fatos, um relance.
                  Grade com hairline no lugar de cartões — o botão de audiometria logo abaixo já é
                  o único elemento grande que esta tela pode ter. */}
              <div className="mb-4 grid grid-cols-3 divide-x divide-linha rounded-[10px] border border-linha bg-branco">
                <Destaque rotulo="Próxima tarefa">
                  {proxima ? (
                    <>
                      <div className="truncate text-[13px] font-medium text-tinta" title={proxima.titulo}>{proxima.titulo}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={cn("rounded-[4px] px-1.5 py-px text-[10.5px] font-semibold tabular-nums", TOM_PRAZO[estadoPrazo ?? "sem_prazo"])}>
                          {textoPrazoCurto(proxima.prazo, agora)}
                        </span>
                        {nomeDono && <span className="truncate text-[11px] text-mute">{nomeDono}</span>}
                      </div>
                    </>
                  ) : proxima === null && !fechado ? (
                    <button
                      type="button"
                      onClick={() => setAba("tarefas")}
                      className="text-left text-[12.5px] text-mute underline-offset-2 hover:text-tinta hover:underline"
                    >
                      sem próxima ação — criar tarefa
                    </button>
                  ) : (
                    <span className="text-[12.5px] text-mute">{fechado ? "lead fechado" : "—"}</span>
                  )}
                </Destaque>
                <Destaque rotulo="Último contato">
                  {ultima ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span aria-hidden className={cn("font-mono text-[11px]", ultima.de === "cliente" ? "text-navy" : "text-mute")}>
                          {ultima.de === "cliente" ? "\u2190" : "\u2192"}
                        </span>
                        <span className="truncate text-[13px] text-tinta" title={ultima.texto}>{ultima.texto}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-mute">
                        {ultima.de === "cliente" ? "ele falou por último" : "nós falamos por último"} · {dataUltimaMensagem(ultima.em, agora)}
                      </div>
                    </>
                  ) : (
                    <span className="text-[12.5px] text-mute">sem mensagem registrada</span>
                  )}
                </Destaque>
                <Destaque rotulo="Na etapa">
                  <div className="text-[13px] font-medium tabular-nums text-tinta">
                    {textoTempoCurto(lead.entrou_etapa_em, agora) || "—"}
                    {lead.valor != null && <span className="ml-1.5 font-normal text-suave">{moeda(lead.valor)}</span>}
                  </div>
                  {prio && ROTULO_FAIXA[prio.faixa] && (
                    <div className={cn("mt-1 text-[10.5px] font-semibold uppercase tracking-[0.05em]", TEXTO_COR_FAIXA[prio.faixa])}>
                      {ROTULO_FAIXA[prio.faixa]}
                      {prio.pausado && <span className="ml-1.5 font-normal normal-case tracking-normal text-suave">agendado</span>}
                    </div>
                  )}
                </Destaque>
              </div>

              {/* Workshop 12/08 · "a primeira coisa que deveria ter embaixo do nome é um botão
                  gigante, audiometria" — e é literalmente embaixo do nome, antes dos fatos, antes
                  das abas. É o principal gate de decisão: a Sarah não consegue decidir nada sobre
                  um lead sem saber isto.

                  TRÊS renderizações, não uma, porque há três verdades diferentes: ficha ainda
                  carregando · ficha ilegível · ficha lida. Mostrar o botão em "indefinido" nos
                  dois primeiros casos faria a tela AFIRMAR que ninguém sabe da audiometria quando
                  o que aconteceu foi a leitura não ter chegado — e o clique seguinte gravaria por
                  cima de um valor que existia. */}
              <div className="pb-4">
                {!painel ? (
                  <div className="h-[92px] animate-pulse rounded-xl border-[1.5px] border-dashed border-linha-forte bg-branco" />
                ) : painel.ficha.valores == null ? (
                  <div className="rounded-xl border-[1.5px] border-dashed border-linha-forte bg-branco p-3">
                    <div className="text-[0.7rem] font-bold uppercase tracking-[0.07em] text-mute">Audiometria</div>
                    <p className="mt-1 text-[0.78rem] text-suave">
                      Não foi possível ler a ficha deste lead — reabra o card. Não marque no escuro.
                    </p>
                  </div>
                ) : (
                  <BotaoAudiometria
                    inicial={audiometriaDoValor(painel.ficha.valores[SLUG_AUDIOMETRIA])}
                    quandoTexto={textoHoraAudiometria(painel.ficha.valores)}
                    onMarcar={gravarAudiometria}
                  />
                )}
              </div>
            </div>

            {/* facts */}
            <div className="grid flex-shrink-0 grid-cols-2 gap-px border-b border-borda bg-borda">
              {/* W-D6: telefone, cidade e valor saíram daqui — já estão na identidade e nos
                  destaques. Sobram a origem (contexto) e o responsável (o único fato editável). */}
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
                {/* W-D6 · a conversa dentro do drawer (G6). Sem contagem: o número de mensagens não
                    decide nada; o que decide é o que a última diz, e isso está nos destaques. */}
                <AbaBtn ativa={aba === "conversa"} onClick={() => setAba("conversa")} rotulo="Conversa" />
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
                  {aba === "conversa" && (
                    <div className="-mx-5 -mb-8 flex flex-col">
                      <div className="max-h-[calc(100vh-560px)] min-h-[240px] overflow-y-auto bg-board px-5 py-4">
                        {conversa === undefined ? (
                          <p className="py-6 text-center text-[13px] text-mute">Carregando a conversa…</p>
                        ) : conversa === null ? (
                          <p className="py-6 text-center text-[13px] leading-relaxed text-mute">
                            Sem conversa registrada com este lead.
                            <br />
                            Quem chega por ligação ou indicação entra aqui quando responder no WhatsApp.
                          </p>
                        ) : (
                          <FioLead mensagens={conversa.mensagens} nomeLead={lead.nome ?? "Lead"} />
                        )}
                      </div>
                      {/* o atalho fica colado ao fio: leu, quer responder, o botão está onde o olho parou */}
                      <div className="sticky bottom-0 flex items-center gap-3 border-t border-linha bg-branco px-5 py-3">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-mute">
                          {conversa?.canal ? `pelo número ${conversa.canal}` : "responder abre a caixa de conversas"}
                        </span>
                        <button
                          type="button"
                          onClick={() => router.push(hrefResponder)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-3 py-1.5 text-xs font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
                        >
                          Responder na conversa
                          <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none" aria-hidden>
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </button>
                      </div>
                    </div>
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

function Destaque({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="mb-1 text-[11px] text-mute">{rotulo}</div>
      {children}
    </div>
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

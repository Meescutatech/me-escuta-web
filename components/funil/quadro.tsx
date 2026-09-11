"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnuncioArraste,
  ContadorColuna,
  OverlayArraste,
  PlaceholderArraste,
  TrilhoRolagem,
  useArrasteFunil,
  useFadeTrilho,
  type AlvoArraste,
  type EstadoArraste,
} from "./arraste";
import type { DadosFunil, CardLead, EtapaFunil } from "@/lib/dados/funil";
import { moverCardEtapa } from "@/app/(app)/funil/actions";
import { CartaoLead } from "./card-lead";
import { DrawerCard } from "./drawer-card";
import { FaixaBuscaServidor, useBuscaServidor } from "./busca-servidor";
import { BarraFiltros, ChipsFiltros } from "./barra-filtros";
import { SeletorOrdem } from "./seletor-ordem";
import {
  ordenarCards,
  prioridadeCard,
  ORDEM_PADRAO,
  type ChaveOrdem,
  type FaixaPrioridade,
  type SlaEtapas,
} from "@/lib/dados/funil-ordenacao";
import { ChipSemResponsavel } from "./faixa-sem-responsavel";
import type { LeadsSemResponsavel } from "@/lib/dados/identidades";
import { DialogoMotivoPerda } from "./motivo-perda";
import type { MotivoPerda } from "@/lib/dados/motivo-perda";
import {
  FILTROS_VAZIOS,
  contarSemProximaAcao,
  filtrarCards,
  haFiltro,
  type FiltrosFunil,
} from "@/lib/dados/funil-filtros";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import { SegmentoDepartamento } from "./segmento-departamento";
import { moedaCurta, resumoColuna } from "@/lib/dados/funil-calculos";
import type { EnsaioFunil } from "@/lib/ensaio/funil-extra";
import { BuscaJarvis, LinhaJarvis } from "./busca-jarvis";
import { VisoesSalvas } from "./visoes-salvas";
import { aplicarLeitura, interpretarBusca, type LeituraJarvis } from "@/lib/dados/funil-jarvis";
import { contarSituacao } from "./barra-filtros";
import { opcoesCidade } from "@/lib/dados/funil-filtros";
import { useProjecaoViva } from "@/components/projecao-viva";
import { novosIds } from "@/lib/tempo-real";
import { INTERVALOS, PISO_SEM_TEMPO_REAL } from "@/lib/intervalos-vivos";
import { cn } from "@/lib/utils";

/*
 * Board do FUNIL — redesign R9 (mockup r9-funil.html): colunas de 236px com cabeçalho
 * uppercase + contador mono em pill; etapas "faltou" em âmbar; GANHO/PERDIDO viram tiles
 * TERMINAIS compactos (fora do fluxo operacional, ainda droppáveis — a mecânica de
 * drag-and-drop/escrita pela porta é INTOCADA). O trilho colapsável da v2 morreu (os
 * terminais cobrem o caso). Board vivo da fase 1 preservado (polling + pulso-novo).
 */

function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function ehAlerta(etapa: EtapaFunil): boolean {
  return /faltou/i.test(etapa.chave) || /faltou/i.test(etapa.nome);
}

// ─────────────── coluna aberta (r9) ───────────────

function Coluna({
  etapa,
  cards,
  agora,
  sla,
  selecionadoId,
  pulsando,
  onAbrir,
  onResolverSugestao,
  faixaDe,
  nomePorId,
  arraste,
  alvo,
  propsCard,
}: {
  etapa: EtapaFunil;
  cards: CardLead[];
  agora: number;
  sla: SlaEtapas;
  selecionadoId: string | null;
  pulsando: ReadonlySet<string>;
  onAbrir: (id: string) => void;
  onResolverSugestao: (leadId: string, decisao: "aprovada" | "descartada") => void;
  faixaDe: (c: CardLead) => FaixaPrioridade;
  nomePorId: ReadonlyMap<string, string>;
  arraste: EstadoArraste | null;
  alvo: AlvoArraste | null;
  propsCard: (leadId: string, etapa: string, indice: number) => Record<string, unknown>;
}) {
  // W-D6 v5 · a lista SEM o card que está no ar: o buraco fecha, e o placeholder abre no destino.
  const visiveis = arraste ? cards.filter((c) => c.lead_id !== arraste.leadId) : cards;
  const alvoAqui = arraste && alvo?.etapa === etapa.chave ? alvo.indice : null;
  // o contador conta o DESTINO durante o arraste: −1 na origem, +1 no alvo
  const contagem =
    cards.length - (arraste?.etapaOrigem === etapa.chave ? 1 : 0) + (alvo?.etapa === etapa.chave && arraste ? 1 : 0);
  // W-D6 · o cabeçalho diz o que a coluna PESA: quantos, quanto vale, quantos estouraram o prazo
  // da etapa. A conta da faixa é a do board (`faixaDe`), nunca uma segunda (D55).
  const resumo = resumoColuna(cards, faixaDe);
  const soma = resumo.soma;
  return (
    // Regra do Diogo (10/09 23:20): "o tanto de espaço que estamos perdendo". A coluna deixou de ter
    // largura FIXA (w-coluna = 236px) e passou a PREENCHER: `flex-1` com `min-w-coluna`. Em 1920px
    // as sete colunas abrem para ~230→300px cada; abaixo do mínimo elas param de encolher e o board
    // rola na horizontal — a coluna nunca fica mais estreita do que o card foi desenhado para ter.
    /*
     * `flex-1` para PREENCHER (regra do Diogo 23:20) com `min-w-coluna` (236px) e um TETO de 420px:
     * medido em 11/09, ao filtrar por uma etapa só a coluna esticava para ~1800px e o card virava
     * uma faixa — coluna mais larga que 420px deixa de ser coluna.
     */
    <div className="flex h-full min-w-coluna max-w-[420px] flex-1 basis-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-1 pt-1.5">
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold uppercase tracking-[0.05em]",
            ehAlerta(etapa) ? "text-amarelo" : "text-suave",
          )}
          title={soma > 0 ? `${etapa.nome} · ${brl(soma)} em aberto` : etapa.nome}
        >
          {etapa.nome}
        </span>
        <ContadorColuna valor={contagem} />
      </div>
      {/* segunda linha: valor somado e os que passaram do prazo. Some inteira quando não há o que
          dizer (coluna vazia, sem valor e sem estourado) — "R$ 0 · 0 além do prazo" é ruído. */}
      {(soma > 0 || resumo.alemDoPrazo > 0) && (
        <div className="flex items-center gap-1.5 px-1 pb-2 font-mono text-[10.5px] tabular-nums text-mute">
          {soma > 0 && <span title={`${brl(soma)} em aberto nesta etapa`}>{moedaCurta(soma)}</span>}
          {soma > 0 && resumo.alemDoPrazo > 0 && <span aria-hidden>·</span>}
          {resumo.alemDoPrazo > 0 && (
            <span className="font-semibold text-vermelho" title="Leads que passaram do prazo da etapa (faixa AGORA)">
              {resumo.alemDoPrazo} além do prazo
            </span>
          )}
        </div>
      )}
      {soma === 0 && resumo.alemDoPrazo === 0 && <div className="pb-1.5" aria-hidden />}
      <div
        data-coluna={etapa.chave}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[10px] px-0.5 pb-8 pt-px transition-colors",
          alvoAqui != null && "bg-hover/60",
        )}
      >
        {visiveis.map((c, i) => (
          <Fragment key={c.lead_id}>
            {alvoAqui === i && <PlaceholderArraste altura={arraste!.altura} />}
            <div {...propsCard(c.lead_id, etapa.chave, i)} className={cn("shrink-0 touch-none", pulsando.has(c.lead_id) && "pulso-novo")}>
              <CartaoLead
                card={c}
                agora={agora}
                sla={sla}
                selecionado={c.lead_id === selecionadoId}
                onAbrir={onAbrir}
                onResolverSugestao={onResolverSugestao}
                nomePorId={nomePorId}
                pego={arraste?.porTeclado && arraste.leadId === c.lead_id}
              />
            </div>
          </Fragment>
        ))}
        {alvoAqui != null && alvoAqui >= visiveis.length && <PlaceholderArraste altura={arraste!.altura} />}
        {visiveis.length === 0 && alvoAqui == null && (
          <p className="rounded-lg border border-dashed border-linha px-1.5 py-3.5 text-center text-[12px] text-mute">
            Nenhum lead nesta etapa
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────── terminal compacto (ganho/perdido) ───────────────

function Terminal({ etapa, quantidade, alvo }: { etapa: EtapaFunil; quantidade: number; alvo: boolean }) {
  const ganho = etapa.tipo === "ganho";
  return (
    <div
      data-coluna={etapa.chave}
      className={cn(
        "rounded-[10px] border bg-branco px-3.5 py-3 transition-colors",
        alvo ? "border-laranja bg-laranja-cl" : "border-linha",
      )}
      title={`${etapa.nome} — arraste um card aqui pra fechar`}
    >
      <div
        className={cn(
          "text-[12.5px] font-semibold uppercase tracking-[0.05em]",
          ganho ? "text-verde" : "text-vermelho",
        )}
      >
        {etapa.nome}
      </div>
      <div className="mt-1 text-2xl font-[650] tracking-[-0.02em] tabular-nums text-tinta">
        {quantidade.toLocaleString("pt-BR")}
      </div>
      <div className="mt-1 font-mono text-[10.5px] text-mute">snapshot · sync futuro</div>
    </div>
  );
}

/*
 * F5 (27/08) · O QUE SAIU DAQUI, E PARA ONDE FOI.
 * A legenda "COR = PRIORIDADE …", o botão "Só os estourados" e o alerta "N% em AGORA — acima do
 * teto" viviam numa linha própria entre o cabeçalho e as colunas. Três coisas que a Sarah lia
 * todo dia e não podia resolver: o teto de 15% (D56) é decisão de GESTÃO (ajustar `sla_etapas`),
 * não da fila. A cor agora é o próprio papel do card (card-lead.tsx / FUNDO_FAIXA), e não precisa
 * de legenda para ser lida. A conta do teto virou dado para o dashboard: `resumoFaixas()` em
 * lib/dados/funil-ordenacao.ts. O aviso "prazos no padrão declarado (sem config)" continua —
 * é o único que muda a LEITURA do card, e fica no tooltip do contador.
 */

// ─────────────── board ───────────────

export function Quadro({
  dados,
  geradoEm,
  abrirLead = null,
  abaInicial = null,
  pergunta = null,
  autorEmail = null,
  autorId = null,
  mencionaveis = [],
  tiposTarefa = [],
  motivosPerda = [],
  motivosDaConfig = false,
  semResponsavel = null,
  papel = null,
  ensaio = null,
  fotos = {},
}: {
  dados: DadosFunil;
  /** hora da renderização server — carimbo "ao vivo · atualizado há Xs" */
  geradoEm: string;
  /** deep-link ?lead=<id> (vindo do painel da conversa): abre o drawer deste card ao montar */
  abrirLead?: string | null;
  /** W-D6 · deep-link ?aba=conversa|tarefas|… — a aba do drawer ao abrir (LiderHub `?tab=`) */
  abaInicial?: string | null;
  /**
   * W-D6 v4 · deep-link `?pergunta=...`: abre o board com a pergunta JÁ interpretada pelo Jarvis.
   * Serve para o link compartilhável ("olha esses aqui") e é o que torna o print reproduzível —
   * a mesma frase, os mesmos chips, sempre.
   */
  pergunta?: string | null;
  autorEmail?: string | null;
  autorId?: string | null;
  mencionaveis?: Mencionavel[];
  tiposTarefa?: TipoTarefa[];
  /** R20 — vocabulário de motivo de perda (config `motivo_perda`, com degrau para a semente) */
  motivosPerda?: MotivoPerda[];
  motivosDaConfig?: boolean;
  /** F5 · contagem de órfãos / aguardando de-para → chip ao lado do contador (R18/M3, era faixa) */
  semResponsavel?: LeadsSemResponsavel | null;
  /** W-D6 · papel de quem olha: o segmented de departamento só existe para admin/owner */
  papel?: "owner" | "admin" | "membro" | "marketing" | null;
  /** W-D6 · modo ensaio: painel + conversa por lead já calculados — o drawer não vai ao banco */
  ensaio?: EnsaioFunil | null;
  /** W-D6 v4 · id/nome → foto de perfil (`lib/ensaio/fotos.ts`); vazio fora do ensaio → iniciais */
  fotos?: Record<string, string>;
}) {
  const [cards, setCards] = useState<CardLead[]>(dados.cards);
  const [cardAberto, setCardAberto] = useState<string | null>(
    abrirLead && dados.cards.some((c) => c.lead_id === abrirLead) ? abrirLead : null,
  );
  const [selecionadoId, setSelecionadoId] = useState<string | null>(cardAberto);
  const [agora, setAgora] = useState<number>(() => Date.now());
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosFunil>(FILTROS_VAZIOS);
  /**
   * R23 protótipo (workshop 12/08) · a ordem começa em "prazo primeiro" e não em "como veio".
   * Ordem padrão é decisão de produto: o board abre respondendo "quem estourou", que é a
   * pergunta que a Sarah faz antes de qualquer outra.
   */
  const [ordem, setOrdem] = useState<ChaveOrdem>(ORDEM_PADRAO);
  /** W-D6 v4 · a última leitura do Jarvis (para a linha "entendi assim" sobreviver a re-render) */
  const [leitura, setLeitura] = useState<LeituraJarvis | null>(null);
  /** R20 — movimento para etapa `perdido` esperando o motivo. null = nenhum diálogo aberto. */
  const [perdaPendente, setPerdaPendente] = useState<{
    leadId: string;
    etapaDe: string;
    etapaAlvo: string;
    entrouAntes: string | null;
    nomeLead: string;
    etapaNome: string;
  } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // deep-link `?pergunta=`: interpreta UMA vez, ao montar — depois disso quem manda é a tela
  useEffect(() => {
    if (!pergunta) return;
    const r = interpretarBusca(pergunta, {
      etapas: dados.etapas,
      cidadesConhecidas: opcoesCidade(dados.cards).map((o) => o.rotulo),
      temUsuario: !!autorId,
    });
    if (!r.entendeu) return;
    setLeitura(r);
    setFiltros((f) => aplicarLeitura({ ...f, busca: pergunta }, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao montar: é uma porta de entrada
  }, [pergunta]);

  // ── board VIVO (Rodada 9): dica realtime (estado_lead/lead) + polling → router.refresh().
  // A publication supabase_realtime TEM as 6 tabelas core.* (conferido na fonte em 26/07); o
  // comentário anterior, que a dava como vazia, era falso e desviou o diagnóstico por 4 dias
  // (E-008). F4: o intervalo vem do módulo único e cai para o piso enquanto o tempo real não
  // estiver confirmado.
  const tempoRealBoard = useProjecaoViva(
    [
      { tabela: { schema: "core", table: "estado_lead" } },
      { tabela: { schema: "core", table: "lead" } },
    ],
    { intervaloMs: INTERVALOS.funil, pisoSemTempoRealMs: PISO_SEM_TEMPO_REAL },
  );

  // refresh → dados.cards novos: re-sincroniza o estado local (a VERDADE é a projeção) e faz
  // o card recém-chegado pulsar 1x. Move otimista em voo NÃO é sobrescrito (guarda movendoRef);
  // o próximo tick re-sincroniza.
  const movendoRef = useRef(0);
  const idsVistosRef = useRef<Set<string> | null>(null);
  const [pulsando, setPulsando] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (movendoRef.current > 0) return;
    setCards(dados.cards);
    const ids = dados.cards.map((c) => c.lead_id);
    const novos = novosIds(idsVistosRef.current ?? new Set(), ids, idsVistosRef.current === null);
    idsVistosRef.current = new Set(ids);
    if (novos.length > 0) {
      setPulsando(new Set(novos));
      const t = setTimeout(() => setPulsando(new Set()), 1600);
      return () => clearTimeout(t);
    }
  }, [dados.cards]);


  /**
   * A faixa de cada card, calculada UMA vez por passada e reusada pelo filtro, pela legenda e
   * pela ordenação. `prioridadeCard` roda por card a cada tick de minuto; sem o memo ela rodaria
   * de novo dentro de cada `sort` e de cada contagem.
   */
  const faixaPorLead = useMemo(() => {
    const m = new Map<string, FaixaPrioridade>();
    for (const c of cards) m.set(c.lead_id, prioridadeCard(c, dados.sla, agora).faixa);
    return m;
  }, [cards, dados.sla, agora]);
  const faixaDe = useMemo(
    () => (c: CardLead) => faixaPorLead.get(c.lead_id) ?? "sem_dado",
    [faixaPorLead],
  );

  // filtros da paridade Kommo (busca + responsável/etapa/tags/período + meus) — lógica pura testada
  const cardsFiltrados = useMemo(
    () => filtrarCards(cards, filtros, autorId, faixaDe),
    [cards, filtros, autorId, faixaDe],
  );
  const filtroAtivo = haFiltro(filtros);

  // W-D6 · uuid → primeiro nome, para o dono da próxima tarefa no card. Dos mencionáveis humanos,
  // que a página já injeta — nenhuma leitura a mais.
  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of mencionaveis) if (p.tipo === "humano") m.set(p.id, p.nome.split(" ")[0]);
    return m;
  }, [mencionaveis]);
  const podeRecortarDepartamento = papel === "admin" || papel === "owner";


  const porEtapa = useMemo(() => {
    const m = new Map<string, CardLead[]>();
    for (const e of dados.etapas) m.set(e.chave, []);
    for (const c of cardsFiltrados) {
      if (!m.has(c.etapa)) m.set(c.etapa, []);
      m.get(c.etapa)!.push(c);
    }
    // ordena DENTRO de cada coluna — a ordem é da pilha de trabalho, não do board inteiro
    for (const [chave, lista] of m) m.set(chave, ordenarCards(lista, ordem, agora, dados.sla));
    return m;
  }, [cardsFiltrados, dados.etapas, ordem, agora, dados.sla]);

  // filtro de etapa esconde as colunas fora da seleção (terminais incluídos) — como no Kommo
  const etapasVisiveis =
    filtros.etapas.length > 0 ? dados.etapas.filter((e) => filtros.etapas.includes(e.chave)) : dados.etapas;
  /*
   * W-D6 v4 · GANHO e PERDIDO são TILES (fora do fluxo operacional) — mas quando a pessoa PEDE
   * explicitamente por eles (filtro de etapa, ou a pergunta ao Jarvis "quem comprou e sumiu"), o
   * que ela quer ver são os LEADS, não um número. Pedido explícito vira coluna; o resto continua
   * tile. Medido em 11/09: sem isto, "quem comprou aparelho e sumiu há mais de 5 dias" respondia
   * com o tile "GANHO 3" e um board vazio — a interpretação certa e a resposta inútil.
   */
  const pedidoExplicito = (chave: string) => filtros.etapas.includes(chave);
  const abertas = etapasVisiveis.filter((e) => e.tipo === "aberto" || pedidoExplicito(e.chave));
  const terminais = etapasVisiveis.filter((e) => e.tipo !== "aberto" && !pedidoExplicito(e.chave));

  const chavesAbertas = useMemo(
    () => new Set(dados.etapas.filter((e) => e.tipo === "aberto").map((e) => e.chave)),
    [dados.etapas],
  );
  const leadsAtivos = useMemo(
    () => cards.filter((c) => chavesAbertas.has(c.etapa)).length,
    [cards, chavesAbertas],
  );
  const leadsAtivosFiltrados = useMemo(
    () => cardsFiltrados.filter((c) => chavesAbertas.has(c.etapa)).length,
    [cardsFiltrados, chavesAbertas],
  );
  // R20 — o contador do chip conta sobre os leads ATIVOS (lead perdido não tem próxima ação por
  // definição, e contá-lo faria o número virar ruído permanente).
  const semAcao = useMemo(
    () => contarSemProximaAcao(cards.filter((c) => chavesAbertas.has(c.etapa))),
    [cards, chavesAbertas],
  );

  // W-D6 v4 · facetas do grupo "Situação" (sobre os leads ATIVOS), uma passada só
  const contagens = useMemo(
    () => contarSituacao(cards.filter((c) => chavesAbertas.has(c.etapa)), autorId, faixaDe, agora),
    [cards, chavesAbertas, autorId, faixaDe, agora],
  );
  // vocabulário que o Jarvis pode citar — só o que existe no board de verdade
  const cidadesConhecidas = useMemo(() => opcoesCidade(cards).map((o) => o.rotulo), [cards]);
  const idPorNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of mencionaveis) if (p.tipo === "humano") m.set(p.nome.split(" ")[0], p.id);
    return (nome: string) => m.get(nome.split(" ")[0]);
  }, [mencionaveis]);

  /**
   * W-D6 v5 · o motor de arraste entrega só o par (lead, etapa destino). Tudo o que vem depois —
   * o diálogo de motivo da perda, o movimento otimista, o rollback — é o MESMO caminho de antes:
   * a mecânica do gesto mudou, a escrita pela porta não.
   */
  const aoMover = useCallback((leadId: string, _origem: string, etapaAlvo: string) => {

    const atual = cards.find((c) => c.lead_id === leadId);
    if (!atual || atual.etapa === etapaAlvo) return;

    // R20 — perder um lead exige dizer por quê. O card NÃO se move enquanto o diálogo estiver
    // aberto: o estado "perdido sem motivo" não chega a existir, nem por um instante de UI.
    // Cancelar deixa o card exatamente onde estava.
    const alvo = dados.etapas.find((e) => e.chave === etapaAlvo);
    if (alvo?.tipo === "perdido" && motivosPerda.length > 0) {
      setPerdaPendente({
        leadId,
        etapaDe: atual.etapa,
        etapaAlvo,
        entrouAntes: atual.entrou_etapa_em,
        nomeLead: atual.nome ?? "Este lead",
        etapaNome: alvo.nome,
      });
      return;
    }

    void aplicarMovimento(leadId, atual.etapa, etapaAlvo, atual.entrou_etapa_em);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `aplicarMovimento` é estável por escopo
  }, [cards, dados.etapas, motivosPerda.length]);

  // ── W-D6 v5 · o motor de arraste (pointer events + teclado). Ver `components/funil/arraste.tsx`.
  const ordemDaColuna = useCallback(
    (etapa: string) => (porEtapa.get(etapa) ?? []).map((c) => c.lead_id),
    [porEtapa],
  );
  const nomeDoLead = useCallback(
    (id: string) => cards.find((c) => c.lead_id === id)?.nome ?? "Lead",
    [cards],
  );
  const nomeDaEtapa = useCallback(
    (chave: string) => dados.etapas.find((e) => e.chave === chave)?.nome ?? chave,
    [dados.etapas],
  );
  const etapasDestino = useMemo(() => etapasVisiveis.map((e) => e.chave), [etapasVisiveis]);
  const { arraste, alvo, trilhoRef, propsCard, anuncio, x, y } = useArrasteFunil({
    onMover: aoMover,
    nomeDoLead,
    nomeDaEtapa,
    ordemDaColuna,
    etapasDestino,
  });
  const fade = useFadeTrilho(trilhoRef);
  const cardNoAr = arraste ? (cards.find((c) => c.lead_id === arraste.leadId) ?? null) : null;

  function abrirCard(id: string) {
    setSelecionadoId(id);
    setCardAberto(id);
  }

  function resolverSugestao(_leadId: string, decisao: "aprovada" | "descartada") {
    setToast(
      decisao === "aprovada"
        ? "Sugestão aprovada — vira evento após a validação."
        : "Sugestão descartada.",
    );
    setTimeout(() => setToast(null), 3500);
  }

  /**
   * A movimentação de verdade — separada do gesto de arrastar porque a perda entra por aqui
   * DEPOIS do diálogo de motivo, com o mesmo caminho otimista e o mesmo rollback.
   */
  async function aplicarMovimento(
    leadId: string,
    etapaDe: string,
    etapaAlvo: string,
    entrouAntes: string | null,
    motivo?: { chave: string; detalhe?: string },
  ) {
    setCards((prev) =>
      prev.map((c) =>
        c.lead_id === leadId ? { ...c, etapa: etapaAlvo, entrou_etapa_em: new Date().toISOString() } : c,
      ),
    );

    movendoRef.current += 1;
    let res;
    try {
      res = await moverCardEtapa(leadId, etapaDe, etapaAlvo, motivo);
    } finally {
      movendoRef.current -= 1;
    }
    if (!res.ok) {
      setCards((prev) =>
        prev.map((c) => (c.lead_id === leadId ? { ...c, etapa: etapaDe, entrou_etapa_em: entrouAntes } : c)),
      );
      setAviso(`Não foi possível mover: ${res.motivo ?? "erro"}`);
      setTimeout(() => setAviso(null), 5000);
    }
  }



  // R23 · busca no servidor: enxerga o banco inteiro (todas as etapas, sem o teto do board) e
  // devolve só o que NÃO está carregado aqui. O filtro do cliente segue recortando o board.
  const idsNoBoard = useMemo(() => new Set(cards.map((c) => c.lead_id)), [cards]);
  const busca = useBuscaServidor(filtros.busca, idsNoBoard);

  // O drawer precisa alcançar também o lead achado fora do board — senão a busca acha e não abre.
  const leadAberto: CardLead | null =
    cards.find((c) => c.lead_id === cardAberto) ??
    busca.foraDoBoard.find((c) => c.lead_id === cardAberto) ??
    null;
  // `todasEtapas` (e não `dados.etapas`) porque o lead achado pode estar numa etapa que não é
  // coluna — 'arquivado'. Procurar só entre as colunas devolveria null e o drawer perderia o nome.
  const etapaAberta = dados.todasEtapas.find((e) => e.chave === leadAberto?.etapa) ?? null;

  return (
    <div className="flex h-[calc(100vh-var(--altura-topo))] flex-col bg-board">
      {/* ── A BARRA, v4 (11/09 00:05) ──────────────────────────────────────────────────────────
          A faixa de carimbos ("31 leads ativos", "9 sem responsável", "ao vivo · atualizado há 5s")
          MORREU: nada ali era acionável. O que era útil virou filtro — "sem responsável" está em
          Situação, com a contagem ao lado. O frescor da tela não sumiu: ele é o próprio board, que
          se atualiza sozinho (`useProjecaoViva`); um carimbo dizendo "há 5s" era a tela pedindo
          crédito por respirar.

          UMA linha só, ocupando a largura: busca do Jarvis à esquerda (cresce), os cinco grupos de
          filtro no centro, e à direita visões salvas · departamento · ordem · Quadro|Lista. A
          segunda linha só existe quando há filtro: chips + "Limpar tudo" + a leitura do Jarvis. */}
      <div className="flex flex-shrink-0 flex-col gap-2 px-6 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <BuscaJarvis
            filtros={filtros}
            onChange={setFiltros}
            etapas={dados.etapas}
            cidadesConhecidas={cidadesConhecidas}
            temUsuario={!!autorId}
            qtdResultado={cardsFiltrados.length}
            leitura={leitura}
            onLeitura={setLeitura}
          />
          <BarraFiltros
            cards={cards}
            etapas={dados.etapas}
            filtros={filtros}
            onChange={(f) => {
              setFiltros(f);
              setLeitura(null); // mexeu num chip: a leitura do Jarvis deixou de descrever a tela
            }}
            meuId={autorId}
            contagens={contagens}
            fotos={fotos}
            idPorNome={idPorNome}
          />
          <div className="ml-auto flex items-center gap-2">
            <VisoesSalvas
              filtros={filtros}
              ordem={ordem}
              temFiltro={filtroAtivo}
              onAplicar={(f, o) => {
                setFiltros(f);
                setOrdem(o);
                setLeitura(null);
              }}
            />
            {podeRecortarDepartamento && (
              <SegmentoDepartamento
                valor={filtros.departamento}
                onChange={(chave) => setFiltros((f) => ({ ...f, departamento: chave }))}
              />
            )}
            <SeletorOrdem ordem={ordem} onChange={setOrdem} />
            {/* Quadro|Lista: a lista é a próxima rodada (visão em tabela, Twenty). O botão existe
                DESABILITADO com o motivo, e não escondido, porque esconder faria a pessoa procurar. */}
            <div className="flex h-9 items-center gap-px rounded-[8px] bg-hover p-[3px]" role="radiogroup" aria-label="Visão">
              <span role="radio" aria-checked className="h-full rounded-[5px] bg-branco px-2.5 text-[12.5px] font-medium leading-[26px] text-tinta shadow-[0_1px_2px_rgba(31,35,40,.08)]">
                Quadro
              </span>
              <span
                role="radio"
                aria-checked={false}
                aria-disabled
                title="A visão em lista chega na próxima rodada"
                className="h-full cursor-not-allowed rounded-[5px] px-2.5 text-[12.5px] leading-[26px] text-mute"
              >
                Lista
              </span>
            </div>
          </div>
        </div>

        {(filtroAtivo || leitura) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <ChipsFiltros
              filtros={filtros}
              etapas={dados.etapas}
              onChange={(f) => {
                setFiltros(f);
                setLeitura(null);
              }}
              qtdFiltrada={cardsFiltrados.length}
              qtdTotal={cards.length}
            />
            {leitura && (
              <span className="ml-auto min-w-0">
                <LinhaJarvis
                  leitura={leitura}
                  qtd={cardsFiltrados.length}
                  naoEntendi={false}
                  onDescartar={() => {
                    setLeitura(null);
                    setFiltros(FILTROS_VAZIOS);
                  }}
                />
              </span>
            )}
            {dados.corte && (
              <span
                className="rounded-full bg-laranja-cl px-2.5 py-0.5 text-[11.5px] font-medium text-laranja-esc"
                title="O board bateu no teto de leitura — paginação vem em rodada futura."
              >
                mostrando os {dados.cards.length} mais recentes
              </span>
            )}
            {aviso && <span className="rounded-full bg-vermelho-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-vermelho">{aviso}</span>}
          </div>
        )}
        {!filtroAtivo && aviso && (
          <span className="rounded-full bg-vermelho-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-vermelho">{aviso}</span>
        )}
      </div>

      {/* R23 · o que a busca achou FORA do board — logo abaixo do cabeçalho, antes das colunas,
          porque a resposta a "existe?" tem que chegar antes de o operador desistir e abrir o Kommo. */}
      <FaixaBuscaServidor
        estado={busca}
        todasEtapas={dados.todasEtapas}
        onAbrir={(leadId) => {
          setCardAberto(leadId);
          setSelecionadoId(leadId);
        }}
      />

      {/* ── O TRILHO — v5 (11/09): arraste próprio (pointer events), fade só do lado que esconde
          coluna, e barra de rolagem própria logo abaixo (a do macOS só aparece depois que a pessoa
          já está rolando — quem não sabe que há coluna à direita não descobre). */}
      <div className="relative min-h-0 flex-1">
        {fade.esquerda && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-board to-transparent" aria-hidden />
        )}
        {fade.direita && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-board to-transparent" aria-hidden />
        )}
        <div id="trilho-funil" ref={trilhoRef} className="flex h-full items-stretch gap-3 overflow-x-auto px-6 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {abertas.map((etapa) => (
            <Coluna
              key={etapa.chave}
              etapa={etapa}
              cards={porEtapa.get(etapa.chave) ?? []}
              agora={agora}
              sla={dados.sla}
              selecionadoId={selecionadoId}
              pulsando={pulsando}
              onAbrir={abrirCard}
              onResolverSugestao={resolverSugestao}
              faixaDe={faixaDe}
              nomePorId={nomePorId}
              arraste={arraste}
              alvo={alvo}
              propsCard={propsCard}
            />
          ))}
          {/* terminais: fora do fluxo operacional; seguem recebendo card (fechar = arrastar até lá) */}
          {terminais.length > 0 && (
            <div className="flex w-[200px] min-w-[200px] shrink-0 flex-col gap-2 pt-9">
              {terminais.map((etapa) => (
                <Terminal
                  key={etapa.chave}
                  etapa={etapa}
                  quantidade={(porEtapa.get(etapa.chave) ?? []).length}
                  alvo={alvo?.etapa === etapa.chave && arraste != null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <TrilhoRolagem alvoRef={trilhoRef} />

      {/* o card NO AR: sai da lista, segue o cursor, e o buraco fecha atrás dele */}
      {arraste && !arraste.porTeclado && cardNoAr && (
        <OverlayArraste x={x} y={y} largura={arraste.largura}>
          <CartaoLead card={cardNoAr} agora={agora} sla={dados.sla} selecionado onAbrir={() => {}} nomePorId={nomePorId} />
        </OverlayArraste>
      )}
      <AnuncioArraste texto={anuncio} />

      <DrawerCard
        lead={leadAberto}
        etapa={etapaAberta}
        etapas={dados.etapas}
        autorEmail={autorEmail}
        autorId={autorId}
        mencionaveis={mencionaveis}
        tiposTarefa={tiposTarefa}
        onFechar={() => setCardAberto(null)}
        agora={agora}
        ensaio={ensaio}
        abaInicial={abaInicial}
      />

      {perdaPendente && (
        <DialogoMotivoPerda
          nomeLead={perdaPendente.nomeLead}
          etapaNome={perdaPendente.etapaNome}
          motivos={motivosPerda}
          daConfig={motivosDaConfig}
          onCancelar={() => setPerdaPendente(null)}
          onConfirmar={(motivo) => {
            const p = perdaPendente;
            setPerdaPendente(null);
            void aplicarMovimento(p.leadId, p.etapaDe, p.etapaAlvo, p.entrouAntes, motivo);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-[6px] border border-linha-forte bg-branco px-4 py-2.5 text-sm text-navy shadow-forte">
          {toast}
        </div>
      )}
    </div>
  );
}

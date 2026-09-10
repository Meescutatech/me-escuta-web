"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CardLead, Origem } from "@/lib/dados/funil";
import { textoTempoCurto } from "@/lib/tempo";
import { sinalDoCard } from "@/lib/dados/funil-calculos";
import {
  dataUltimaMensagem,
  prioridadeCard,
  textoExcedente,
  FUNDO_FAIXA,
  ROTULO_FAIXA,
  TEXTO_COR_FAIXA,
  TEXTO_FAIXA,
  TRILHO_FAIXA,
  SLA_PADRAO_DECLARADO,
  type SlaEtapas,
} from "@/lib/dados/funil-ordenacao";
import { cn } from "@/lib/utils";

/*
 * Card ENXUTO do redesign Notion-minimalista (fase 1). Spec: kanban-v2.html §4/§5.
 *  - nome dominante (ou telefone quando o nome é lixo de anúncio) + telefone + 1 sinal + valor
 *  - kommo:id e metadados técnicos saem do card → tooltip nativo (title)
 *  - timer discreto no canto (warm quando parado)
 *  - barra de foco 2px laranja à esquerda quando selecionado
 *  - sugestão da Clara inline com ✓ / ✕ (agente propõe, humano valida)
 *  - chip de responsável = MAPA de 2 cores: laranja = IA (Clara), navy = humano
 *
 * R23 protótipo (workshop 12/08) — o argumento do supermercado, "3 segundos pra decidir se
 * pega o produto da prateleira":
 *  - TRILHO DE PRIORIDADE à esquerda + RÓTULO ESCRITO. Ele toma o lugar que a barra laranja de
 *    seleção ocupava — dois significados na mesma faixa seria a UI dizendo duas coisas com um
 *    traço só. Seleção virou anel laranja.
 *  - ÚLTIMA MENSAGEM + DATA: "a primeira coisa que ela quer saber é que dia foi que ele
 *    mandou isso". Some quando o dado não existe, nunca vira placeholder inventado.
 *
 * ── R23/W2 (22/08) · o que mudou, e por quê ──────────────────────────────────────────────────
 * A faixa era PRAZO com limiar GLOBAL hardcoded (>4 dias na etapa). Medido em 22/08: 97 dos 97
 * cards do board caíam em "estourado" — o mais novo estava há 18d23h na etapa. Cor que vale para
 * todo mundo não é cor.
 *
 * Agora é PRIORIDADE (D55): razão `horas_paradas ÷ prazo_da_etapa`, quatro faixas
 * (AGORA/HOJE/NA SEMANA/SEM PRESSA), prazo vindo de `core.config` chave `sla_etapas` (D56).
 * E o RÓTULO É ESCRITO junto da cor — WCAG 2.2 SC 1.4.1: num board de prioridade a pessoa precisa
 * saber QUAL nível é, e o par crítico aqui é vermelho × âmbar, que a protanopia aproxima.
 *
 * ⚠️ O timer do canto deixou de ter alarme PRÓPRIO. Ele acendia em `timer-velho`, que é o MESMO
 * hex do `amarelo` da faixa HOJE (#B27A00), com um limiar seu (`d >= 4`) seis linhas distante do
 * da faixa (`d > 4`). Resultado: card classificado AGORA (vermelho) exibia um timer da cor de
 * HOJE. Agora o destaque do timer deriva da MESMA faixa — uma fonte, um alarme.
 *
 * ── F5 (27/08) · a cor virou o PAPEL do card ─────────────────────────────────────────────────
 * O trilho de 3px não se lê varrendo uma coluna de 236px — a Sarah tinha de focar card a card.
 * Agora o FUNDO do card é a faixa (`FUNDO_FAIXA` → classes `.card-faixa-*` sobre tokens de tema em
 * globals.css, claro e escuro). O trilho fica como reforço. O rótulo "AGORA +771d" desceu um tom:
 * o papel já grita, o rótulo só nomeia (WCAG 1.4.1 continua atendido — ele é o canal escrito).
 * Faixa `sem_prazo` (etapa de entrada, workshop §6): papel neutro, sem rótulo, nunca AGORA.
 */

const ORIGEM_ROTULO: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

function moeda(v: number | null): string {
  if (v == null) return "";
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Formata telefone BR em (DD) 9XXXX-XXXX; devolve o original se não bater. */
function fmtTelefone(t: string | null): string {
  if (!t) return "";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/**
 * "Dado ruim é decisão de UI" (spec §5): nome null / lixo de anúncio ("Facebook Nº1052…") /
 * só dígitos → NÃO exibe. O título vira o telefone + rótulo discreto da origem.
 */
function nomeRuim(nome: string | null): boolean {
  if (!nome) return true;
  const n = nome.trim();
  if (n.length < 2) return true;
  if (/^(facebook|instagram|meta|whats?app|lead|cliente|contato|novo lead|sem nome)\b/i.test(n)) return true;
  if (/n[º°o]\s*\d/i.test(n)) return true; // "Nº1052"
  if (!/[a-zà-ú]/i.test(n)) return true; // sem letras (telefone puro etc.)
  return false;
}

/** Detecta responsável IA (Clara) pelo nome derivado do `dono`. Tudo mais = humano. */
function respEhIA(nome: string): boolean {
  return /clara|jarvis|\bia\b/i.test(nome);
}
function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1] ? p[1][0] : "")).toUpperCase();
}

function ChipResp({ nome, tipo }: { nome: string; tipo: "dm" | "sara" | "fono" }) {
  const ia = respEhIA(nome);
  return (
    <span
      title={nome}
      className={cn(
        "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[0.62rem] font-semibold text-branco",
        ia ? "bg-laranja" : "bg-navy", // laranja = IA · navy = humano (um único navy — spec da legenda)
      )}
    >
      {ia ? "C" : tipo === "fono" ? "F" : iniciais(nome)}
    </span>
  );
}

export function CartaoLead({
  card,
  agora,
  // opcional só por causa da página de protótipo, que roda sobre fixtures e não lê config; o
  // board SEMPRE passa o que leu do banco.
  sla = SLA_PADRAO_DECLARADO,
  selecionado,
  onAbrir,
  onResolverSugestao,
}: {
  card: CardLead;
  agora: number;
  /** prazo por etapa + limiares (config `sla_etapas`, ou o padrão DECLARADO) — D55/D56 */
  sla?: SlaEtapas;
  selecionado: boolean;
  onAbrir: (leadId: string) => void;
  onResolverSugestao?: (leadId: string, decisao: "aprovada" | "descartada") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card:${card.lead_id}`,
    data: { leadId: card.lead_id, etapa: card.etapa },
  });
  const [sugestaoResolvida, setSugestaoResolvida] = useState<null | "aprovada" | "descartada">(null);

  const ruim = nomeRuim(card.nome);
  const valor = moeda(card.valor);
  const origemLabel = card.origem ? ORIGEM_ROTULO[card.origem] : null;
  const timer = textoTempoCurto(card.entrou_etapa_em, agora);
  const prio = prioridadeCard(card, sla, agora);
  const faixa = prio.faixa;
  const grita = faixa === "agora"; // o único alarme do card — timer e trilho bebem da mesma fonte
  const excedente = textoExcedente(prio);
  const ultima = card.ultima_mensagem ?? null;
  const dataUltima = dataUltimaMensagem(ultima?.em, agora);

  // Por que esta prioridade, em palavras — o card nunca deve exigir que se adivinhe a conta.
  // Inclui o aviso de prazo NÃO declarado: etapa fora de `sla_etapas` cai no padrão, e isso
  // precisa ser dizível, senão o rótulo afirma uma urgência que ninguém definiu.
  const explicacao = [
    TEXTO_FAIXA[faixa],
    prio.horasParadas != null
      ? prio.horasPrazo == null
        ? `parado há ${Math.floor(prio.horasParadas)}h · etapa sem prazo`
        : `parado há ${Math.floor(prio.horasParadas)}h · prazo da etapa ${prio.horasPrazo}h`
      : null,
    prio.prazoDeclarado ? null : `prazo PADRÃO (${prio.horasPrazo}h) — "${card.etapa}" não está em sla_etapas`,
    prio.pausado ? "relógio pausado: há compromisso marcado no futuro" : null,
    sla.daConfig ? null : "os prazos são o padrão declarado — a config sla_etapas ainda não existe",
  ]
    .filter(Boolean)
    .join(" · ");

  // 1 sinal significativo (spec §4): quando o nome é lixo, o sinal é "Lead · <origem>";
  // com nome real, o sinal é a própria origem. Nada além disso no card.
  // H5: a cidade DECLARADA entra na MESMA linha do sinal ("Meta Ads · Contagem") — é o que a
  // Sara precisa para indicar clínica sem abrir o lead. Regra pura e testada em funil-calculos.
  const sinal = sinalDoCard(origemLabel, card.cidade, ruim);
  const sinalAds = card.origem === "meta";

  const titulo = [
    card.kommo_lead_id ? `kommo:${card.kommo_lead_id}` : null,
    origemLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  function resolver(ev: React.MouseEvent, decisao: "aprovada" | "descartada") {
    ev.stopPropagation();
    setSugestaoResolvida(decisao);
    onResolverSugestao?.(card.lead_id, decisao);
  }

  const mostraSugestao = card.proposta && !sugestaoResolvida;
  const nomeAgente = card.proposta?.agente === "lev" ? "Levindo" : "Clara";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => onAbrir(card.lead_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir(card.lead_id);
        }
      }}
      title={titulo || undefined}
      className={cn(
        "relative cursor-grab touch-none select-none overflow-hidden rounded-[10px] border py-[10px] pl-[13px] pr-3 transition-all",
        // o PAPEL do card é a faixa — fundo + hairline no mesmo tom (tokens de tema)
        FUNDO_FAIXA[faixa],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50",
        // seleção saiu da barra esquerda (agora é o prazo) e virou anel — mesma leitura, sem disputa
        selecionado
          ? "!border-laranja ring-[1.5px] ring-laranja/45"
          : "hover:shadow-[0_1px_6px_rgba(37,47,99,.08)]",
        isDragging && "opacity-40",
      )}
    >
      {/* TRILHO DE PRIORIDADE — o sinal de 3 segundos. A cor sozinha NÃO basta (WCAG 1.4.1): o
          rótulo escrito logo abaixo é o canal principal, a posição na coluna é o segundo, e o
          peso+ícone do timer é o terceiro. O `title` não conta como canal num board que se lê
          varrendo — ele explica a conta, não anuncia o nível. */}
      <span aria-hidden className={cn("absolute bottom-0 left-0 top-0 w-[3px] transition-colors", TRILHO_FAIXA[faixa])} />
      <span className="sr-only">{explicacao}. </span>

      {/* RÓTULO + EXCEDENTE. "AGORA · +3d" e não só "atrasado": sem o excedente, atrasado há 2h e
          atrasado há 142d viram a mesma coisa — que é literalmente o estado do Kommo hoje. */}
      {ROTULO_FAIXA[faixa] && (
        // eyebrow discreto: o papel já carrega a urgência; o rótulo só a nomeia. Peso 600, 10px,
        // opacidade cheia (contraste AA medido sobre o fundo da própria faixa — ver FUNDO_FAIXA).
        <div className="mb-[3px] flex items-baseline gap-1.5" title={explicacao}>
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase leading-none tracking-[0.05em]",
              TEXTO_COR_FAIXA[faixa],
            )}
          >
            {ROTULO_FAIXA[faixa]}
          </span>
          {excedente && (
            <span className={cn("shrink-0 font-mono text-[10px] font-medium leading-none opacity-80", TEXTO_COR_FAIXA[faixa])}>
              {excedente}
            </span>
          )}
          {prio.pausado && (
            // pausado não é uma quinta faixa: é a razão de o card estar quieto, dita em palavra
            <span className="shrink-0 text-[10px] leading-none text-suave">agendado</span>
          )}
          {!prio.prazoDeclarado && (
            // prazo que veio do padrão precisa ser VISÍVEL — default calado faz o rótulo mentir
            <span className="shrink-0 font-mono text-[10px] leading-none text-suave" title={explicacao}>
              prazo padrão
            </span>
          )}
        </div>
      )}

      <div className="flex items-start gap-2">
        <div
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-[1.25] text-tinta",
            ruim && "tabular-nums",
          )}
        >
          {ruim ? fmtTelefone(card.telefone) || "Lead sem telefone" : card.nome}
        </div>
        {/* o VALOR é a âncora da direita do topo; o CHIP é sempre do rodapé. Antes o chip subia
            para cá quando não havia valor, e o olho tinha de procurar o responsável em dois
            lugares conforme o card. Uma âncora só (benchmark §3.6, item 5). */}
        {valor && <span className="shrink-0 pt-px text-[0.82rem] font-semibold tabular-nums text-tinta">{valor}</span>}
      </div>

      {!ruim && card.telefone && (
        <div className="mt-0.5 text-[0.78rem] tabular-nums text-suave">{fmtTelefone(card.telefone)}</div>
      )}

      {/* ÚLTIMA MENSAGEM + DATA. A seta diz QUEM falou por último, que é o que separa "ele não
          respondeu" de "eu não respondi" — sem ela a linha mostra atividade e esconde a dívida.
          Desde 22/08 o dado VEM (3 colunas do contrato na `v_lead_card`; 71 dos 97 cards do board
          têm mensagem). Sem dado o bloco inteiro some — nunca vira placeholder inventado. */}
      {ultima && (
        <div className="mt-[7px] flex items-baseline gap-1.5">
          <span
            aria-hidden
            className={cn(
              "shrink-0 font-mono text-[10px] leading-none",
              ultima.de === "cliente" ? "text-navy" : "text-mute",
            )}
          >
            {ultima.de === "cliente" ? "\u2190" : "\u2192"}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[0.76rem] leading-snug",
              ultima.de === "cliente" ? "text-tinta" : "text-suave",
            )}
            title={ultima.texto}
          >
            {ultima.texto}
          </span>
          {dataUltima && (
            <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] font-semibold tabular-nums text-suave">
              {dataUltima}
            </span>
          )}
        </div>
      )}

      {(sinal || timer || card.responsavel) && (
        <div className="mt-2 flex items-center gap-2">
          {sinal && (
            <span
              className={cn(
                "inline-flex min-w-0 items-center gap-1.5 truncate text-[0.74rem] text-suave",
              )}
            >
              <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", sinalAds ? "bg-pt-ads" : "bg-mute")} />
              {sinal}
            </span>
          )}
          {timer && (
            <span
              className={cn(
                // peso 700 + ícone = terceiro canal não-cor (WCAG 1.4.1). O gatilho é `grita`,
                // derivado da MESMA faixa do trilho — não um segundo limiar com tinta própria.
                "ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[10.5px]",
                grita ? "font-bold text-vermelho" : "text-mute",
              )}
              title={explicacao}
            >
              {grita && (
                <svg viewBox="0 0 24 24" strokeWidth={2.4} className="h-3 w-3 stroke-current" fill="none">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4l2.5 1.5" strokeLinecap="round" />
                </svg>
              )}
              {timer}
            </span>
          )}
          {card.responsavel && (
            <span className={cn(!timer && "ml-auto")}>
              <ChipResp nome={card.responsavel.nome} tipo={card.responsavel.tipo} />
            </span>
          )}
        </div>
      )}

      {/* sugestão da IA inline — agente propõe, humano valida (spec §7) */}
      {mostraSugestao && card.proposta && (
        <div className="mt-[9px] flex items-center gap-[7px] border-t border-dashed border-linha-forte pt-2">
          <span className="min-w-0 flex-1 text-[0.72rem] leading-tight text-suave">
            <b className="font-semibold text-navy">{nomeAgente} sugere:</b>{" "}
            <span dangerouslySetInnerHTML={{ __html: card.proposta.texto }} />
          </span>
          <button
            type="button"
            onClick={(e) => resolver(e, "aprovada")}
            title="Aprovar sugestão"
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-laranja-cl text-laranja-esc transition-colors hover:bg-laranja hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] stroke-current" fill="none">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => resolver(e, "descartada")}
            title="Descartar"
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3 stroke-current" fill="none">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

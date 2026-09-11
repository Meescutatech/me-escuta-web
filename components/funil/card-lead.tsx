"use client";

import { useState } from "react";
import type { CardLead, Origem } from "@/lib/dados/funil";
import { classificarPrazo, textoPrazoCurto, type EstadoPrazo } from "@/lib/dados/funil-calculos";
import { textoTempoCurto } from "@/lib/tempo";
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
 *
 * ── W-D6 (10/09) · a PRÓXIMA TAREFA entrou no card, e é a linha que mais pesa ───────────────
 * Benchmark de tarefas §4 itens 1-2: o Kommo tem a régua "todo lead tem tarefa" e 97,9% das
 * abertas lá estão vencidas — régua sem UI não pune ninguém. Agora cada card diz QUAL é a próxima
 * ação, PARA QUANDO e DE QUEM, com o prazo em três tons: vermelho = vencida (falha), âmbar = hoje
 * (urgência), neutro = futura (meta). E o card SEM tarefa pendente ganha a linha "sem próxima ação"
 * em cinza: discreta porque não é urgência, presente porque é o lead que some em silêncio.
 * Também: cidade declarada (H5) na linha do telefone; origem virou ícone (o nome ia por extenso e
 * roubava a linha inteira); audiometria ✓/✗ (G4) só quando a ficha SABE — nunca pinta no escuro.
 * Estrutura do kanban aprovada em 31/08 preservada: faixa, título, valor, última mensagem, rodapé.
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

/**
 * Origem como GLIFO de 12px, não por extenso: "Meta Ads" ocupava a linha inteira do rodapé e
 * empurrava o timer. O nome continua acessível (`title` + sr-only) — o ícone é o canal rápido,
 * o texto é o canal completo. Um traço só, sem cor própria: cor no card é prioridade (D55).
 */
function IconeOrigem({ origem }: { origem: Origem }) {
  const comum = "h-3 w-3 shrink-0 stroke-current";
  if (origem === "wa")
    return (
      <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={comum} fill="none" aria-hidden>
        <path d="M21 12a9 9 0 0 1-13.3 7.9L3 21l1.2-4.5A9 9 0 1 1 21 12z" />
      </svg>
    );
  if (origem === "ig")
    return (
      <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={comum} fill="none" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </svg>
    );
  if (origem === "meta")
    return (
      <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={comum} fill="none" aria-hidden>
        <path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1z" />
        <path d="M16 9a3.5 3.5 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={comum} fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
    </svg>
  );
}

/** Tom do prazo da próxima tarefa: vermelho = falha, âmbar = urgência, neutro = meta. */
const TOM_PRAZO: Record<EstadoPrazo, string> = {
  vencida: "bg-vermelho-bg text-vermelho",
  hoje: "bg-amarelo-bg text-amarelo",
  futura: "bg-hover text-suave",
  sem_prazo: "bg-hover text-mute",
};

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
  nomePorId,
  pego = false,
}: {
  card: CardLead;
  agora: number;
  /** prazo por etapa + limiares (config `sla_etapas`, ou o padrão DECLARADO) — D55/D56 */
  sla?: SlaEtapas;
  selecionado: boolean;
  onAbrir: (leadId: string) => void;
  onResolverSugestao?: (leadId: string, decisao: "aprovada" | "descartada") => void;
  /** uuid → primeiro nome, para o dono da próxima tarefa (o board monta dos mencionáveis) */
  nomePorId?: ReadonlyMap<string, string>;
  /** v5 · pego pelo TECLADO (Espaço): o card fica no lugar, marcado, enquanto as setas escolhem */
  pego?: boolean;
}) {
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

  // W-D6 · próxima tarefa: `undefined` = não sabemos (linha não desenha); `null` = sem próxima ação
  const proxima = card.proxima_tarefa;
  const estadoPrazo = proxima ? classificarPrazo(proxima.prazo, agora) : null;
  const donoTarefaBruto = proxima
    ? (proxima.responsavel_id && nomePorId?.get(proxima.responsavel_id)) ||
      (proxima.responsavel ? proxima.responsavel.split("@")[0] : null)
    : null;
  // o dono da tarefa só aparece quando NÃO é o responsável do lead — esse já está no chip do
  // rodapé, e repetir "Sara" em cada linha comia o título da tarefa (medido no print: 3 palavras)
  const donoTarefa =
    donoTarefaBruto && card.responsavel && card.responsavel.nome.split(" ")[0].toLowerCase() === donoTarefaBruto.toLowerCase()
      ? null
      : donoTarefaBruto;
  const fechado = card.etapa === "ganho" || card.etapa === "perdido";

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

  // W-D6: a origem virou ÍCONE no rodapé; o texto só sobrevive quando o nome é lixo ("Lead"),
  // porque aí o card precisa de alguma palavra dizendo o que aquele telefone é.
  const sinal = ruim ? "Lead" : null;

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
    /*
     * v5 · o card deixou de ser `useDraggable` do dnd-kit: quem escuta o ponteiro é o contêiner
     * (`propsCard` em `arraste.tsx`), e aqui fica só o desenho + o gesto de ABRIR. O `tabIndex` e o
     * `role` vivem neste botão interno (`data-foco-card`) porque é ele que recebe o foco de volta
     * quando o card remonta em outra coluna.
     */
    <div
      data-foco-card
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(card.lead_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAbrir(card.lead_id);
        }
      }}
      aria-label={`${card.nome ?? "Lead"} — abrir. Espaço pega o card para mover entre etapas.`}
      title={titulo || undefined}
      className={cn(
        "relative cursor-grab touch-none select-none overflow-hidden rounded-[10px] border py-[10px] pl-[13px] pr-3 transition-all",
        // o PAPEL do card é a faixa — fundo + hairline no mesmo tom (tokens de tema)
        FUNDO_FAIXA[faixa],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50",
        // seleção saiu da barra esquerda (agora é o prazo) e virou anel — mesma leitura, sem disputa
        selecionado
          ? "!border-laranja ring-[1.5px] ring-laranja/45"
          : "hover:-translate-y-px hover:shadow-[0_2px_10px_rgba(37,47,99,.10)]",
        // v5 · pego pelo teclado: anel tracejado, para a pessoa ver O QUE está movendo
        pego && "!border-dashed !border-laranja ring-[1.5px] ring-laranja/35",
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

      {/* telefone + cidade DECLARADA (H5) na mesma linha: a cidade é o dado que a Sara usa para
          indicar clínica, e sai como a pessoa digitou — sem rótulo, sem capitalizar. */}
      {(!ruim && card.telefone) || card.cidade ? (
        <div className="mt-0.5 flex items-baseline gap-1.5 overflow-hidden text-[0.78rem] text-suave">
          {!ruim && card.telefone && <span className="shrink-0 whitespace-nowrap tabular-nums">{fmtTelefone(card.telefone)}</span>}
          {card.cidade && (
            <>
              {!ruim && card.telefone && <span aria-hidden className="text-mute">·</span>}
              <span className="min-w-0 truncate">{card.cidade}</span>
            </>
          )}
        </div>
      ) : null}

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

      {/* PRÓXIMA TAREFA — a linha que a régua do Kommo nunca teve (benchmark §4 itens 1-2).
          Três verdades, três desenhos: conhecida (título + prazo em tom + dono); nenhuma pendente
          ("sem próxima ação", cinza — alerta, não urgência); desconhecida (`undefined`: a leitura
          de tarefas não voltou → linha some, o card não acusa ninguém por falha de consulta).
          Lead fechado não tem próxima ação por definição e não ganha o alerta. */}
      {proxima ? (
        <div className="mt-[7px] flex items-center gap-1.5" title={`Próxima tarefa: ${proxima.titulo} · ${textoPrazoCurto(proxima.prazo, agora)}${donoTarefaBruto ? ` · ${donoTarefaBruto}` : ""}`}>
          <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 stroke-suave" fill="none" aria-hidden>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[0.76rem] leading-snug text-tinta">{proxima.titulo}</span>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[4px] px-1.5 py-px text-[10.5px] font-semibold leading-[1.35] tabular-nums",
              TOM_PRAZO[estadoPrazo ?? "sem_prazo"],
            )}
          >
            {textoPrazoCurto(proxima.prazo, agora)}
          </span>
          {donoTarefa && (
            <span className="shrink-0 max-w-[56px] truncate text-[10.5px] text-mute">{donoTarefa}</span>
          )}
        </div>
      ) : proxima === null && !fechado ? (
        <div className="mt-[7px] flex items-center gap-1.5 text-[0.74rem] text-mute" title="Nenhuma tarefa pendente — ninguém tem próximo passo marcado com este lead">
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeDasharray="2.6 2.2" className="h-3 w-3 shrink-0 stroke-current" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="8.5" />
          </svg>
          <span>sem próxima ação</span>
        </div>
      ) : null}

      {(sinal || card.origem || card.audiometria !== undefined || timer || card.responsavel) && (
        <div className="mt-2 flex items-center gap-2">
          {card.origem && (
            <span className="inline-flex shrink-0 items-center text-mute" title={origemLabel ?? undefined}>
              <IconeOrigem origem={card.origem} />
              <span className="sr-only">{origemLabel}</span>
            </span>
          )}
          {sinal && <span className="shrink-0 text-[0.74rem] text-suave">{sinal}</span>}
          {/* AUDIOMETRIA (G4): o principal gate de decisão da Sara. ✓ verde quando fez, ✗ discreto
              quando não fez, NADA quando a ficha não sabe — pintar "não fez" por ausência de dado
              mandaria a fono pedir um exame que talvez já esteja na foto da conversa. */}
          {card.audiometria === "fez" && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.72rem] font-medium text-verde" title="Audiometria feita">
              <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 stroke-current" fill="none" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              audiometria
            </span>
          )}
          {card.audiometria === "nao_fez" && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.72rem] text-mute" title="Ainda sem audiometria">
              <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3 stroke-current" fill="none" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              audiometria
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

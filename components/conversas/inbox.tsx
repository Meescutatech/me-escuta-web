"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConversaResumo, Mensagem, ModoConversa, SugestaoMensagem } from "@/lib/dados/conversas";
import {
  ROTULO_NAO_VISIVEL,
  chipDoNumero,
  rotuloSelo,
  vereditoEnvio,
  type SeloChip,
} from "./regras/numero.ts";
import {
  assumirConversa,
  carregarMaisConversas,
  devolverConversa,
  enviarMensagem,
  sinalizarPresenca,
  validarSugestaoMensagem,
} from "@/app/(app)/conversas/actions";
import { criarGatilhoDigitando } from "@/lib/conversas/presenca";
import { BolhaAudio } from "@/components/conversas/bolha-audio";
import { BolhaImagem } from "@/components/conversas/bolha-imagem";
import { Composer, type MidiaPronta } from "@/components/conversas/composer";
import { EstadoEntregaIcone } from "@/components/conversas/estado-entrega";
import { ehAudio, ehImagem, temImagemVisivel } from "@/lib/conversas/midia";
import { useConversaViva } from "@/components/conversas/tempo-real";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { montarEnvelopeAtividade } from "@/lib/presenca";
import {
  dataDaLista,
  fronteiraNaoLidas,
  montarBlocos,
  motivoErroPermanente,
  pendentesVivas,
  podeTentarDeNovo,
} from "@/lib/conversas/thread";
import { diasNaEtapa } from "@/lib/tempo";
import type { PainelLead } from "@/lib/dados/lead-painel";
import { FichaKommo } from "@/components/lead/ficha-kommo";
import { CartaoSugestaoTarefa } from "./sugestao-tarefa";
import { avaliarConversa } from "@/lib/conversas/sugestao-jarvis";
import { LinhaTarefaAutomatica } from "@/components/tarefas/tarefa-automatica";
import { criarSeNova, useFilaPrototipo } from "@/lib/tarefas/fila-prototipo";
import { ReguaFunil } from "@/components/regua-funil";
import { segmentosReguaLead } from "@/lib/dados/funil-calculos";
import type { EtapaFunil } from "@/lib/dados/funil";
import { TarefasLead } from "@/components/lead/tarefas-lead";
import { AnotacoesLead } from "@/components/lead/anotacoes-lead";
import { RegistroInterno } from "@/components/conversas/registro-interno";
import { itensDoDia, montarRegistros } from "@/lib/conversas/registro-timeline";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { TemplateMensagem, VariaveisTemplate } from "@/lib/templates";
import { cn } from "@/lib/utils";

/*
 * /conversas — redesign "Kommo minimalista" (fase 2) + thread real (rodada 4, SPEC RF-27..33).
 * Spec visual: Product_Management/Design/conversa-v2.html (3 zonas, tokens). Comportamento:
 * SPEC-PIPELINE-MENSAGENS — agrupamento de rajada 60s, checks de entrega da projeção da Trilha A
 * (check SOME quando não há status — nunca check mentiroso), separador de dia sticky, divider de
 * não-lidas + pill sem roubar scroll, lista viva, Realtime como dica + refetch como verdade,
 * optimistic UI que preserva o texto na falha. Lógica de escrita INTOCADA (actions/RPC-porta).
 */

const ORIGEM_ROTULO: Record<string, string> = {
  wa: "WhatsApp", whatsapp: "WhatsApp", ig: "Instagram", instagram: "Instagram",
  meta: "Meta Ads", "meta ads": "Meta Ads", facebook: "Meta Ads", ind: "Indicação", indicacao: "Indicação",
};

function fmtTelefone(t: string | null): string {
  if (!t) return "—";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1] ? p[1][0] : "")).toUpperCase();
}
/** nome null / lixo de anúncio → usa o telefone como título (mesma regra do funil). */
function nomeRuim(nome: string | null): boolean {
  if (!nome) return true;
  const n = nome.trim();
  if (n.length < 2) return true;
  if (/^(facebook|instagram|meta|whats?app|lead|cliente|contato|novo lead|sem nome)\b/i.test(n)) return true;
  if (/n[º°o]\s*\d/i.test(n)) return true;
  if (!/[a-zà-ú]/i.test(n)) return true;
  return false;
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Hora da lista: hoje→hh:mm · ontem→"ontem" · <7d→dia da semana · senão dd/mm. */
function tempoLista(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const agora = new Date();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const difDias = Math.round((hoje0 - dia0) / 86400000);
  if (difDias <= 0) return hhmm(iso);
  if (difDias === 1) return "ontem";
  if (difDias < 7) return DIAS[d.getDay()];
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function textoNaEtapa(iso: string | null | undefined): string {
  const dd = diasNaEtapa(iso ?? null, Date.now());
  if (dd == null) return "—";
  return dd === 0 ? "hoje" : dd === 1 ? "1 dia" : `${dd} dias`;
}

type Aba = "todas" | "clara" | "humano" | "nao_lidas";

export function Inbox({
  conversas,
  total,
  corte,
  proximoCursor,
  origemLegivel,
  selecionadaId,
  mensagens,
  sugestoes,
  painel,
  autorEmail,
  autorId,
  nomeAtendente,
  mencionaveis,
  tiposTarefa,
  templates,
  etapas,
  departamentoAtivo,
}: {
  conversas: ConversaResumo[];
  /** F22 · total do filtro NO SERVIDOR. `null` = indisponível → "50+", nunca "50". */
  total: number | null;
  /** F22 · existem conversas além das carregadas. */
  corte: boolean;
  /** F22 · cursor keyset da próxima página; `null` quando acabou. */
  proximoCursor: string | null;
  /**
   * M7 · `false` = `core.v_conversa` ainda não tem as colunas do chip (a `0094` não subiu neste
   * ambiente). O chip então **não é desenhado**, e isso é deliberado: sem `numero_apelido` todas
   * as conversas de número cadastrado sairiam como "número desconhecido", que é falso. Marca
   * ausente é honesta; marca errada não é.
   */
  origemLegivel: boolean;
  selecionadaId: string | null;
  mensagens: Mensagem[];
  sugestoes: SugestaoMensagem[];
  painel: PainelLead | null;
  autorEmail: string | null;
  autorId: string | null;
  /** Nome REAL de core.v_membro (nunca e-mail) — fonte do {{atendente}}; null = não resolve. */
  nomeAtendente: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  /** Templates ativos pro menu / do composer (SPEC-TEMPLATES §6). */
  templates: TemplateMensagem[];
  etapas: EtapaFunil[];
  /**
   * M6 · O departamento ativo, só para o ESTADO VAZIO ter nome e caminho de saída (C10). A lista
   * em si já chega escopada pelo servidor — este prop não filtra nada, e não pode passar a filtrar:
   * o dia em que ele decidir o que aparece, o escopo virou filtro de cliente.
   */
  departamentoAtivo?: { chave: string; rotulo: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  // pendentes = bolhas otimistas locais (RF-32); a lista do servidor é sempre a verdade e a
  // reconciliação remove a pendente quando a projeção confirma a mensagem (match por corpo).
  const [pendentes, setPendentes] = useState<Mensagem[]>([]);
  const [props_, setProps] = useState<SugestaoMensagem[]>(sugestoes);
  const [mode, setMode] = useState<ModoConversa>(selecionada?.mode ?? "IA");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("todas");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctxColapsado, setCtxColapsado] = useState(false);
  const [novas, setNovas] = useState(0); // pill "N novas" quando o scroll está lá em cima (RF-30)
  // F22 · páginas seguintes acumuladas no cliente. A página 1 vem do servidor por props.
  const [extras, setExtras] = useState<ConversaResumo[]>([]);
  const [cursor, setCursor] = useState<string | null>(proximoCursor);
  const [corteAtual, setCorteAtual] = useState(corte);
  const [totalAtual, setTotalAtual] = useState(total);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [fronteira, setFronteira] = useState<{ primeiraId: string; qtd: number } | null>(null);

  const rolagemRef = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  /**
   * R23 protótipo (workshop 12/08) · O JARVIS SUGERE A TAREFA.
   *
   * `agora` nasce null e só é preenchido depois da montagem: a página é renderizada no servidor, e
   * um Date.now() nos dois lados daria horas diferentes e hidratação divergente. Enquanto é null,
   * a sugestão simplesmente não existe — nenhum piscar de cartão errado.
   *
   * `decididas` guarda o que já foi aprovado/recusado NESTA TELA. O `.env.local` aponta para o
   * Supabase de produção, então a decisão morre aqui: aprovar não cria tarefa, recusar não grava
   * recusa. No sistema real cada uma vira evento no ledger com o nome de quem validou.
   */
  const [agoraJarvis, setAgoraJarvis] = useState<number | null>(null);
  const [decididas, setDecididas] = useState<Map<string, "aprovada" | "recusada">>(new Map());
  const filaPrototipo = useFilaPrototipo();
  useEffect(() => {
    setAgoraJarvis(Date.now());
    const t = setInterval(() => setAgoraJarvis(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const divisorRef = useRef<HTMLDivElement>(null);
  const noFimRef = useRef(true);
  const totalAnteriorRef = useRef(-1); // -1 = próxima renderização é abertura de conversa

  // Realtime (dica) + polling (fallback) → refetch das projeções (RF-9/32)
  useConversaViva(selecionadaId, true);

  // cada refetch re-sincroniza com o servidor (a verdade é a projeção; o rascunho/edição ficam)
  useEffect(() => {
    setProps(sugestoes);
    setMode(selecionada?.mode ?? "IA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestoes, selecionada?.mode]);

  // troca de conversa: zera estado local e calcula a fronteira de não-lidas UMA vez (RF-30)
  useEffect(() => {
    setPendentes([]);
    setEditando(null);
    setNovas(0);
    setFronteira(fronteiraNaoLidas(mensagens));
    noFimRef.current = true;
    totalAnteriorRef.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadaId]);

  // conversa_aberta no ledger (spec §5.2, D10): "viu e não respondeu" + base do indicador de
  // não-lida. Toda abertura conta; melhor esforço (métrica nunca atrapalha a operação).
  useEffect(() => {
    if (!selecionadaId) return;
    const supabase = criarClienteBrowser();
    void supabase
      .schema("api")
      .rpc("registrar_evento", {
        p: montarEnvelopeAtividade("conversa_aberta", { conversa_id: selecionadaId }, crypto.randomUUID()),
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }, [selecionadaId]);

  // PRESENÇA (Rodada 11): Sara abriu a conversa ⇒ marca a última recebida como lida no WhatsApp
  // (checks azuis pro cliente; a Meta marca as anteriores junto). Best-effort: fire-and-forget,
  // resultado ignorado — presença nunca vira erro de UI.
  const gatilhoDigitando = useRef(criarGatilhoDigitando()).current;
  useEffect(() => {
    if (selecionadaId) void sinalizarPresenca(selecionadaId, "lida");
  }, [selecionadaId]);

  // "digitando…" com throttle por conversa (~20s < 25s do indicador da Meta). Chamado pelo
  // composer a cada tecla; o gatilho decide quando realmente sinalizar.
  function aoDigitar() {
    if (!selecionadaId) return;
    if (gatilhoDigitando.deve(selecionadaId, Date.now())) {
      void sinalizarPresenca(selecionadaId, "digitando");
    }
  }

  // poda pendentes confirmadas do ESTADO, não só do render: confirmação é irreversível — se a
  // linha confirmada depois virar 'falhou', a pendente não pode ressuscitar como bolha fantasma
  // "aguardando fila" ao lado da bolha de erro (nem inflar visiveis.length → pill "1 nova" falsa).
  useEffect(() => {
    setPendentes((p) => {
      const vivas = pendentesVivas(p, mensagens);
      return vivas.length === p.length ? p : vivas;
    });
  }, [mensagens]);

  // mensagens visíveis = servidor + pendentes ainda não confirmadas pela projeção
  const visiveis = useMemo(
    () => [...mensagens, ...pendentesVivas(pendentes, mensagens)],
    [mensagens, pendentes],
  );

  const blocos = useMemo(() => montarBlocos(visiveis), [visiveis]);

  // R13/C2: notas e tarefas do lead viram registros no mesmo fio das mensagens
  const registros = useMemo(
    () =>
      painel
        ? montarRegistros(painel.anotacoes, painel.tarefas, painel.mencoes, mencionaveis)
        : [],
    [painel, mencionaveis],
  );

  // abertura → âncora no divider de não-lidas (ou no fim); mensagem nova → rola só se já estava
  // no fim, senão vira contador na pill — NUNCA rouba o scroll da Sara (RF-30)
  useEffect(() => {
    const total = visiveis.length;
    if (totalAnteriorRef.current === -1) {
      const alvo = divisorRef.current ?? fimRef.current;
      const centro = !!divisorRef.current;
      requestAnimationFrame(() => alvo?.scrollIntoView({ block: centro ? "center" : "end" }));
    } else if (total > totalAnteriorRef.current) {
      if (noFimRef.current) fimRef.current?.scrollIntoView({ behavior: "smooth" });
      else setNovas((v) => v + (total - totalAnteriorRef.current));
    }
    totalAnteriorRef.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis.length]);

  function aoRolar() {
    const el = rolagemRef.current;
    if (!el) return;
    const nf = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    noFimRef.current = nf;
    if (nf) setNovas(0);
  }

  function irProFim() {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
    setNovas(0);
  }

  // painel de contexto auto-recolhe em tela estreita (thread respira) — spec §2
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1180) setCtxColapsado(true);
  }, []);

  function avisar(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }

  // F22 · página 1 (servidor) + páginas acumuladas, sem repetir id. A dedup é cinto e suspensório
  // sobre o keyset: se uma conversa subir entre duas páginas, ela não aparece duas vezes.
  const carregadas = useMemo(() => {
    const vistos = new Set<string>();
    const juntas: ConversaResumo[] = [];
    for (const c of [...conversas, ...extras]) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      juntas.push(c);
    }
    return juntas;
  }, [conversas, extras]);

  // Lista nova vinda do servidor (router.refresh, tempo real) descarta as páginas acumuladas:
  // costurar página velha em lista nova é justamente como offset duplica e pula linha.
  const assinaturaServidor = conversas.map((c) => c.id).join(",");
  useEffect(() => {
    setExtras([]);
    setCursor(proximoCursor);
    setCorteAtual(corte);
    setTotalAtual(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaServidor, proximoCursor, corte, total]);

  async function carregarMais() {
    if (!cursor || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const r = await carregarMaisConversas(cursor, carregadas.length);
      setExtras((antes) => [...antes, ...r.conversas]);
      setCursor(r.proximoCursor);
      setCorteAtual(r.corte);
      setTotalAtual(r.total);
      if (r.conversas.length === 0 && r.proximoCursor) setCursor(null); // nunca laço infinito
    } catch {
      avisar("Não deu pra carregar mais conversas — tente de novo.");
    } finally {
      setCarregandoMais(false);
    }
  }

  // filtros da lista (RF-31): Todas · Clara conduz · Humano conduz · Não lidas
  const contagens = useMemo(
    () => ({
      todas: carregadas.length,
      clara: carregadas.filter((c) => c.mode === "IA").length,
      humano: carregadas.filter((c) => c.mode === "HUMANO").length,
      nao_lidas: carregadas.filter((c) => c.nao_lida).length,
    }),
    [carregadas],
  );

  /**
   * F22 · nenhum contador exibe o tamanho da página como se fosse o total.
   * "Todas" tem total de servidor (`head`-count) e mostra o número exato. As outras abas contam
   * sobre o que está CARREGADO — enquanto houver corte elas dizem "N+" ("pelo menos N"), porque
   * o predicado delas (modo, não-lida) não é contável no servidor sem a coluna que o F25 pede.
   * Um "+" a mais é honesto; um número redondo mentiroso é o defeito que este item existe pra tirar.
   */
  function rotuloContagem(k: Aba): string {
    if (k === "todas" && totalAtual != null) return totalAtual.toLocaleString("pt-BR");
    const n = contagens[k];
    return corteAtual ? `${n}+` : String(n);
  }

  const conversasVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return carregadas.filter((c) => {
      if (aba === "clara" && c.mode !== "IA") return false;
      if (aba === "humano" && c.mode !== "HUMANO") return false;
      if (aba === "nao_lidas" && !c.nao_lida) return false;
      if (!q) return true;
      return (c.nome ?? "").toLowerCase().includes(q) || (c.telefone ?? "").includes(q);
    });
  }, [carregadas, busca, aba]);

  function abrir(id: string) {
    router.push(`/conversas?c=${id}`);
  }

  function trocarModo(alvo: ModoConversa) {
    if (!selecionada || alvo === mode) return;
    const assumir = alvo === "HUMANO";
    setMode(alvo); // otimista
    startTransition(async () => {
      const r = assumir ? await assumirConversa(selecionada.id) : await devolverConversa(selecionada.id);
      if (!r.ok) {
        setMode(assumir ? "IA" : "HUMANO");
        avisar(`Falha no transbordo: ${r.motivo ?? "erro"}`);
      } else {
        avisar(assumir ? "Você assumiu — Clara pausou nesta conversa." : "Devolvido — Clara retoma.");
        router.refresh();
      }
    });
  }

  /**
   * Despacha texto OU mídia pro backend com bolha otimista; falha NÃO descarta o conteúdo
   * (RF-32). Mídia (rodada 6): o upload pro Storage já aconteceu no composer — aqui só emite o
   * evento estendido (D4) com o caminho; a bolha otimista carrega midia_caminho/mime e renderiza
   * com os MESMOS componentes das mensagens do servidor (signed URL de sessão).
   */
  function despachar(texto: string, midia?: MidiaPronta | null, idPendente?: string, templateId?: string | null) {
    if (!selecionada) return;
    // o id da bolha é também a chave de idempotência do evento (id_externo): retry da MESMA bolha
    // reusa a chave e a porta deduplica — nunca sai duplicado no WhatsApp por retry de rede.
    const id =
      idPendente ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    if (idPendente) {
      setPendentes((p) => p.map((m) => (m.id === id ? { ...m, falha_local: false } : m)));
    } else {
      setPendentes((p) => [
        ...p,
        {
          id,
          direcao: "saida",
          tipo_conteudo: midia ? midia.tipo : "texto",
          corpo: texto || null,
          criado_em: new Date().toISOString(),
          pendente: true,
          autor: mode === "HUMANO" ? "sara" : "clara",
          midia_caminho: midia?.caminho,
          midia_mime: midia?.mime,
        },
      ]);
      requestAnimationFrame(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
    // enviar derruba o "digitando…" na Meta — zera o throttle pra próxima digitação re-sinalizar já
    gatilhoDigitando.zerar(selecionada.id);
    startTransition(async () => {
      const r = await enviarMensagem(
        selecionada.id,
        texto,
        id,
        midia ? { caminho: midia.caminho, mime: midia.mime } : undefined,
        templateId ?? undefined,
      );
      if (r.ok) {
        router.refresh();
      } else {
        setPendentes((p) => p.map((m) => (m.id === id ? { ...m, falha_local: true } : m)));
        avisar(`Falha ao enviar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  /** "Tentar de novo" de falha LOCAL: reusa a mesma bolha/chave; mídia não sobe de novo. */
  function tentarDeNovoLocal(m: Mensagem) {
    const midia: MidiaPronta | null = m.midia_caminho
      ? {
          caminho: m.midia_caminho,
          mime: m.midia_mime ?? "",
          tipo: ehImagem(m.tipo_conteudo) ? "imagem" : "audio",
          legenda: m.corpo ?? null,
        }
      : null;
    despachar(m.corpo ?? "", midia, m.id);
  }

  /**
   * RF-28: reenvio de mensagem que a PROJEÇÃO marcou 'falhou' — evento NOVO na porta com o
   * mesmo conteúdo (a porta gera novo dedup_id; a falhada fica no ledger, imutável). Mídia
   * reusa o MESMO midia_caminho — o objeto segue no bucket. Sem bolha otimista aqui: a verdade
   * é a nova linha da projeção, que o refresh traz como 'na_fila'.
   */
  function reenviar(m: Mensagem) {
    if (!selecionada || (!m.corpo && !m.midia_caminho)) return;
    startTransition(async () => {
      const r = await enviarMensagem(
        selecionada.id,
        m.corpo ?? "",
        undefined,
        m.midia_caminho ? { caminho: m.midia_caminho, mime: m.midia_mime } : undefined,
      );
      if (r.ok) {
        avisar("Reenviado — nova tentativa na fila.");
        router.refresh();
      } else {
        avisar(`Falha ao reenviar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function aprovar(sug: SugestaoMensagem, textoFinal: string) {
    const editado = textoFinal.trim() !== sug.corpo.trim();
    setProps((p) => p.filter((s) => s.id !== sug.id));
    setEditando(null);
    setPendentes((p) => [
      ...p,
      {
        id: `apv-${sug.id}`,
        direcao: "saida",
        tipo_conteudo: "texto",
        corpo: textoFinal,
        criado_em: new Date().toISOString(),
        autor: "clara",
        pendente: true,
      },
    ]);
    startTransition(async () => {
      const r = editado
        ? await validarSugestaoMensagem(sug.id, "corrigida", { ...sug.payload, corpo: textoFinal })
        : await validarSugestaoMensagem(sug.id, "aprovada");
      if (r.ok) {
        avisar(editado ? "Resposta editada e aprovada — vai pra fila de envio." : "Resposta aprovada — vai pra fila de envio.");
        router.refresh();
      } else {
        setProps((p) => [sug, ...p]);
        setPendentes((p) => p.filter((m) => m.id !== `apv-${sug.id}`));
        avisar(`Falha ao validar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function descartar(sug: SugestaoMensagem) {
    setProps((p) => p.filter((s) => s.id !== sug.id));
    if (editando?.id === sug.id) setEditando(null);
    startTransition(async () => {
      const r = await validarSugestaoMensagem(sug.id, "rejeitada");
      if (r.ok) {
        avisar("Proposta descartada.");
        router.refresh();
      } else {
        setProps((p) => [sug, ...p]);
        avisar(`Falha ao descartar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  const modoClara = mode === "IA";
  const titulo = selecionada
    ? nomeRuim(selecionada.nome)
      ? fmtTelefone(selecionada.telefone)
      : selecionada.nome!
    : "";

  /**
   * A proposta do Jarvis para ESTA conversa. Sai da regra pura (`sugerirTarefa`), que lê o fio de
   * verdade — as mensagens que estão na tela — e devolve `null` na maioria das conversas. Isso é
   * o desenho, não uma limitação: agente que sugere algo em toda conversa vira ruído, e ruído é
   * como uma sugestão boa passa despercebida.
   */
  const despachoJarvis = useMemo(() => {
    if (agoraJarvis == null || !selecionada) return null;
    const eu = mencionaveis.find((m) => m.id === autorId && m.tipo === "humano");
    return avaliarConversa(visiveis, agoraJarvis, {
      nomeLead: titulo || "o cliente",
      responsavel: eu?.nome ?? "você",
    });
  }, [agoraJarvis, selecionada, visiveis, titulo, mencionaveis, autorId]);

  /**
   * D10 · tipo `auto` NÃO abre cartão: a tarefa nasce criada e vai para a fila. Aqui isso é
   * `sessionStorage` (o banco é o de produção), e a criação é idempotente pelo id da proposta —
   * a regra recalcula a cada minuto e devolveria a mesma tarefa para sempre.
   */
  useEffect(() => {
    if (despachoJarvis?.modo !== "criada" || agoraJarvis == null) return;
    criarSeNova({
      proposta: despachoJarvis.proposta,
      fundamento: despachoJarvis.fundamento,
      criadaEm: agoraJarvis,
    });
  }, [despachoJarvis, agoraJarvis]);

  /** A tarefa automática desta conversa, se ela já existe na fila. */
  const automaticaAqui =
    despachoJarvis?.modo === "criada"
      ? filaPrototipo.find((t) => t.proposta.id === despachoJarvis.proposta.id) ?? null
      : null;

  // §5.2: só variável CONFIÁVEL entra. Nome ruim (o título vira telefone) fica DE FORA —
  // "Oi (31) 98888-7777" não é mensagem; o placeholder literal trava o envio e a Sara completa.
  const variaveis: VariaveisTemplate = {
    ...(selecionada && !nomeRuim(selecionada.nome) ? { nome: selecionada.nome!.trim() } : {}),
    ...(selecionada?.telefone ? { telefone: fmtTelefone(selecionada.telefone) } : {}),
    ...(nomeAtendente ? { atendente: nomeAtendente } : {}),
  };

  // A separação é por `area` NULA, o carimbo de roteamento congelado que a leitura já traz. NÃO é
  // recorte de cliente sobre um resultado global: o escopo já entrou como predicado na consulta
  // (`clausulaEscopo`), e o que chega aqui é só o que o departamento ativo cobre. O que esta linha
  // faz é dizer QUAL PARTE do que chegou ainda não tem classificação.
  //
  // LIMITE, e é ARB-R18-03: o rótulo de departamento NÃO entra na linha da conversa nesta rodada.
  // Quem entra na linha é o chip de NÚMERO, do M7. Duas marcas competindo por atenção, uma delas
  // constante em 85% dos casos (73 de 86 conversas em `comercial`), é a coluna de valor único que
  // o próprio inbox já manda esconder.
  const comDepartamento = conversasVisiveis.filter((c) => c.area != null);
  const semDepartamento = conversasVisiveis.filter((c) => c.area == null);


  /**
   * Uma linha da lista. Virou função porque a lista passou a ter DUAS seções — as conversas
   * classificadas e a faixa "Sem departamento" (D6-g). Duplicar 50 linhas de JSX para pintar a
   * mesma linha em dois lugares é exatamente como as duas versões divergem três rodadas depois.
   */
  function linhaDaConversa(c: ConversaResumo) {
            const ativa = c.id === selecionadaId;
            const ia = c.mode === "IA";
            const ruim = nomeRuim(c.nome);
            const rotulo = ruim ? fmtTelefone(c.telefone) : c.nome!;
            const org = c.origem ? ORIGEM_ROTULO[c.origem.toLowerCase()] ?? c.origem : null;
            const prev = c.previa
              ? (c.previa_saida ? "Você: " : "") + c.previa
              : org
                ? `Lead · ${org}`
                : "—";
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={cn(
                  "relative flex w-full gap-2.5 rounded-[9px] p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
                  ativa ? "bg-hover" : "hover:bg-hover",
                )}
              >
                {ativa && <span className="absolute inset-y-[9px] left-0 w-[2px] rounded bg-laranja" />}
                <span
                  className={cn(
                    "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[0.72rem] font-semibold text-branco",
                    ia ? "bg-laranja" : "bg-navy",
                  )}
                  title={ia ? "Clara (IA)" : "Humano"}
                >
                  {ia ? "C" : c.nome ? iniciais(c.nome) : "S"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("flex-1 truncate text-[0.86rem] font-semibold text-navy", ruim && "tabular-nums")}>
                      {rotulo}
                    </span>
                    {/* F21: a hora da MENSAGEM (dataDaLista), nunca `atualizado_em` — sem data
                        na conversa sem mensagem é honesto; data de gravação disfarçada não é. */}
                    <span className="shrink-0 text-[0.72rem] text-mute">
                      {dataDaLista(c) ? tempoLista(dataDaLista(c)) : "sem data"}
                    </span>
                  </div>
                  <div className={cn("mt-0.5 truncate text-[0.78rem]", c.previa ? "text-suave" : "text-mute")}>
                    {prev}
                  </div>
                  {/* M7 · o chip de número: POR ONDE esta conversa entrou. Medido: 12 das 13
                      conversas visíveis hoje são do mesmo canal, e é justamente por serem quase
                      todas do mesmo que ninguém percebe qual. */}
                  {origemLegivel ? <ChipNumeroLinha c={c} /> : null}
                </div>
                {(c.nao_lidas_qtd ?? 0) > 0 ? (
                  <span className="mt-2.5 grid h-[17px] min-w-[17px] shrink-0 place-items-center self-start rounded-full bg-laranja px-1 text-[0.66rem] font-semibold leading-none text-branco">
                    {c.nao_lidas_qtd! > 9 ? "9+" : c.nao_lidas_qtd}
                  </span>
                ) : c.nao_lida ? (
                  <span className="mt-3 h-[7px] w-[7px] shrink-0 self-start rounded-full bg-laranja" />
                ) : null}
              </button>
            );
  }

  return (
    <div className="flex h-[calc(100vh-var(--altura-topo))] bg-board">
      {/* ═══════════ ZONA 1 · LISTA ═══════════ */}
      <aside className="flex w-[272px] shrink-0 flex-col border-r border-linha bg-branco">
        <div className="px-4 pb-2.5 pt-3.5">
          {/* M6: vira `h2` e FICA. Não é título de página — é o cabeçalho da coluna de 272px
              (`<aside className="flex w-[272px] ...">`). Um critério que a apagasse quebraria a
              coluna do inbox (SPEC-M6 §5.4, fronteira 2). */}
          <h2 className="mb-2.5 text-[15px] font-[650] leading-none text-tinta">Conversas</h2>
          <label className="flex items-center gap-2 rounded-lg border border-linha bg-board px-2.5 py-1.5 focus-within:border-linha-forte">
            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-[14px] w-[14px] shrink-0 stroke-mute" fill="none">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa, telefone…"
              className="w-full bg-transparent text-[0.82rem] text-tinta outline-none placeholder:text-mute"
            />
          </label>
        </div>
        <div className="flex gap-3 px-4 pb-1.5 pt-2.5">
          {([
            ["todas", `Todas · ${rotuloContagem("todas")}`],
            ["clara", `Clara · ${rotuloContagem("clara")}`],
            ["humano", `Humano · ${rotuloContagem("humano")}`],
            ["nao_lidas", `Não lidas · ${rotuloContagem("nao_lidas")}`],
          ] as [Aba, string][]).map(([k, rot]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={cn(
                "border-b-[1.5px] pb-1.5 text-[0.8rem] transition-colors focus-visible:outline-none",
                aba === k ? "border-navy font-semibold text-navy" : "border-transparent text-mute hover:text-tinta",
              )}
            >
              {rot}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-0.5">
          {conversasVisiveis.length === 0 && (
            /*
              C10 · DEPARTAMENTO VAZIO MOSTRA TEXTO, NUNCA TELA BRANCA — e o texto vem com o
              CAMINHO DE SAÍDA. Medido: `pos_venda` nasce com 0 conversas, 0 números e 1 agente
              desligado. Quem trocar para lá no dia 1 vê o app inteiro vazio, e sem uma frase que
              explique isso a pessoa lê como defeito do seletor novo.
              É a TERCEIRA vez nesta rodada que uma superfície nova nasceria sobre dado vazio (o
              sino, a tela de agentes e agora este) — por isso virou regra: superfície nova sobre
              dado vazio nasce com o texto que explica o vazio.
            */
            <p className="px-3 pt-6 text-center text-[0.8rem] text-mute">
              {conversas.length > 0
                ? "Nenhuma conversa aqui."
                : departamentoAtivo
                  ? `${departamentoAtivo.rotulo} ainda não tem conversa nem número. Configure um número para este departamento em Configurações → Números de WhatsApp.`
                  : "Nenhuma conversa ainda."}
            </p>
          )}
          {comDepartamento.map(linhaDaConversa)}

          {/*
            FAIXA "SEM DEPARTAMENTO" (D6-g) — e ela é ESCOPO, não enfeite.
            Sem a opção "Todos" (morta pelo D6-f), escopo estrito sobre a cobertura de hoje
            esconderia a maior parte do acervo: 608 de 680 leads não têm NENHUM dos dois caminhos
            de herança de departamento (cobertura medida: 10,6%). O que não tem classificação
            aparece aqui, nomeado, DENTRO do escopo ativo — incomoda em vez de desaparecer. A frase
            do Estaleiro, que entra com crédito porque é melhor que a minha: *sem essa faixa,
            escopo é indistinguível de perda de dado.*
            APARECE QUANDO TEM ITEM, SOME QUANDO NÃO TEM — regra da casa: zero é silêncio, não "0"
            (`app/(app)/configuracoes/layout.tsx:14-17`).
          */}
          {semDepartamento.length > 0 && (
            <div className="flex items-center gap-2 px-3 pb-1 pt-3">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-mute">
                Sem departamento
              </span>
              <span aria-hidden className="h-px flex-1 bg-linha" />
            </div>
          )}
          {semDepartamento.map(linhaDaConversa)}

          {/* F22 · o corte é DECLARADO, no molde do aviso do funil. Enquanto a busca for local,
              isso precisa estar na cara: ela só encontra o que já veio. */}
          {corteAtual && (
            <div className="flex flex-col items-center gap-2 px-3 pb-2 pt-3">
              <span className="text-center text-[0.72rem] text-mute">
                {totalAtual != null
                  ? `mostrando ${carregadas.length.toLocaleString("pt-BR")} de ${totalAtual.toLocaleString("pt-BR")} conversas`
                  : `mostrando as ${carregadas.length.toLocaleString("pt-BR")} mais recentes`}
                {busca.trim() ? " · a busca cobre só o que está carregado" : ""}
              </span>
              {cursor && (
                <button
                  onClick={carregarMais}
                  disabled={carregandoMais}
                  className="rounded-full bg-hover px-3 py-1 text-[0.76rem] font-medium text-navy transition-colors hover:bg-borda focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40 disabled:opacity-60"
                >
                  {carregandoMais ? "carregando…" : "Carregar mais"}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ═══════════ ZONA 2 · THREAD ═══════════ */}
      <section className="flex min-w-0 flex-1 flex-col bg-board">
        {!selecionada ? (
          <div className="m-auto text-center text-sm text-mute">
            {conversas.length > 0
              ? "Selecione uma conversa."
              : departamentoAtivo
                ? `${departamentoAtivo.rotulo} ainda não tem conversa. A primeira mensagem recebida num número deste departamento abre aqui — e o número se configura em Configurações → Números de WhatsApp.`
                : "Nenhuma conversa ainda — a primeira mensagem recebida no WhatsApp abre aqui."}
          </div>
        ) : (
          <>
            {/* header + posse */}
            <div className="flex flex-shrink-0 items-center gap-3.5 border-b border-linha bg-branco px-5 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[0.98rem] font-semibold leading-tight text-navy">{titulo}</div>
                <div className="mt-px truncate text-[0.76rem] text-suave">
                  {fmtTelefone(selecionada.telefone)}
                  {selecionada.etapa_nome && ` · ${selecionada.etapa_nome}`}
                  {` · ${modoClara ? "Clara" : "Sara"}`}
                </div>
                {/* M7 · no cabeçalho o número COMPLETO cabe: há espaço, e a pessoa já decidiu
                    olhar esta conversa. Na lista ele seria ruído — e é a coluna sensível. */}
                {origemLegivel ? <ChipNumeroCabecalho c={selecionada} /> : null}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-linha bg-board px-3 py-1 text-[0.78rem] text-suave",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", modoClara ? "bg-laranja" : "bg-navy")} />
                  {modoClara ? "Clara conduz" : "Sara conduz"}
                </span>
                <button
                  onClick={() => trocarModo(modoClara ? "HUMANO" : "IA")}
                  disabled={pending}
                  className="rounded-lg border border-linha-forte px-3 py-1.5 text-[0.78rem] font-semibold text-navy transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40 disabled:opacity-60"
                >
                  {modoClara ? "Assumir" : "Devolver à Clara"}
                </button>
              </div>
            </div>

            {/* mensagens — thread real (RF-27..33) */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={rolagemRef} onScroll={aoRolar} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5">
              {visiveis.length === 0 && props_.length === 0 && (
                <div className="m-auto max-w-sm text-center text-sm text-mute">Sem mensagens ainda nesta conversa.</div>
              )}
              {blocos.map((bloco, bi) => (
                <div key={bi} className="flex flex-col gap-3.5">
                  {/* separador de dia — chip sticky durante o scroll (RF-29) */}
                  <span className="sticky top-0 z-10 my-1 self-center rounded-full border border-linha bg-branco px-3 py-0.5 text-[0.71rem] text-mute shadow-suave">
                    {bloco.dia}
                  </span>
                  {itensDoDia(bloco, registros).map((item, gi) => {
                    // R13/C2: nota e tarefa entram no mesmo fio cronológico, em largura total
                    if (item.tipo === "registro") {
                      return <RegistroInterno key={`reg-${item.registro.id}`} registro={item.registro} />;
                    }
                    const grupo = item.grupo;
                    const saida = grupo.falante !== "cliente";
                    const comDivisor = fronteira && grupo.itens[0]?.id === fronteira.primeiraId;
                    return (
                      <div key={gi} className="flex flex-col gap-3.5">
                        {comDivisor && (
                          <div ref={divisorRef} className="my-1 flex items-center gap-3" aria-label="início das não lidas">
                            <span className="h-px flex-1 bg-linha-forte" />
                            <span className="rounded-full bg-laranja-cl px-3 py-0.5 text-[0.7rem] font-semibold text-laranja-esc">
                              {fronteira.qtd === 1 ? "1 não lida" : `${fronteira.qtd} não lidas`}
                            </span>
                            <span className="h-px flex-1 bg-linha-forte" />
                          </div>
                        )}
                        {/* grupo de rajada: mesmo falante + 60s → bolhas coladas (3px), meta só na última (RF-27) */}
                        <div className={cn("flex max-w-[66%] flex-col gap-[3px]", saida ? "self-end items-end" : "self-start items-start")}>
                          {grupo.itens.map((m, mi) => {
                            const primeira = mi === 0;
                            const ultima = mi === grupo.itens.length - 1;
                            const falhou = m.status_entrega === "falhou" || m.falha_local;
                            const motivo = motivoErroPermanente(m.erro_codigo);
                            const podeRetry = podeTentarDeNovo(m);
                            return (
                              <div key={m.id} className={cn("flex flex-col", saida ? "items-end" : "items-start")}>
                                <div
                                  className={cn(
                                    "whitespace-pre-wrap break-words px-3.5 py-2.5 text-[0.88rem] leading-relaxed",
                                    saida
                                      ? "rounded-[13px] rounded-br-[5px] bg-bolha-out text-tinta"
                                      : "rounded-[13px] rounded-bl-[5px] border border-linha bg-bolha-in text-tinta",
                                    saida && !primeira && "rounded-tr-[5px]",
                                    !saida && !primeira && "rounded-tl-[5px]",
                                    falhou && "border border-vermelho-bd bg-vermelho-bg",
                                  )}
                                >
                                  <ConteudoBolha m={m} />
                                </div>
                                {falhou ? (
                                  <div className="mt-[3px] flex items-center gap-2 px-1 text-[0.7rem] text-vermelho">
                                    <span>
                                      não entregue{motivo ? ` — ${motivo}` : m.falha_local ? " — falha ao enfileirar" : m.erro_codigo ? ` — erro ${m.erro_codigo}` : ""}
                                    </span>
                                    {podeRetry && (
                                      <button
                                        onClick={() => (m.falha_local ? tentarDeNovoLocal(m) : reenviar(m))}
                                        disabled={pending}
                                        className="font-semibold underline underline-offset-2 hover:text-tinta disabled:opacity-50"
                                      >
                                        Tentar de novo
                                      </button>
                                    )}
                                  </div>
                                ) : ultima ? (
                                  <div className="mt-[3px] px-1 text-[0.68rem] tabular-nums text-mute">
                                    {saida && grupo.falante === "clara" && <b className="font-medium text-laranja">Clara</b>}
                                    {saida && grupo.falante === "sara" && <b className="font-medium text-navy">Você</b>}
                                    {saida ? " · " : ""}
                                    {hhmm(m.criado_em)}
                                    {saida && (
                                      <span className="ml-1.5">
                                        {m.pendente ? (
                                          <>
                                            <EstadoEntregaIcone estado="na_fila" />
                                            <span className="ml-1">aguardando fila</span>
                                          </>
                                        ) : (
                                          <EstadoEntregaIcone estado={m.status_entrega} />
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* sugestão da Clara — card branco, acento na borda esquerda (só no modo Clara) */}
              {modoClara &&
                props_.map((s) => {
                  const emEdicao = editando?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      className="self-stretch rounded-[11px] border border-linha border-l-[3px] border-l-laranja bg-branco px-4 py-3.5 shadow-[0_1px_6px_rgba(37,47,99,.05)]"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-[0.76rem] font-semibold text-laranja-esc">Clara sugere</span>
                        <span className="text-[0.72rem] text-mute">· resposta ao paciente · não enviada</span>
                      </div>
                      {emEdicao ? (
                        <textarea
                          autoFocus
                          value={editando!.texto}
                          onChange={(e) => setEditando({ id: s.id, texto: e.target.value })}
                          rows={4}
                          className="w-full resize-none rounded-md border border-linha-forte bg-board px-3 py-2 text-[0.9rem] leading-relaxed text-navy outline-none focus:border-foco-comp focus:bg-branco"
                        />
                      ) : (
                        <p className="text-[0.9rem] leading-relaxed text-navy">{s.corpo}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => aprovar(s, emEdicao ? editando!.texto : s.corpo)}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-laranja px-4 py-2 text-[0.82rem] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50 disabled:opacity-50"
                        >
                          <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          {emEdicao ? "Salvar e enviar" : "Aprovar e enviar"}
                        </button>
                        {emEdicao ? (
                          <button
                            onClick={() => setEditando(null)}
                            className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
                          >
                            Cancelar
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditando({ id: s.id, texto: s.corpo })}
                            className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
                          >
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => descartar(s)}
                          disabled={pending}
                          className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta disabled:opacity-50"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  );
                })}
              {/* R23 · a sugestão de TAREFA do Jarvis fecha o fio: ela é sobre o que fazer a
                  seguir, então mora colada no composer, onde a decisão acontece. A sugestão de
                  MENSAGEM da Clara (acima) continua no lugar dela — são propostas diferentes. */}
              {despachoJarvis?.modo === "propor" && (
                <CartaoSugestaoTarefa
                  // `key` pelo id: mensagem nova = proposta nova, e o cartão renasce zerado
                  key={despachoJarvis.proposta.id}
                  sugestao={despachoJarvis.proposta}
                  fundamento={despachoJarvis.fundamento}
                  decisaoInicial={decididas.get(despachoJarvis.proposta.id) ?? null}
                  onDecidir={(id, d) => setDecididas((m) => new Map(m).set(id, d))}
                />
              )}
              {/* D10 · tipo `auto`: sem cartão, sem clique. A tarefa JÁ existe — o fio só
                  informa, com o motivo à vista e o desfazer do lado. */}
              {automaticaAqui && (
                <LinhaTarefaAutomatica key={automaticaAqui.proposta.id} tarefa={automaticaAqui} compacta />
              )}
              <div ref={fimRef} />
            </div>

            {/* pill de novas mensagens — aparece quando o scroll está lá em cima; clique desce (RF-30) */}
            {novas > 0 && (
              <button
                onClick={irProFim}
                className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-[0.78rem] font-semibold text-branco shadow-forte transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
                  <path d="M12 5v14m0 0-6-6m6 6 6-6" />
                </svg>
                {novas === 1 ? "1 nova" : `${novas} novas`}
              </button>
            )}
            </div>

            {/* composer sensível ao modo — texto + anexo + gravador (rodada 6, composer.tsx) */}
            <Composer
              origem={
                origemLegivel
                  ? vereditoEnvio({
                      phone_number_id: selecionada.phone_number_id ?? null,
                      numero_apelido: selecionada.numero_apelido ?? null,
                      numero_e164: selecionada.numero_e164 ?? null,
                      finalidade: selecionada.finalidade ?? null,
                      // a view não expõe `ativo` do canal; `visivel_inbox` já depende dele, e a
                      // conversa está NA LISTA, então o canal está ligado. "não sei" honesto.
                      canal_ativo: null,
                    })
                  : null
              }
              modoClara={modoClara}
              pending={pending}
              leadId={selecionada.lead_id ?? null}
              conversaId={selecionada.id}
              nomeLead={titulo}
              mencionaveis={mencionaveis}
              tiposTarefa={tiposTarefa}
              templates={templates}
              variaveis={variaveis}
              autorId={autorId}
              autorEmail={autorEmail}
              onEnviarTexto={(texto, templateId) => despachar(texto, undefined, undefined, templateId)}
              onEnviarMidia={(midia) => despachar(midia.legenda ?? "", midia)}
              onDigitar={aoDigitar}
              aoPublicar={() => router.refresh()}
              avisar={avisar}
            />
          </>
        )}
      </section>

      {/* ═══════════ ZONA 3 · CONTEXTO DO LEAD ═══════════ */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-l border-linha bg-branco transition-[width] duration-150",
          // r9: painel do lead com anatomia Kommo — 368px (token w-painel)
          ctxColapsado ? "w-[46px]" : "w-painel",
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-linha px-4 py-3", ctxColapsado && "justify-center px-0")}>
          {!ctxColapsado && <span className="text-[0.8rem] font-semibold text-tinta">Contexto do lead</span>}
          <button
            onClick={() => setCtxColapsado((v) => !v)}
            title={ctxColapsado ? "Expandir" : "Recolher"}
            aria-label={ctxColapsado ? "Expandir contexto" : "Recolher contexto"}
            className={cn(
              "grid h-[26px] w-[26px] place-items-center rounded-md text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
              !ctxColapsado && "ml-auto",
            )}
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
              <path d={ctxColapsado ? "m11 17-5-5 5-5M18 17l-5-5 5-5" : "m13 17 5-5-5-5M6 17l5-5-5-5"} />
            </svg>
          </button>
        </div>

        {!ctxColapsado && selecionada && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* header do lead (r9): nome + #id mono + link pro card + tags + funil-linha + régua */}
            <div className="px-[18px] pt-3.5">
              <div className="flex items-baseline gap-2">
                <h2 className="min-w-0 truncate text-[17px] font-[650] leading-[1.2] text-tinta">{titulo}</h2>
                {selecionada.kommo_lead_id && (
                  <span className="shrink-0 font-mono text-[11.5px] text-suave">#{selecionada.kommo_lead_id}</span>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/funil${selecionada.lead_id ? `?lead=${selecionada.lead_id}` : ""}`)}
                  title="Abrir card no funil"
                  aria-label="Abrir card no funil"
                  className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-mute hover:bg-hover hover:text-navy"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
                    <path d="M7 17 17 7M9 7h8v8" />
                  </svg>
                </button>
              </div>
              <div className="mt-0.5 font-mono text-[11.5px] text-suave">{fmtTelefone(selecionada.telefone)}</div>
              {(selecionada.tags ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(selecionada.tags ?? []).map((t) => (
                    <span key={t} className="rounded-full bg-laranja-cl px-2 py-0.5 text-[11.5px] font-medium text-laranja-esc">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 text-[12.5px] text-suave">
                Funil de vendas ·{" "}
                <b className="font-semibold text-tinta">{selecionada.etapa_nome ?? "sem etapa"}</b>{" "}
                {selecionada.entrou_etapa_em && (
                  <span className="font-mono text-[11px]">({textoNaEtapa(selecionada.entrou_etapa_em)} na etapa)</span>
                )}
              </div>
              <div className="mt-2">
                <ReguaFunil
                  segmentos={segmentosReguaLead(
                    etapas.filter((e) => e.tipo === "aberto"),
                    selecionada.etapa ?? null,
                  )}
                  rotulo={`Progresso no funil: ${selecionada.etapa_nome ?? "sem etapa"}`}
                />
              </div>
            </div>

            {/* ficha réplica Kommo + Tarefas/Anotações como abas (R8 por baixo — mesma porta) */}
            {selecionada.lead_id && painel ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <FichaKommo
                  leadId={selecionada.lead_id}
                  ficha={painel.ficha}
                  aoAtualizar={() => router.refresh()}
                  abasExtras={[
                    {
                      chave: "aba-tarefas",
                      rotulo: "Tarefas",
                      contagem: painel.tarefas.filter((t) => t.status !== "concluida").length,
                      conteudo: (
                        <TarefasLead
                          leadId={selecionada.lead_id}
                          tarefas={painel.tarefas}
                          mencionaveis={mencionaveis}
                          tiposTarefa={tiposTarefa}
                          autorId={autorId}
                          autorEmail={autorEmail}
                          aoAtualizar={() => router.refresh()}
                        />
                      ),
                    },
                    {
                      chave: "aba-notas",
                      rotulo: "Anotações",
                      contagem: painel.anotacoes.length,
                      conteudo: (
                        <AnotacoesLead
                          leadId={selecionada.lead_id}
                          anotacoes={painel.anotacoes}
                          mencoes={painel.mencoes}
                          mencionaveis={mencionaveis}
                          meuId={autorId}
                          autorEmail={autorEmail}
                          aoAtualizar={() => router.refresh()}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            ) : (
              <p className="mt-4 border-t border-linha px-[18px] pt-3 text-[12.5px] leading-relaxed text-mute">
                Conversa ainda sem lead vinculado — a ficha aparece quando o lead existir no funil.
              </p>
            )}
          </div>
        )}
      </aside>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-md border border-linha-forte bg-branco px-4 py-2.5 text-sm text-navy shadow-[0_6px_26px_rgba(37,47,99,.12)]">
          {toast}
        </div>
      )}
    </div>
  );
}


/**
 * Conteúdo da bolha por tipo (RF-33, degradação HONESTA): a pipeline de mídia (container
 * me-escuta-midia) ainda não existe — áudio/imagem/documento aparecem nomeados, com a
 * transcrição/visualização anunciada como pendente em vez de player quebrado ou URL da Meta.
 */
function ConteudoBolha({ m }: { m: Mensagem }) {
  const tipo = (m.tipo_conteudo ?? "text").toLowerCase();
  if (tipo === "text" || tipo === "texto") {
    return m.corpo ? <>{m.corpo}</> : <span className="italic opacity-70">[mensagem vazia]</span>;
  }
  if (ehAudio(tipo)) {
    // player quando a mídia já está no bucket; degrade honesto quando não (bolha-audio.tsx)
    return <BolhaAudio m={m} />;
  }
  if (temImagemVisivel(m)) {
    // foto (in e out) quando a mídia já está no bucket; sem caminho cai no rótulo de sempre
    return <BolhaImagem m={m} />;
  }
  // tipos em PT-BR = contrato do ingestor (parser TIPO_PT); os em EN cobrem linhas históricas
  const rotulo =
    tipo === "image" || tipo === "imagem"
      ? "Foto recebida"
      : tipo === "document" || tipo === "documento"
        ? "Documento recebido"
        : tipo === "video"
          ? "Vídeo recebido"
          : tipo === "sticker" || tipo === "figurinha"
            ? "Figurinha"
            : tipo === "location" || tipo === "localizacao"
              ? "Localização recebida"
              : tipo === "contacts" || tipo === "contato"
                ? "Contato recebido"
                : tipo === "reaction" || tipo === "reacao"
                  ? "Reação"
                  : `Mensagem (${tipo})`;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-medium">
        <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 stroke-suave" fill="none">
          <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3z" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-4.5-4.5L7 20" />
        </svg>
        {rotulo}
      </span>
      {m.corpo ? (
        <span className="text-[0.84rem] text-suave">{m.corpo}</span>
      ) : (
        <span className="text-[0.76rem] italic text-mute">visualização chega com a pipeline de mídia</span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// M7 · O CHIP DE NÚMERO (SPEC-M7 §5.1)
//
// Responde "por onde ela falou comigo?", que a tela hoje não responde. A regra pura vive em
// `regras/numero.ts` e é testada lá; aqui é só desenho.
//
// DUAS COISAS QUE NÃO PODEM SER "SIMPLIFICADAS":
//
//  1. O selo TESTE **não se esconde por valor único**, e o chip é por LINHA justamente para que
//     isso seja impossível de burlar — ele não tem como consultar as outras linhas. Hoje 100% das
//     conversas do inbox são de número de teste e NADA na tela diz isso; a regra genérica da casa
//     ("coluna de valor único some") apagaria exatamente o alarme. Valor único aqui não é
//     redundância: é o achado (ARB-R18-05).
//
//  2. O rótulo NUNCA é o `phone_number_id`. Em canal não oficial ele é `lite:<nome-da-fono>`, e
//     `core.conversa` é legível por todo `authenticated` — usar o id como rótulo contornaria a RLS
//     que existe para esconder o nome dela (CA-9).
// ═══════════════════════════════════════════════════════════════════════════════════════════

function Selos({ selos }: { selos: SeloChip[] }) {
  return (
    <>
      {selos.map((s) => (
        <span
          key={s}
          className="rounded-[3px] bg-amarelo/15 px-1 py-px text-[0.6rem] font-bold uppercase leading-[1.25] tracking-[0.04em] text-amarelo"
        >
          {rotuloSelo(s)}
        </span>
      ))}
    </>
  );
}

function ChipNumeroLinha({ c }: { c: ConversaResumo }) {
  const chip = chipDoNumero({
    phone_number_id: c.phone_number_id ?? null,
    numero_apelido: c.numero_apelido ?? null,
    numero_e164: c.numero_e164 ?? null,
    finalidade: c.finalidade ?? null,
  });
  return (
    <div className="mt-1 flex items-center gap-1 overflow-hidden" title={chip.titulo}>
      <span
        className={cn(
          "truncate rounded-[3px] px-1 py-px text-[0.62rem] leading-[1.3]",
          chip.atencao ? "bg-amarelo/10 text-amarelo" : "bg-hover text-mute",
        )}
      >
        {chip.rotulo}
      </span>
      <Selos selos={chip.selos} />
    </div>
  );
}

function ChipNumeroCabecalho({ c }: { c: ConversaResumo }) {
  const chip = chipDoNumero({
    phone_number_id: c.phone_number_id ?? null,
    numero_apelido: c.numero_apelido ?? null,
    numero_e164: c.numero_e164 ?? null,
    finalidade: c.finalidade ?? null,
  });
  // O E.164 aparece AQUI e não na lista. Quando ele for nulo por RLS, o texto DIZ isso — nunca
  // fica em branco e nunca é inventado. Mesmo padrão honesto de TEXTO_CREDENCIAL_DESCONHECIDA.
  const numero =
    chip.caso === "cadastrado" || chip.caso === "cadastrado_sem_identidade"
      ? c.numero_e164 ?? ROTULO_NAO_VISIVEL
      : null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-[0.7rem] text-mute">recebida por</span>
      <span
        className={cn(
          "rounded-[3px] px-1.5 py-px text-[0.7rem] font-medium",
          chip.atencao ? "bg-amarelo/10 text-amarelo" : "bg-hover text-suave",
        )}
      >
        {chip.rotulo}
      </span>
      {numero ? <span className="font-mono text-[0.7rem] text-mute">{numero}</span> : null}
      <Selos selos={chip.selos} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LayoutListIcon, PlayIcon, SquareKanbanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { DadosVisaoTarefas } from "@/lib/dados/tarefas-visao";
import {
  aplicarFiltros,
  contadores,
  ordenarLista,
  serializarFiltros,
  type FiltrosTarefas,
  type TarefaVisao,
} from "@/lib/dados/tarefas-visao-calculos";
import { useTarefasVivas } from "@/lib/tarefas/tempo-real";
import {
  abaAtiva,
  agruparPorDia,
  contagemAbas,
  filaDoDia,
  filtrosDaAba,
  proximaNaFila,
  resumoDoDia,
  rotuloDoDia,
  type Aba,
  type GrupoDia,
} from "@/lib/tarefas/dia";
import {
  aplicarEscritas,
  comEvento,
  emAndamentoComEscritas,
  escritasVazias,
  idNovoEnsaio,
  propostasPendentes,
  type EscritasEnsaio,
} from "@/lib/tarefas/ensaio-local";
import { payloadDaProposta, tarefaDaProposta, type PropostaTarefaPendente } from "@/lib/tarefas/propostas";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import {
  arquivarTarefaLead,
  concluirTarefaLead,
  criarTarefaLead,
  reatribuirTarefaLead,
  repactuarPrazoTarefaLead,
} from "@/app/(app)/lead/actions";
import { concluirTarefaNotificacao } from "@/app/(app)/notificacoes/actions";
import { gravarEnsaioTarefas, validarPropostaTarefa } from "@/app/(app)/tarefas/actions";
import { ESTADO_TAREFAS_VAZIO, escritasDoCookie, type EstadoTarefasEnsaio } from "@/lib/tarefas/sessao-foco";
import { QuadroStatus, type ExecutorQuadro } from "@/components/tarefas/quadro-status";
import { ListaDeAcoes, type ItemAcao } from "@/components/jarvis/lista-de-acoes";
import { iniciarTarefa, reabrirTarefa } from "@/app/(app)/tarefas/actions";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import type { PessoaAtiva } from "@/components/tarefas/acoes-tarefa";
import { AbasTarefas } from "@/components/tarefas/abas";
import { FiltrosTarefas as BarraFiltros } from "@/components/tarefas/filtros";
import { LinhaTarefa, type PainelLinha } from "@/components/tarefas/linha";
import { DialogoEAgora, type ConcluidaAgora } from "@/components/tarefas/e-agora";
import { BlocoPropostas } from "@/components/tarefas/proposta-tarefa";
import type { AcoesDaTarefa, ExecutorTarefas, NovaTarefa } from "@/components/tarefas/executor";
import { cn } from "@/lib/utils";

/*
 * VISÃO DE TAREFAS (`/tarefas`) — v2, 10/09/2026 22:40, depois da reprovação do Diogo.
 *
 * O que ficou da v1: o esqueleto de ABAS (Hoje · Semana · Todas · Do time) e o miolo que não se
 * vê — executor (produção = server actions; ensaio = estado local), "e agora?" ao concluir,
 * adiar em um clique, propostas para tipos em modo "propõe", prioridade como ordem.
 *
 * O que mudou, e por quê (o Diogo, 22:40):
 *  · UMA LISTA, a largura útil inteira (max 960px, centrada), agrupada por dia: Vencidas ·
 *    Hoje · Amanhã · Esta semana · Depois · Sem prazo (lib/tarefas/dia.ts `agruparPorDia`).
 *    As colunas por prazo e o toggle Prazo/Status/Lista saíram — eram três layouts para uma
 *    pergunta só. O quadro por status (F8) continua vivo por URL (`?ver=quadro`), sem botão.
 *  · A LINHA (linha.tsx) é texto: título 15px medium, lead à direita em muted; segunda linha
 *    13px muted com prazo (vermelho só se venceu) · responsável · tipo como texto. Zero chip.
 *    Ações no hover. O Jarvis é uma TAREFA como as outras (D62, criação automática), com o
 *    ARCO discreto e o porquê como linha muted — não um bloco à parte.
 *  · FILTROS: Busca · Abertas|Concluídas · Responsável · Tipo, todos de components/ui
 *    (filtros.tsx). Os outros recortes (vencidas, prazo, minhas) são as abas.
 *  · HOJE segue sendo a entrada da SDR: cabeçalho com o dia, "N para hoje · M vencidas",
 *    "Começar as tarefas" e o foco que anda (`?foco=<id>`; ⏎ conclui · A adia · J abre a
 *    conversa · P pula · ↑/↓ · Esc).
 *
 * v3 (23:20, "melhorou bastante" + 4 ajustes): (1) LARGURA — o `max-w-[960px]` saiu; a lista
 * ocupa a largura útil com gutter de 24px e teto de 1600px ("qual a sua tara de padding a 20
 * quarteirões do lado?"); (2) cada linha tem um CHEVRON que expande detalhes (descrição,
 * porquê + trecho, histórico, ações completas — linha.tsx); (3) TRÊS ALVOS por linha: checkbox
 * conclui, título abre o chat com o lead, chevron expande; (4) o QUADRO por estado voltou a ser
 * visível — toggle Lista | Quadro ao lado dos filtros (`?ver=quadro`), com o card na mesma dieta.
 */

export function VisaoTarefas({
  dados,
  filtrosIniciais,
  meuId,
  mencionaveis,
  tiposTarefa,
  emAndamento,
  quadroInicial = false,
  propostas = [],
  focoInicial = null,
  ensaio = false,
  estadoCookie = null,
  criadasDoCookie = [],
}: {
  dados: DadosVisaoTarefas;
  filtrosIniciais: FiltrosTarefas;
  meuId: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  /** F8: ids em andamento (core.v_tarefa.em_andamento) + se a coluna existe no banco */
  emAndamento: { ids: string[]; disponivel: boolean };
  /** `?ver=quadro` — o quadro por STATUS (F8). Só por URL na v2. */
  quadroInicial?: boolean;
  /** propostas do Jarvis para tipos em modo "propõe" (core.sugestao_ia). A leitura real ainda não existe → []. */
  propostas?: PropostaTarefaPendente[];
  /** `?foco=<id>` — a tarefa em foco no percurso do dia */
  focoInicial?: string | null;
  /** modo ensaio (W-D2): escritas viram estado local, nunca server action */
  ensaio?: boolean;
  /** W-T · o cookie do ensaio (concluídas, adiadas, criadas, sessão de foco) — base das escritas locais */
  estadoCookie?: EstadoTarefasEnsaio | null;
  /** W-T · as tarefas criadas no cookie, já como `TarefaVisao` com resumo (o servidor monta) */
  criadasDoCookie?: TarefaVisao[];
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState<FiltrosTarefas>(filtrosIniciais);
  const [quadro, setQuadro] = useState<boolean>(quadroInicial);
  /** v3 · linhas com os detalhes abertos (chevron) */
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const [foco, setFoco] = useState<string | null>(focoInicial);

  const [agora, setAgora] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // tarefa muda pouco, mas quem deixa a aba aberta merece ver a fila andar sozinha
  useTarefasVivas();

  function mudar(parcial: Partial<FiltrosTarefas>) {
    setFiltros((f) => ({ ...f, ...parcial }));
  }

  // A URL segue o estado, com 300 ms de folga (a busca filtra no cliente; a página é
  // force-dynamic e cada replace refaz a leitura) — ver a v1 para a medição.
  const qsEscritaRef = useRef(comExtras(serializarFiltros(filtrosIniciais), quadroInicial, focoInicial));
  useEffect(() => {
    const qs = comExtras(serializarFiltros(filtros), quadro, foco);
    if (qs === qsEscritaRef.current) return;
    const t = setTimeout(() => {
      qsEscritaRef.current = qs;
      router.replace(qs ? `/tarefas?${qs}` : "/tarefas", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [filtros, quadro, foco, router]);

  const pessoas = useMemo(() => mencionaveis.filter((m) => m.tipo === "humano"), [mencionaveis]);
  const pessoasAtivas = useMemo<PessoaAtiva[]>(
    () => pessoas.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome })),
    [pessoas],
  );
  const nomes = useMemo(
    () => ({
      membros: new Map(pessoas.map((m) => [m.id, m.nome])),
      tipos: new Map(tiposTarefa.map((t) => [t.chave, t.rotulo])),
    }),
    [pessoas, tiposTarefa],
  );

  // ── ESCRITAS: o executor (produção = server actions; ensaio = estado local) ──
  const [escritas, setEscritas] = useState<EscritasEnsaio>(() => {
    if (!ensaio || !estadoCookie) return escritasVazias();
    const e = escritasDoCookie(estadoCookie, nomes.membros);
    return { ...e, criadas: criadasDoCookie };
  });
  // W-T · o cookie do ensaio: cada escrita local que muda o quadro também vai para ele, para a
  // lista e o modo foco (rota própria) contarem a mesma história. Fire-and-forget: a tela já
  // mudou pelo estado local; o cookie é a memória para a PRÓXIMA requisição.
  const cookieRef = useRef<EstadoTarefasEnsaio>(estadoCookie ?? ESTADO_TAREFAS_VAZIO);
  const persistir = useCallback(
    (muda: (e: EstadoTarefasEnsaio) => EstadoTarefasEnsaio) => {
      if (!ensaio) return;
      cookieRef.current = muda(cookieRef.current);
      void gravarEnsaioTarefas(cookieRef.current);
    },
    [ensaio],
  );
  const idsEmAndamento = useMemo(
    () => new Set(ensaio ? emAndamentoComEscritas(emAndamento.ids, escritas) : emAndamento.ids),
    [ensaio, emAndamento.ids, escritas],
  );
  const contadorNovo = useRef(0);
  const [eAgora, setEAgora] = useState<ConcluidaAgora | null>(null);
  const [progresso, setProgresso] = useState({ concluidas: 0, adiadas: 0 });
  /** v3 · o que já passou pelo percurso, na ordem — vira a `ListaDeAcoes` do W-J no topo de Hoje */
  const [percursoLog, setPercursoLog] = useState<{ id: string; titulo: string; estado: "feito" | "adiada"; quando: string; badge: string }[]>([]);
  const refrescar = useCallback(() => router.refresh(), [router]);

  const tarefas = useMemo(
    () => (ensaio ? aplicarEscritas(dados.tarefas, escritas, agora) : dados.tarefas),
    [ensaio, dados.tarefas, escritas, agora],
  );
  const propostasAbertas = useMemo(
    () => (ensaio ? propostasPendentes(propostas, escritas) : propostas),
    [ensaio, propostas, escritas],
  );

  const executor = useMemo<ExecutorTarefas>(() => {
    if (ensaio) {
      const ok = { ok: true } as const;
      return {
        async concluir(t, resultado) {
          setEscritas((e) => ({ ...e, concluidas: new Map(e.concluidas).set(t.id, resultado) }));
          persistir((c) => ({ ...c, concluidas: { ...c.concluidas, [t.id]: { resultado, em: new Date().toISOString() } } }));
          return ok;
        },
        async adiar(t, prazoIso, motivo) {
          if (!prazoIso) return { ok: false, motivo: "escolha uma data" };
          if (!motivo.trim()) return { ok: false, motivo: "motivo obrigatório" };
          const texto = `${motivo} · novo prazo ${dataHoraCurta(prazoIso)}`;
          setEscritas((e) =>
            comEvento({ ...e, prazos: new Map(e.prazos).set(t.id, prazoIso) }, t.id, {
              quando: new Date().toISOString(),
              tipo: "adiada",
              texto,
            }),
          );
          persistir((c) => ({ ...c, prazos: { ...c.prazos, [t.id]: { prazo: prazoIso, motivo: texto, em: new Date().toISOString() } } }));
          return ok;
        },
        async reatribuir(t, responsavelId) {
          const nome = pessoasAtivas.find((p) => p.id === responsavelId)?.nome.split(/\s+/)[0] ?? "outro membro";
          setEscritas((e) =>
            comEvento({ ...e, responsaveis: new Map(e.responsaveis).set(t.id, responsavelId) }, t.id, {
              quando: new Date().toISOString(),
              tipo: "reatribuida",
              texto: `passada para ${nome}`,
            }),
          );
          return ok;
        },
        async arquivar(t, motivo) {
          if (!motivo.trim()) return { ok: false, motivo: "motivo obrigatório" };
          setEscritas((e) => ({ ...e, arquivadas: new Map(e.arquivadas).set(t.id, motivo) }));
          return ok;
        },
        async criar(d: NovaTarefa) {
          const nova: TarefaVisao = {
            id: idNovoEnsaio(++contadorNovo.current),
            lead_id: d.leadId,
            lead_nome: d.leadNome,
            titulo: d.titulo,
            descricao: null,
            tipo: d.tipo,
            responsavel: null,
            responsavel_id: d.responsavelId,
            prazo: d.prazoIso,
            status: "pendente",
            resultado: null,
            motivo_arquivo: null,
            criado_em: new Date().toISOString(),
            concluida_em: null,
            vencida: false,
            por_que: null,
            fazer: null,
            trecho: null,
            origem: null,
            prioridade: d.prioridade ?? null,
          };
          setEscritas((e) => ({ ...e, criadas: [...e.criadas, nova] }));
          persistir((c) => ({
            ...c,
            criadas: [
              ...c.criadas,
              { id: nova.id, lead_id: nova.lead_id, lead_nome: nova.lead_nome, titulo: nova.titulo, tipo: nova.tipo, responsavel_id: nova.responsavel_id, prazo: nova.prazo, prioridade: nova.prioridade ?? null, criado_em: nova.criado_em, depois_de: eAgora?.tarefa.id ?? null },
            ],
          }));
          return ok;
        },
        async validarProposta(p, decisao, ajuste) {
          setEscritas((e) => {
            const resolvidas = new Set(e.propostasResolvidas).add(p.id);
            if (decisao === "rejeitada") return { ...e, propostasResolvidas: resolvidas };
            const nova = tarefaDaProposta(p, ajuste ?? {}, Date.now(), idNovoEnsaio(++contadorNovo.current));
            return { ...e, propostasResolvidas: resolvidas, criadas: [...e.criadas, nova] };
          });
          return ok;
        },
      };
    }
    return {
      async concluir(t, resultado) {
        const r = t.lead_id ? await concluirTarefaLead(t.lead_id, t.id, resultado) : await concluirTarefaNotificacao(t.id, resultado);
        if (r.ok) refrescar();
        return r;
      },
      async adiar(t, prazoIso, motivo) {
        const r = await repactuarPrazoTarefaLead(t.lead_id, t.id, prazoIso, motivo);
        if (r.ok) refrescar();
        return r;
      },
      async reatribuir(t, responsavelId) {
        const r = await reatribuirTarefaLead(t.lead_id, t.id, responsavelId);
        if (r.ok) refrescar();
        return r;
      },
      async arquivar(t, motivo) {
        const r = await arquivarTarefaLead(t.lead_id, t.id, motivo);
        if (r.ok) refrescar();
        return r;
      },
      async criar(d: NovaTarefa) {
        // `prioridade` não entra: `DadosTarefa` não a aceita — é o [M] do benchmark.
        const r = await criarTarefaLead(d.leadId, { titulo: d.titulo, tipo: d.tipo, responsavelId: d.responsavelId, prazoIso: d.prazoIso, mencoes: [] });
        if (r.ok) refrescar();
        return r;
      },
      async validarProposta(p, decisao, ajuste) {
        const r = await validarPropostaTarefa(p.id, decisao, ajuste ? payloadDaProposta(p, ajuste) : null);
        if (r.ok) refrescar();
        return r;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensaio, refrescar, pessoasAtivas, persistir]);

  // v3 · o quadro por status escreve por aqui (ensaio = local; produção = iniciar/reabrir reais)
  const executorQuadro = useMemo<ExecutorQuadro>(() => {
    if (ensaio) {
      const ok = { ok: true } as const;
      return {
        async iniciar(t) {
          setEscritas((e) => {
            const iniciadas = new Set(e.iniciadas).add(t.id);
            const reabertas = new Set(e.reabertas);
            reabertas.delete(t.id);
            return comEvento({ ...e, iniciadas, reabertas }, t.id, { quando: new Date().toISOString(), tipo: "iniciada", texto: "tarefa pega no quadro" });
          });
          return ok;
        },
        async reabrir(t) {
          setEscritas((e) => {
            const reabertas = new Set(e.reabertas).add(t.id);
            const iniciadas = new Set(e.iniciadas);
            iniciadas.delete(t.id);
            const concluidas = new Map(e.concluidas);
            concluidas.delete(t.id);
            return comEvento({ ...e, reabertas, iniciadas, concluidas }, t.id, { quando: new Date().toISOString(), tipo: "reaberta", texto: "voltou para A fazer" });
          });
          return ok;
        },
        acoesDe: (t) => ({ concluir: (r) => executor.concluir(t, r) }),
      };
    }
    return {
      async iniciar(t) {
        const r = await iniciarTarefa(t.id, t.lead_id);
        if (r.ok) refrescar();
        return r;
      },
      async reabrir(t) {
        const r = await reabrirTarefa(t.id, t.lead_id);
        if (r.ok) refrescar();
        return r;
      },
    };
  }, [ensaio, refrescar, executor]);

  const acoesDe = useCallback(
    (t: TarefaVisao): AcoesDaTarefa => ({
      concluir: (resultado) => executor.concluir(t, resultado),
      adiar: (prazoIso, motivo) => executor.adiar(t, prazoIso, motivo),
      reatribuir: (id) => executor.reatribuir(t, id),
      arquivar: (motivo) => executor.arquivar(t, motivo),
    }),
    [executor],
  );

  // ── recortes ──
  const cont = useMemo(() => contadores(tarefas), [tarefas]);
  const filtradas = useMemo(() => aplicarFiltros(tarefas, filtros, meuId, agora), [tarefas, filtros, meuId, agora]);
  const modoHoje = !quadro && filtros.exibicao === "hoje";
  const aba = quadro ? null : abaAtiva(filtros);
  const contagem = useMemo(() => contagemAbas(tarefas, meuId, agora), [tarefas, meuId, agora]);
  const fechadas = filtros.status !== "abertas";

  // Hoje = a fila do dia; as outras abas = a mesma lista, cortada por dia
  const fila = useMemo(() => (modoHoje ? filaDoDia(filtradas, agora) : []), [modoHoje, filtradas, agora]);
  const grupos = useMemo<GrupoDia[]>(() => {
    if (quadro) return [];
    if (modoHoje) {
      return [
        { chave: "vencidas", rotulo: "Vencidas", tarefas: fila.filter((t) => t.vencida), vermelho: true },
        { chave: "hoje", rotulo: "Hoje", tarefas: fila.filter((t) => !t.vencida), vermelho: false },
      ].filter((g) => g.tarefas.length > 0) as GrupoDia[];
    }
    if (fechadas) {
      const lista = ordenarLista(filtradas, filtros.status);
      const chave: GrupoDia["chave"] = filtros.status === "concluidas" ? "concluidas" : "arquivadas";
      return lista.length ? [{ chave, rotulo: chave === "concluidas" ? "Concluídas" : "Arquivadas", tarefas: lista, vermelho: false }] : [];
    }
    return agruparPorDia(filtradas, agora);
  }, [quadro, modoHoje, fechadas, fila, filtradas, filtros.status, agora]);

  const tarefasQuadro = useMemo(() => {
    if (!quadro) return [];
    const base = { ...filtros, vencidas: false, prazo: "todos" as const };
    return [
      ...aplicarFiltros(tarefas, { ...base, status: "abertas" }, meuId, agora),
      ...aplicarFiltros(tarefas, { ...base, status: "concluidas" }, meuId, agora),
    ];
  }, [quadro, tarefas, filtros, meuId, agora]);

  const propostasDoRecorte = useMemo(
    () => (filtros.minhas && meuId ? propostasAbertas.filter((p) => p.responsavel_sugerido_id === meuId) : propostasAbertas),
    [propostasAbertas, filtros.minhas, meuId],
  );
  const [propostasVisiveis, setPropostasVisiveis] = useState(false);

  function escolherAba(a: Aba) {
    setFiltros(filtrosDaAba(a, filtros));
    if (a !== "hoje") setFoco(null);
    else setQuadro(false);
  }

  // ── painel aberto por linha (um por vez) ──
  const [painelDe, setPainelDe] = useState<{ id: string; painel: PainelLinha } | null>(null);
  function painelDa(id: string): PainelLinha {
    return painelDe?.id === id ? painelDe.painel : null;
  }
  function abrirPainel(id: string, p: PainelLinha) {
    setPainelDe(p ? { id, painel: p } : null);
  }

  // ── o percurso do dia: foco, próximo, "e agora?" ──
  const idsFila = useMemo(() => fila.map((t) => t.id), [fila]);
  const idsFilaRef = useRef<string[]>([]);
  idsFilaRef.current = idsFila;
  const proximoRef = useRef<string | null>(null);
  const posicao = foco ? idsFila.indexOf(foco) : -1;
  const emFoco = posicao >= 0 ? fila[posicao] : null;
  const resumo = useMemo(() => resumoDoDia(fila), [fila]);

  function proximoDepoisDe(id: string): string | null {
    const ids = idsFilaRef.current;
    const i = ids.indexOf(id);
    return i >= 0 ? (ids[i + 1] ?? null) : proximaNaFila(ids.filter((x) => x !== id), null);
  }
  function andarFoco(depoisDe: string, proximo: string | null) {
    if (modoHoje && foco === depoisDe) setFoco(proximo);
  }
  function aoConcluida(t: TarefaVisao, resultado: string) {
    setProgresso((p) => ({ ...p, concluidas: p.concluidas + 1 }));
    setPercursoLog((l) => [...l, { id: t.id, titulo: t.titulo, estado: "feito", quando: new Date().toISOString(), badge: horaAgora() }]);
    setPainelDe(null);
    proximoRef.current = proximoDepoisDe(t.id);
    if (t.lead_id) setEAgora({ tarefa: t, resultado });
    else andarFoco(t.id, proximoRef.current);
  }
  function fecharEAgora() {
    const t = eAgora?.tarefa;
    setEAgora(null);
    if (t) andarFoco(t.id, proximoRef.current);
  }
  function aoAdiada(t: TarefaVisao) {
    setProgresso((p) => ({ ...p, adiadas: p.adiadas + 1 }));
    setPercursoLog((l) => [...l, { id: t.id, titulo: t.titulo, estado: "adiada", quando: new Date().toISOString(), badge: "adiada" }]);
    setPainelDe(null);
    andarFoco(t.id, proximoDepoisDe(t.id));
  }

  // foco anda → a linha entra na tela
  useEffect(() => {
    if (!foco) return;
    document.getElementById(`tarefa-${foco}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [foco]);

  // ATALHOS do percurso — só com foco e fora de campo de texto / diálogo
  useEffect(() => {
    if (!emFoco) return;
    const t = emFoco;
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const emCampo = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if (e.key === "Escape") {
        if (painelDe) setPainelDe(null);
        else if (!emCampo) setFoco(null);
        return;
      }
      if (emCampo || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[data-slot="dialog-content"],[data-slot="dropdown-menu-content"],[data-slot="select-content"]')) return;
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          abrirPainel(t.id, painelDa(t.id) === "concluir" ? null : "concluir");
          break;
        case "a":
        case "A":
          e.preventDefault();
          abrirPainel(t.id, painelDa(t.id) === "repactuar" ? null : "repactuar");
          break;
        case "j":
        case "J": {
          e.preventDefault();
          const d = destinoDaTarefa(t);
          if (d) router.push(d);
          break;
        }
        case "p":
        case "P":
        case "ArrowRight":
          e.preventDefault();
          setFoco(idsFila[posicao + 1] ?? null);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (idsFila[posicao + 1]) setFoco(idsFila[posicao + 1]);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (idsFila[posicao - 1]) setFoco(idsFila[posicao - 1]);
          break;
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emFoco, posicao, idsFila, painelDe]);

  const feitas = progresso.concluidas + progresso.adiadas;

  // v3 · o percurso como lista de ações (componente do W-J): o que já foi (riscado, com a hora),
  // a atual (anel pontilhado, com o porquê como subitem), as próximas (vazio) e as vencidas (!).
  const itensPercurso = useMemo<ItemAcao[]>(() => {
    if (!modoHoje || !emFoco) return [];
    const passadas: ItemAcao[] = percursoLog.map((p) => ({
      id: `log-${p.id}`,
      titulo: p.titulo,
      estado: p.estado === "feito" ? "feito" : "pendente",
      badge: p.badge,
    }));
    const restantes: ItemAcao[] = fila.map((t, i) => {
      const atual = i === posicao;
      const item: ItemAcao = {
        id: t.id,
        titulo: t.titulo,
        estado: atual ? "andamento" : t.vencida ? "atencao" : "pendente",
        badge: atual ? `${i + 1} de ${fila.length}` : t.vencida ? "vencida" : null,
        href: atual ? null : `/tarefas?ver=hoje&minhas=1&foco=${t.id}`,
      };
      if (atual && t.por_que) item.filhos = [{ id: `${t.id}-porque`, titulo: t.por_que, estado: "andamento", badge: "por quê" }];
      return item;
    });
    return [...passadas, ...restantes];
  }, [modoHoje, emFoco, percursoLog, fila, posicao]);
  const nadaNoWorkspace = tarefas.length === 0;
  const nadaComFiltro = !nadaNoWorkspace && (quadro ? tarefasQuadro.length === 0 : grupos.length === 0);
  const filtroTexto = filtros.busca.trim() !== "" || filtros.tipo != null || (filtros.responsavelId != null && !filtros.minhas);

  return (
    <div className="flex h-[calc(100vh-var(--altura-topo))] flex-col bg-board">
      {/* ── abas + filtros ── */}
      <div className="flex-shrink-0 px-6 pt-3">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-linha">
            <AbasTarefas ativa={aba} contagem={contagem} onEscolher={escolherAba} semMeuId={!meuId} />
            <span className="ml-auto pb-1.5 text-[12px] text-mute">
              {cont.abertas.toLocaleString("pt-BR")} abertas
              {cont.vencidas > 0 && (
                <>
                  {" · "}
                  <span className="text-vermelho">{cont.vencidas.toLocaleString("pt-BR")} vencidas</span>
                </>
              )}
              {dados.corte && (
                <span className="ml-2 text-laranja-esc" title="A leitura bateu no teto (500 abertas / 200 do histórico): a lista e a busca são parciais.">
                  · lista parcial
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BarraFiltros
              filtros={filtros}
              onMudar={mudar}
              pessoas={pessoasAtivas}
              tiposTarefa={tiposTarefa}
              mostrarResponsavel={!modoHoje && !filtros.minhas}
              mostrarStatus={!modoHoje && !quadro}
            />
            {/* v3 · Lista | Quadro — o quadro por estado (F8) de volta à vista */}
            {!modoHoje && (
              <ToggleGroup
                value={[quadro ? "quadro" : "lista"]}
                onValueChange={(v) => {
                  const esc = (v as string[])[0];
                  if (esc === "quadro" || esc === "lista") setQuadro(esc === "quadro");
                }}
                variant="outline"
                size="sm"
                aria-label="Forma de ver"
                className="ml-auto"
              >
                <ToggleGroupItem value="lista" aria-label="Lista" className="px-2.5 text-[13px]">
                  <LayoutListIcon aria-hidden />
                  Lista
                </ToggleGroupItem>
                <ToggleGroupItem value="quadro" aria-label="Quadro" className="px-2.5 text-[13px]">
                  <SquareKanbanIcon aria-hidden />
                  Quadro
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </div>
      </div>

      {/* ── conteúdo ── */}
      {quadro ? (
        <QuadroStatus
          tarefas={tarefasQuadro}
          emAndamento={idsEmAndamento}
          emAndamentoDisponivel={emAndamento.disponivel}
          agora={agora}
          nomes={nomes}
          aoMudar={refrescar}
          executor={executorQuadro}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-6 pb-16 pt-4">
          <div className="mx-auto max-w-[1600px]">
            {/* cabeçalho do dia — só em Hoje */}
            {modoHoje && (
              <header className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold leading-tight text-tinta">{rotuloDoDia(agora)}</h2>
                  <p className="mt-0.5 text-[13px] text-mute">
                    {fila.length === 0 && feitas > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-verde">
                        <CheckIcon className="size-3.5" aria-hidden />
                        Fila do dia zerada
                      </span>
                    ) : emFoco ? (
                      <span className="font-medium text-tinta">
                        Tarefa {posicao + 1} de {fila.length}
                      </span>
                    ) : fila.length === 0 ? (
                      "Nada vencido e nada para hoje."
                    ) : (
                      <>
                        <span className="font-medium text-tinta">{fila.length}</span> para hoje
                        {resumo.vencidas > 0 && (
                          <>
                            {" · "}
                            <span className="text-vermelho">{resumo.vencidas} {resumo.vencidas === 1 ? "vencida" : "vencidas"}</span>
                          </>
                        )}
                      </>
                    )}
                    {feitas > 0 && (
                      <>
                        {" · "}
                        {[
                          progresso.concluidas > 0 && `${progresso.concluidas} ${progresso.concluidas === 1 ? "concluída" : "concluídas"}`,
                          progresso.adiadas > 0 && `${progresso.adiadas} ${progresso.adiadas === 1 ? "adiada" : "adiadas"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </>
                    )}
                  </p>
                </div>
                <div className="ml-auto">
                  {emFoco ? (
                    <Button variant="ghost" size="sm" onClick={() => setFoco(null)} className="text-suave">
                      Sair do percurso
                      <kbd className="rounded border border-linha-forte px-1 font-mono text-[10px] text-mute">Esc</kbd>
                    </Button>
                  ) : (
                    fila.length > 0 && (
                      <Button size="sm" onClick={() => setFoco(fila[0].id)}>
                        <PlayIcon className="fill-current" aria-hidden />
                        Começar as tarefas
                        <span className="font-mono text-[11px] opacity-80">{fila.length}</span>
                      </Button>
                    )
                  )}
                </div>
              </header>
            )}

            {/* v3 · o percurso em andamento — a lista de ações do W-J, no topo, enquanto o foco anda */}
            {modoHoje && itensPercurso.length > 0 && (
              <div className="mb-4 rounded-lg border border-linha bg-branco px-4 py-3">
                <ListaDeAcoes itens={itensPercurso} rotulo="Percurso do dia" />
              </div>
            )}

            {/* o que o Jarvis ainda não criou (tipos em modo "propõe") */}
            {!fechadas && (
              <BlocoPropostas
                propostas={propostasDoRecorte}
                pessoas={pessoasAtivas}
                agora={agora}
                validar={executor.validarProposta}
                aberto={propostasVisiveis}
                onToggle={() => setPropostasVisiveis((v) => !v)}
              />
            )}

            {nadaNoWorkspace ? (
              <Vazio>
                Nenhuma tarefa ainda.{" "}
                <button type="button" onClick={() => router.push("/conversas")} className="font-medium text-tinta underline-offset-[3px] hover:underline">
                  Crie a primeira na conversa
                </button>
                .
              </Vazio>
            ) : nadaComFiltro ? (
              <Vazio>
                {modoHoje && !filtroTexto ? (
                  fila.length === 0 && feitas > 0 ? (
                    <>Você zerou o dia. O que vem depois está em <b className="font-medium text-tinta">Semana</b>.</>
                  ) : (
                    <>Nada vencido e nada para hoje.</>
                  )
                ) : filtros.busca.trim() ? (
                  <>
                    Nada com “{filtros.busca.trim()}” no título, na descrição ou no lead.{" "}
                    <button type="button" onClick={() => mudar({ busca: "" })} className="font-medium text-tinta underline-offset-[3px] hover:underline">
                      Limpar a busca
                    </button>
                  </>
                ) : (
                  <>
                    Nada passa pelos filtros.{" "}
                    <button
                      type="button"
                      onClick={() => mudar({ busca: "", tipo: null, responsavelId: null })}
                      className="font-medium text-tinta underline-offset-[3px] hover:underline"
                    >
                      Limpar filtros
                    </button>
                  </>
                )}
              </Vazio>
            ) : (
              <div className="flex flex-col gap-6">
                {grupos.map((g) => (
                  <section key={g.chave} aria-label={g.rotulo}>
                    <h3 className="mb-1.5 flex items-baseline gap-2 px-1 text-[13px] font-medium">
                      <span className={g.vermelho ? "text-vermelho" : "text-suave"}>{g.rotulo}</span>
                      <span className={cn("font-mono text-[12px] tabular-nums", g.vermelho ? "text-vermelho/80" : "text-mute")}>{g.tarefas.length}</span>
                    </h3>
                    <ol className="rounded-lg border border-linha bg-branco">
                      {g.tarefas.map((t) => (
                        <LinhaTarefa
                          key={t.id}
                          t={t}
                          agora={agora}
                          nomes={nomes}
                          pessoas={pessoasAtivas}
                          acoes={acoesDe(t)}
                          emFoco={t.id === foco}
                          aberta={abertas.has(t.id)}
                          onAbrir={(ab) =>
                            setAbertas((s) => {
                              const n = new Set(s);
                              if (ab) n.add(t.id);
                              else n.delete(t.id);
                              return n;
                            })
                          }
                          painel={painelDa(t.id)}
                          onPainel={(p) => abrirPainel(t.id, p)}
                          aoConcluida={(resultado) => aoConcluida(t, resultado)}
                          aoAdiada={() => aoAdiada(t)}
                          aoMudar={refrescar}
                          onFocar={modoHoje ? () => setFoco(t.id) : undefined}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* "E AGORA?" — depois de concluir qualquer tarefa com lead */}
      <DialogoEAgora
        concluida={eAgora}
        pessoas={pessoasAtivas}
        tiposTarefa={tiposTarefa}
        meuId={meuId}
        agora={agora}
        criar={executor.criar}
        onFechar={fecharEAgora}
      />
    </div>
  );
}

function horaAgora(): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** `?ver=quadro` e `?foco=<id>` entram na URL por fora de `serializarFiltros`. */
function comExtras(qs: string, quadro: boolean, foco: string | null): string {
  if (!quadro && !foco) return qs;
  const p = new URLSearchParams(qs);
  if (quadro) p.set("ver", "quadro");
  if (foco) p.set("foco", foco);
  return p.toString();
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-linha px-6 py-10 text-center">
      <p className="mx-auto max-w-md text-[13.5px] leading-relaxed text-mute">{children}</p>
    </div>
  );
}

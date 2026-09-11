"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { DadosVisaoTarefas } from "@/lib/dados/tarefas-visao";
import {
  agrupar,
  aplicarFiltros,
  contadores,
  ordenarLista,
  serializarFiltros,
  temFiltroAtivo,
  FILTROS_PADRAO,
  type Agrupamento,
  type FiltrosTarefas,
  type StatusFiltro,
  type TarefaVisao,
} from "@/lib/dados/tarefas-visao-calculos";
import { useTarefasVivas } from "@/lib/tarefas/tempo-real";
import { abaAtiva, contagemAbas, filaDoDia, filtrosDaAba, proximaNaFila, type Aba } from "@/lib/tarefas/dia";
import { aplicarEscritas, escritasVazias, idNovoEnsaio, propostasPendentes, type EscritasEnsaio } from "@/lib/tarefas/ensaio-local";
import { payloadDaProposta, tarefaDaProposta, type PropostaTarefaPendente } from "@/lib/tarefas/propostas";
import {
  arquivarTarefaLead,
  concluirTarefaLead,
  criarTarefaLead,
  reatribuirTarefaLead,
  repactuarPrazoTarefaLead,
} from "@/app/(app)/lead/actions";
import { concluirTarefaNotificacao } from "@/app/(app)/notificacoes/actions";
import { validarPropostaTarefa } from "@/app/(app)/tarefas/actions";
import { MetaTarefa, PorQueJarvis, RailPrioridade } from "@/components/tarefas/cartao-meta";
import { QuadroStatus } from "@/components/tarefas/quadro-status";
import { AcoesTarefa, BotaoAcoes, type PessoaAtiva } from "@/components/tarefas/acoes-tarefa";
import { BotaoConcluir, PainelConcluir } from "@/components/tarefas/concluir-tarefa";
import { AbasTarefas } from "@/components/tarefas/abas";
import { FilaDoDia, type ProgressoDia } from "@/components/tarefas/fila-do-dia";
import { DialogoEAgora, type ConcluidaAgora } from "@/components/tarefas/e-agora";
import { BlocoPropostas } from "@/components/tarefas/proposta-tarefa";
import type { AcoesDaTarefa, ExecutorTarefas, NovaTarefa } from "@/components/tarefas/executor";
import { cn } from "@/lib/utils";
import { destinoDaTarefa } from "@/lib/tarefas/destino";

/*
 * VISÃO DE TAREFAS (`/tarefas`, Rodada 14) — a tela de tarefas do Kommo, com o contrato nosso.
 * O funil aqui é o TEMPO: colunas Vencidas · Hoje · Amanhã · Esta semana · Depois · Sem prazo.
 * Vencidas é a ÚNICA coluna vermelha — no Kommo 97,9% da fila aberta estava vencida e o
 * vermelho não dizia nada; aqui ele fica contido numa coluna que dá pra esvaziar.
 *
 * Histórico (concluídas/arquivadas) é lista, não funil — bucket de prazo só descreve
 * compromisso futuro.
 *
 * ⚠️ REVOGADO em 22/08 — este bloco dizia "NENHUMA ESCRITA NESTA TELA: clicar numa tarefa leva
 * ao drawer do lead no funil, onde concluir-com-resultado já existe". Era verdade e era o
 * defeito: concluir custava 4 cliques e 2 rotas, e tarefa sem `lead_id` não era nem clicável,
 * ou seja, não tinha caminho nenhum. CONCLUIR agora mora aqui
 * (components/tarefas/concluir-tarefa.tsx); as ações de ciclo de vida (⋯) já moravam.
 *
 * Outras duas coisas que a tela devia e não pagava:
 *  · a DESCRIÇÃO vinha do banco em toda leitura (`descricao` está no SELECT de
 *    lib/dados/tarefas-visao.ts) e NUNCA era desenhada — `grep -rn descricao components/tarefas/`
 *    não devolvia uma linha. É o "POR QUE AGORA / FAZER" que a Sarah lê hoje no Kommo, e é a
 *    razão de a fila existir: sem ele o card é um título solto.
 *  · BUSCA POR TEXTO. Eram seis filtros e nenhum campo de digitar, com teto de 500 abertas.
 *
 * ── W-D5 (10/09) · o que o benchmark de pipeline de tarefas trouxe ──────────────────────────
 * O layout do Diogo (linha de contadores + barra de filtros + colunas por prazo) FICOU. Em cima
 * dele entraram, todos "só tela" (§4 do benchmark, marcados [T]):
 *  · ABAS Hoje · Semana · Todas · Do time (abas.tsx) — a aba é derivada dos filtros;
 *  · a VIEW HOJE (`?ver=hoje`, fila-do-dia.tsx): vencidas ∪ hoje, minhas, numerada, com
 *    "Começar as tarefas" e um foco que anda (`?foco=<id>`), atalhos ⏎ / A / J / P;
 *  · ADIAR EM UM CLIQUE — presets Amanhã · 3 dias · Próxima segunda no painel ⋯ (acoes-tarefa.tsx);
 *  · "E AGORA?" depois de concluir (e-agora.tsx) — a próxima tarefa com lead e dono preenchidos;
 *  · PROPOSTAS DO JARVIS (proposta-tarefa.tsx) — aceitar · ajustar · descartar;
 *  · PRIORIDADE alta/média/baixa — trilho e chip (cartao-meta.tsx), e desempate na ordem;
 *  · colunas por LEAD no agrupamento.
 *
 * ESCRITA: toda ação passa por um `ExecutorTarefas` (executor.ts). Em produção ele é as server
 * actions de sempre; no ENSAIO (W-D2, `ensaio` = true) é estado local (lib/tarefas/ensaio-local.ts)
 * reaplicado sobre a fixture — a tela se comporta inteira sem gravar evento nenhum.
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
}: {
  dados: DadosVisaoTarefas;
  filtrosIniciais: FiltrosTarefas;
  meuId: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  /** F8: ids em andamento (core.v_tarefa.em_andamento) + se a coluna existe no banco */
  emAndamento: { ids: string[]; disponivel: boolean };
  /** `?ver=quadro` — terceira exibição, por STATUS. Vive fora de `FiltrosTarefas` (módulo de outra frente). */
  quadroInicial?: boolean;
  /** W-D5 · propostas do Jarvis pendentes (core.sugestao_ia, tipo tarefa). A leitura real ainda não existe → []. */
  propostas?: PropostaTarefaPendente[];
  /** W-D5 · `?foco=<id>` — a tarefa em foco na fila do dia */
  focoInicial?: string | null;
  /** W-D5 · modo ensaio (W-D2): escritas viram estado local, nunca server action */
  ensaio?: boolean;
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState<FiltrosTarefas>(filtrosIniciais);
  const [quadro, setQuadro] = useState<boolean>(quadroInicial);
  const [foco, setFoco] = useState<string | null>(focoInicial);
  const idsEmAndamento = useMemo(() => new Set(emAndamento.ids), [emAndamento.ids]);
  const [agora, setAgora] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // tarefa muda pouco, mas quem deixa a aba aberta merece ver a fila andar sozinha — e o quadro
  // por status (F8) depende disto para atualizar quando OUTRO ator conclui/cria/inicia
  useTarefasVivas();

  function mudar(parcial: Partial<FiltrosTarefas>) {
    setFiltros({ ...filtros, ...parcial });
  }

  /**
   * A URL SEGUE o estado, com folga — não o contrário.
   *
   * Até 22/08 `mudar()` chamava `router.replace` na hora, o que era barato porque todo filtro
   * era um clique. Com a busca por texto isso vira uma ida ao servidor POR TECLA: a página é
   * `dynamic = "force-dynamic"` (app/(app)/tarefas/page.tsx), então cada replace refaz a
   * leitura de v_tarefa + os nomes de lead. Digitar "audiometria" custaria 11 leituras
   * completas para uma filtragem que já acontece no cliente, de graça, no mesmo instante.
   *
   * Então: o estado local muda na hora (a lista responde à tecla) e a URL — que serve para
   * COMPARTILHAR a visão por link — chega 300 ms depois da última tecla. O ref guarda a última
   * query escrita para o efeito não replicar na montagem a query que o servidor já entregou.
   */
  const qsEscritaRef = useRef(comExtras(serializarFiltros(filtrosIniciais), quadroInicial, focoInicial));
  useEffect(() => {
    const qs = comExtras(serializarFiltros(filtros), quadro, foco);
    if (qs === qsEscritaRef.current) return;
    const t = setTimeout(() => {
      qsEscritaRef.current = qs;
      router.replace(qs ? `/tarefas?${qs}` : "/tarefas", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [filtros, quadro, foco, filtrosIniciais, router]);

  const pessoas = useMemo(
    () => mencionaveis.filter((m) => m.tipo === "humano"),
    [mencionaveis],
  );
  // reatribuir só oferece membro ATIVO — revogado a porta recusa (22023)
  const pessoasAtivas = useMemo<PessoaAtiva[]>(
    () => pessoas.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome })),
    [pessoas],
  );
  // um painel de ações aberto por vez (R14 — reatribuir/repactuar/arquivar)
  const [acoesId, setAcoesId] = useState<string | null>(null);
  // e um de conclusão por vez (22/08). Os dois são exclusivos entre si: abrir um fecha o
  // outro, senão o card cresce com dois formulários pedindo coisas diferentes ao mesmo tempo.
  const [concluindoId, setConcluindoId] = useState<string | null>(null);
  function abrirAcoes(id: string) {
    setAcoesId(acoesId === id ? null : id);
    setConcluindoId(null);
  }
  function abrirConcluir(id: string) {
    setConcluindoId(concluindoId === id ? null : id);
    setAcoesId(null);
  }
  const nomes = useMemo(
    () => ({
      membros: new Map(pessoas.map((m) => [m.id, m.nome])),
      tipos: new Map(tiposTarefa.map((t) => [t.chave, t.rotulo])),
    }),
    [pessoas, tiposTarefa],
  );

  // ── ESCRITAS: o executor (produção = server actions; ensaio = estado local) ──
  const [escritas, setEscritas] = useState<EscritasEnsaio>(escritasVazias);
  const contadorNovo = useRef(0);
  const [eAgora, setEAgora] = useState<ConcluidaAgora | null>(null);
  const [progresso, setProgresso] = useState<ProgressoDia>({ concluidas: 0, adiadas: 0, puladas: 0 });
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
          return ok;
        },
        async adiar(t, prazoIso, motivo) {
          if (!prazoIso) return { ok: false, motivo: "escolha uma data" };
          if (!motivo.trim()) return { ok: false, motivo: "motivo obrigatório" };
          setEscritas((e) => ({ ...e, prazos: new Map(e.prazos).set(t.id, prazoIso) }));
          return ok;
        },
        async reatribuir(t, responsavelId) {
          setEscritas((e) => ({ ...e, responsaveis: new Map(e.responsaveis).set(t.id, responsavelId) }));
          return ok;
        },
        async arquivar(t, motivo) {
          if (!motivo.trim()) return { ok: false, motivo: "motivo obrigatório" };
          setEscritas((e) => ({ ...e, arquivadas: new Map(e.arquivadas).set(t.id, motivo) }));
          return ok;
        },
        async criar(dados: NovaTarefa) {
          const id = idNovoEnsaio(++contadorNovo.current);
          const nova: TarefaVisao = {
            id,
            lead_id: dados.leadId,
            lead_nome: dados.leadNome,
            titulo: dados.titulo,
            descricao: null,
            tipo: dados.tipo,
            responsavel: null,
            responsavel_id: dados.responsavelId,
            prazo: dados.prazoIso,
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
            prioridade: dados.prioridade ?? null,
          };
          setEscritas((e) => ({ ...e, criadas: [...e.criadas, nova] }));
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
      async criar(dados: NovaTarefa) {
        // `prioridade` não entra: `DadosTarefa` não a aceita e o payload de `tarefa_criada` ainda
        // não a tem — é o [M] do benchmark. Cai quieta aqui até a coluna existir.
        const r = await criarTarefaLead(dados.leadId, {
          titulo: dados.titulo,
          tipo: dados.tipo,
          responsavelId: dados.responsavelId,
          prazoIso: dados.prazoIso,
          mencoes: [],
        });
        if (r.ok) refrescar();
        return r;
      },
      async validarProposta(p, decisao, ajuste) {
        const r = await validarPropostaTarefa(p.id, decisao, ajuste ? payloadDaProposta(p, ajuste) : null);
        if (r.ok) refrescar();
        return r;
      },
    };
  }, [ensaio, refrescar]);

  /** as ações de UMA tarefa, amarradas — o que os painéis inline recebem */
  const acoesDe = useCallback(
    (t: TarefaVisao): AcoesDaTarefa => ({
      concluir: (resultado) => executor.concluir(t, resultado),
      adiar: (prazoIso, motivo) => executor.adiar(t, prazoIso, motivo),
      reatribuir: (id) => executor.reatribuir(t, id),
      arquivar: (motivo) => executor.arquivar(t, motivo),
    }),
    [executor],
  );

  const cont = useMemo(() => contadores(tarefas), [tarefas]);
  const filtradas = useMemo(
    () => aplicarFiltros(tarefas, filtros, meuId, agora),
    [tarefas, filtros, meuId, agora],
  );

  // F8 · o quadro por status cruza abertas E concluídas: aplica os mesmos filtros (busca,
  // responsável, tipo) duas vezes, uma por status, e ignora o recorte de prazo/vencidas —
  // no quadro a coluna é o status, e o prazo é informação do card, não de coluna.
  const tarefasQuadro = useMemo(() => {
    if (!quadro) return [];
    const base = { ...filtros, vencidas: false, prazo: "todos" as const };
    return [
      ...aplicarFiltros(tarefas, { ...base, status: "abertas" }, meuId, agora),
      ...aplicarFiltros(tarefas, { ...base, status: "concluidas" }, meuId, agora),
    ];
  }, [quadro, tarefas, filtros, meuId, agora]);

  // W-D5 · a view do dia: vencidas ∪ hoje sobre o que os filtros deixaram (minhas, busca, tipo)
  const modoHoje = !quadro && filtros.exibicao === "hoje";
  const fila = useMemo(() => (modoHoje ? filaDoDia(filtradas, agora) : []), [modoHoje, filtradas, agora]);
  const aba = quadro ? null : abaAtiva(filtros);
  const contagem = useMemo(() => contagemAbas(tarefas, meuId, agora), [tarefas, meuId, agora]);
  function escolherAba(a: Aba) {
    if (a === "hoje") setQuadro(false);
    setFiltros(filtrosDaAba(a, filtros));
    if (a !== "hoje") setFoco(null);
  }
  // propostas do recorte: "minhas" só as sugeridas para mim; "do time" todas
  const propostasDoRecorte = useMemo(
    () => (filtros.minhas && meuId ? propostasAbertas.filter((p) => p.responsavel_sugerido_id === meuId) : propostasAbertas),
    [propostasAbertas, filtros.minhas, meuId],
  );
  const [propostasVisiveis, setPropostasVisiveis] = useState(false);

  // histórico é lista, não funil (bucket de prazo só descreve compromisso futuro)
  const modoFunil = !quadro && !modoHoje && filtros.exibicao === "funil" && filtros.status === "abertas";
  const grupos = useMemo(
    () => (modoFunil ? agrupar(filtradas, filtros, agora, nomes) : []),
    [modoFunil, filtradas, filtros, agora, nomes],
  );
  const lista = useMemo(
    () => (modoFunil || modoHoje ? [] : ordenarLista(filtradas, filtros.status)),
    [modoFunil, modoHoje, filtradas, filtros.status],
  );

  // ── o "e agora?" e o andar do foco ──
  const filaIdsRef = useRef<string[]>([]);
  filaIdsRef.current = fila.map((t) => t.id);
  function andarFoco(depoisDe: string) {
    if (!modoHoje || foco !== depoisDe) return;
    // a tarefa saiu da fila (concluída/adiada): o próximo é o que ocupava a posição seguinte
    const ids = filaIdsRef.current;
    const i = ids.indexOf(depoisDe);
    setFoco(i >= 0 ? (ids[i + 1] ?? null) : proximaNaFila(ids, null));
  }
  function aoConcluida(t: TarefaVisao, resultado: string) {
    setProgresso((p) => ({ ...p, concluidas: p.concluidas + 1 }));
    setConcluindoId(null);
    // sem lead não há a quem dever a próxima — o foco anda direto
    if (t.lead_id) setEAgora({ tarefa: t, resultado });
    else andarFoco(t.id);
  }
  function fecharEAgora() {
    const t = eAgora?.tarefa;
    setEAgora(null);
    if (t) andarFoco(t.id);
  }
  function aoAdiada(t: TarefaVisao) {
    setProgresso((p) => ({ ...p, adiadas: p.adiadas + 1 }));
    andarFoco(t.id);
  }
  function mudarFoco(id: string | null) {
    if (foco && id && foco !== id && modoHoje) {
      const ids = filaIdsRef.current;
      if (ids.indexOf(id) === ids.indexOf(foco) + 1) setProgresso((p) => ({ ...p, puladas: p.puladas + 1 }));
    }
    setFoco(id);
  }

  // F2 / D62 (27/08): as tarefas do Jarvis vêm do BANCO (core.v_tarefa, origem jarvis_conversa)
  // e entram na fila como qualquer outra — com POR QUE e trecho no cartão. A faixa do protótipo
  // (sessionStorage) saiu daqui.

  const nadaNoWorkspace = tarefas.length === 0;
  const nadaComFiltro = !nadaNoWorkspace && !modoHoje && (quadro ? tarefasQuadro.length === 0 : filtradas.length === 0);

  return (
    <div className="flex h-[calc(100vh-var(--altura-topo))] flex-col bg-board">
      {/* ── cabeçalho: abas + contadores honestos + exibição ── */}
      <div className="flex flex-shrink-0 flex-wrap items-baseline gap-x-3.5 gap-y-2 px-5 pb-2 pt-3">
        {/* M6: o NOME DA PÁGINA subiu para o header (fonte única rota→título, `lib/header/titulos.ts`).
            A LINHA fica — os instrumentos são da tela; só o nome saiu dela (SPEC-M6 §5.4). */}
        <AbasTarefas ativa={aba} contagem={contagem} onEscolher={escolherAba} semMeuId={!meuId} />
        <span className="font-mono text-[12px] text-suave">
          {cont.abertas.toLocaleString("pt-BR")} abertas
          {cont.vencidas > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-vermelho">{cont.vencidas.toLocaleString("pt-BR")} vencidas</span>
            </>
          )}
        </span>
        {filtros.busca.trim() && (
          <span className="font-mono text-[12px] text-navy">
            · {filtradas.length.toLocaleString("pt-BR")}{" "}
            {filtradas.length === 1 ? "encontrada" : "encontradas"}
          </span>
        )}
        {dados.corte && (
          <span
            className="rounded-full bg-laranja-cl px-2.5 py-0.5 text-[11.5px] font-medium text-laranja-esc"
            title={
              filtros.busca.trim()
                ? "A leitura bateu no teto (500 abertas / 200 do histórico) e a busca só enxerga o que foi lido — pode haver tarefa fora desta lista que casaria com o texto."
                : "A leitura bateu no teto — mostrando as mais urgentes (abertas) e mais recentes (histórico)."
            }
          >
            {/* a busca é CLIENTE-SIDE: com o teto estourado ela é parcial, e dizer isso é o que
                separa "não achei" de "não existe". Mesmo problema apontado na spec para o funil. */}
            leitura no teto — {filtros.busca.trim() ? "busca parcial" : "lista parcial"}
          </span>
        )}
        {!modoHoje && (
          <div className="ml-auto flex items-center gap-2 self-center">
            {modoFunil && (
              <select
                value={filtros.agrupamento}
                onChange={(e) => mudar({ agrupamento: e.target.value as Agrupamento })}
                aria-label="Agrupar colunas por"
                className="cursor-pointer rounded-[6px] border border-linha bg-branco px-2 py-1.5 text-[12.5px] text-tinta outline-none focus:border-linha-forte"
              >
                <option value="prazo">Colunas por prazo</option>
                <option value="responsavel">Colunas por pessoa</option>
                <option value="lead">Colunas por lead</option>
                <option value="tipo">Colunas por tipo</option>
              </select>
            )}
            <div className="flex overflow-hidden rounded-[6px] border border-linha bg-branco" role="group" aria-label="Modo de exibição">
              {(["funil", "quadro", "lista"] as const).map((modo) => {
                const ativo = modo === "quadro" ? quadro : !quadro && filtros.exibicao === modo;
                return (
                  <button
                    key={modo}
                    type="button"
                    onClick={() => {
                      if (modo === "quadro") setQuadro(true);
                      else {
                        setQuadro(false);
                        mudar({ exibicao: modo });
                      }
                    }}
                    aria-pressed={ativo}
                    className={cn(
                      "px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                      ativo ? "bg-[#EAECF5] font-semibold text-navy" : "text-suave hover:bg-hover hover:text-tinta",
                    )}
                  >
                    {modo === "funil" ? "Prazo" : modo === "quadro" ? "Status" : "Lista"}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── barra de filtros (estado na URL — a visão é compartilhável por link) ──
          Na view Hoje só busca e tipo sobrevivem: minhas/status/prazo/vencidas SÃO a view. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 px-5 pb-3">
        {/* BUSCA — primeiro item da barra de propósito: é o caminho mais curto até UMA tarefa,
            e os seis filtros ao lado só sabem recortar CONJUNTOS. Filtra no cliente, sobre o
            que já foi lido (teto de 500 abertas / 200 fechadas de lib/dados/tarefas-visao.ts);
            quando esse teto estoura, o aviso ao lado do contador diz que a busca é parcial —
            a tela nunca finge completude que não tem. */}
        <label className="relative flex items-center">
          <span className="sr-only">Buscar tarefa por título, descrição ou lead</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
            className="pointer-events-none absolute left-2 h-[13px] w-[13px] text-mute"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={filtros.busca}
            onChange={(e) => mudar({ busca: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") mudar({ busca: "" });
            }}
            placeholder="Buscar tarefa, descrição ou lead…"
            className={cn(
              "w-[240px] rounded-full border bg-branco py-1 pl-[26px] pr-2.5 text-[12px] text-tinta outline-none transition-colors placeholder:text-mute",
              filtros.busca.trim() ? "border-navy" : "border-linha hover:bg-hover",
            )}
          />
        </label>

        {!modoHoje && (
          <>
            <button
              type="button"
              onClick={() => mudar({ minhas: !filtros.minhas, responsavelId: null })}
              disabled={!meuId}
              aria-pressed={filtros.minhas}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50",
                filtros.minhas
                  ? "border-navy bg-[#EAECF5] font-semibold text-navy"
                  : "border-linha bg-branco text-suave hover:bg-hover hover:text-tinta",
              )}
            >
              Minhas tarefas
            </button>

            <select
              value={filtros.minhas ? "" : filtros.responsavelId ?? ""}
              onChange={(e) => mudar({ responsavelId: e.target.value || null, minhas: false })}
              aria-label="Filtrar por responsável"
              className={cn(
                "cursor-pointer rounded-full border border-linha bg-branco px-2.5 py-1 text-[12px] outline-none transition-colors hover:bg-hover",
                filtros.responsavelId && !filtros.minhas ? "font-semibold text-navy" : "text-suave",
              )}
            >
              <option value="">Responsável: todos</option>
              {pessoas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </>
        )}

        {!quadro && !modoHoje && (
        <div className="flex overflow-hidden rounded-full border border-linha bg-branco" role="group" aria-label="Status">
          {(
            [
              ["abertas", "Abertas"],
              ["concluidas", "Concluídas"],
              ["arquivadas", "Arquivadas"],
            ] as [StatusFiltro, string][]
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              onClick={() => mudar({ status: chave, vencidas: false, prazo: "todos" })}
              aria-pressed={filtros.status === chave}
              className={cn(
                "px-2.5 py-1 text-[12px] font-medium transition-colors",
                filtros.status === chave
                  ? "bg-[#EAECF5] font-semibold text-navy"
                  : "text-suave hover:bg-hover hover:text-tinta",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
        )}

        {!quadro && !modoHoje && filtros.status === "abertas" && (
          <>
            <button
              type="button"
              onClick={() => mudar({ vencidas: !filtros.vencidas })}
              aria-pressed={filtros.vencidas}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                filtros.vencidas
                  ? "border-vermelho-bd bg-vermelho-bg font-semibold text-vermelho"
                  : "border-linha bg-branco text-suave hover:bg-hover hover:text-tinta",
              )}
            >
              Vencidas
              {cont.vencidas > 0 && (
                <span className="ml-1.5 font-mono text-[11px] tabular-nums">{cont.vencidas}</span>
              )}
            </button>

            <select
              value={filtros.prazo}
              onChange={(e) => mudar({ prazo: e.target.value as FiltrosTarefas["prazo"] })}
              aria-label="Filtrar por prazo"
              className={cn(
                "cursor-pointer rounded-full border border-linha bg-branco px-2.5 py-1 text-[12px] outline-none transition-colors hover:bg-hover",
                filtros.prazo !== "todos" ? "font-semibold text-navy" : "text-suave",
              )}
            >
              <option value="todos">Prazo: todos</option>
              <option value="hoje">Hoje</option>
              <option value="amanha">Até amanhã</option>
              <option value="semana">Esta semana</option>
              <option value="sem_prazo">Sem prazo</option>
            </select>
          </>
        )}

        <select
          value={filtros.tipo ?? ""}
          onChange={(e) => mudar({ tipo: e.target.value || null })}
          aria-label="Filtrar por tipo"
          className={cn(
            "cursor-pointer rounded-full border border-linha bg-branco px-2.5 py-1 text-[12px] outline-none transition-colors hover:bg-hover",
            filtros.tipo ? "font-semibold text-navy" : "text-suave",
          )}
        >
          <option value="">Tipo: todos</option>
          {tiposTarefa.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.rotulo}
            </option>
          ))}
        </select>

        {!modoHoje && temFiltroAtivo(filtros) && (
          <button
            type="button"
            onClick={() =>
              mudar({
                minhas: FILTROS_PADRAO.minhas,
                responsavelId: FILTROS_PADRAO.responsavelId,
                status: FILTROS_PADRAO.status,
                vencidas: FILTROS_PADRAO.vencidas,
                prazo: FILTROS_PADRAO.prazo,
                tipo: FILTROS_PADRAO.tipo,
                busca: FILTROS_PADRAO.busca,
              })
            }
            className="rounded-full px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
          >
            Limpar filtros
          </button>
        )}
        {modoHoje && (filtros.busca.trim() || filtros.tipo) && (
          <button
            type="button"
            onClick={() => mudar({ tipo: null, busca: "" })}
            className="rounded-full px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
          >
            Limpar
          </button>
        )}
      </div>

      {/* ── conteúdo ── */}
      {modoHoje ? (
        <FilaDoDia
          fila={fila}
          propostas={propostasDoRecorte}
          pessoas={pessoasAtivas}
          nomes={nomes}
          agora={agora}
          foco={foco}
          onFoco={mudarFoco}
          progresso={progresso}
          acoesDe={acoesDe}
          aoConcluida={aoConcluida}
          aoAdiada={aoAdiada}
          validarProposta={executor.validarProposta}
          aoRefrescar={refrescar}
        />
      ) : nadaNoWorkspace ? (
        <Vazio>
          Nenhuma tarefa aberta.{" "}
          <button
            type="button"
            onClick={() => router.push("/conversas")}
            className="font-semibold text-navy underline-offset-2 hover:underline"
          >
            Criar na conversa
          </button>
        </Vazio>
      ) : nadaComFiltro ? (
        <Vazio>
          {filtros.busca.trim() ? (
            <>
              Nenhuma tarefa com <b className="font-semibold text-tinta">“{filtros.busca.trim()}”</b>{" "}
              no título, na descrição ou no nome do lead
              {dados.corte && " — e a leitura bateu no teto, então pode haver tarefa fora desta lista"}.{" "}
            </>
          ) : (
            <>Nenhuma tarefa passa pelos filtros ativos. </>
          )}
          <button
            type="button"
            onClick={() =>
              mudar({ minhas: false, responsavelId: null, status: "abertas", vencidas: false, prazo: "todos", tipo: null, busca: "" })
            }
            className="font-semibold text-navy underline-offset-2 hover:underline"
          >
            Limpar filtros
          </button>
        </Vazio>
      ) : quadro ? (
        <QuadroStatus
          tarefas={tarefasQuadro}
          emAndamento={idsEmAndamento}
          emAndamentoDisponivel={emAndamento.disponivel}
          agora={agora}
          nomes={nomes}
          aoMudar={refrescar}
        />
      ) : modoFunil ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {propostasDoRecorte.length > 0 && (
            <div className="px-5">
              <BlocoPropostas
                propostas={propostasDoRecorte}
                pessoas={pessoasAtivas}
                agora={agora}
                validar={executor.validarProposta}
                aberto={propostasVisiveis}
                onToggle={() => setPropostasVisiveis((v) => !v)}
              />
            </div>
          )}
          <div className="flex flex-1 items-stretch gap-3 overflow-x-auto px-5 pb-5">
            {grupos.map((g) => (
              <div key={g.chave} className="flex h-full w-coluna shrink-0 flex-col">
                <div className="flex items-center gap-2 px-1 pb-2.5 pt-1.5">
                  <span
                    className={cn(
                      "truncate text-[12.5px] font-semibold uppercase tracking-[0.05em]",
                      g.vermelho ? "text-vermelho" : "text-suave",
                    )}
                  >
                    {g.rotulo}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-full border px-2 py-px font-mono text-[11.5px] tabular-nums",
                      g.vermelho && g.tarefas.length > 0
                        ? "border-vermelho-bd bg-vermelho-bg font-semibold text-vermelho"
                        : "border-linha bg-branco text-suave",
                    )}
                  >
                    {g.tarefas.length}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[10px] px-0.5 pb-8 pt-px">
                  {g.tarefas.map((t) => (
                    <CartaoTarefa
                      key={t.id}
                      t={t}
                      agora={agora}
                      nomes={nomes}
                      pessoas={pessoasAtivas}
                      acoes={acoesDe(t)}
                      acoesAberta={acoesId === t.id}
                      onToggleAcoes={() => abrirAcoes(t.id)}
                      onFecharAcoes={() => setAcoesId(null)}
                      concluindo={concluindoId === t.id}
                      onToggleConcluir={() => abrirConcluir(t.id)}
                      onFecharConcluir={() => setConcluindoId(null)}
                      aoConcluida={(resultado) => aoConcluida(t, resultado)}
                      aoMudar={refrescar}
                    />
                  ))}
                  {g.tarefas.length === 0 && (
                    <p className="rounded-lg border border-dashed border-linha px-1.5 py-3.5 text-center text-[12px] text-mute">
                      {g.vermelho ? "Nada vencido — fila limpa" : "Nenhuma tarefa"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <div className="mx-auto max-w-3xl">
            {filtros.status === "abertas" && (
              <BlocoPropostas
                propostas={propostasDoRecorte}
                pessoas={pessoasAtivas}
                agora={agora}
                validar={executor.validarProposta}
                aberto={propostasVisiveis}
                onToggle={() => setPropostasVisiveis((v) => !v)}
              />
            )}
            <div className="rounded-[10px] border border-linha bg-branco px-4 py-1">
              {lista.map((t) => (
                <LinhaTarefa
                  key={t.id}
                  t={t}
                  agora={agora}
                  nomes={nomes}
                  pessoas={pessoasAtivas}
                  acoes={acoesDe(t)}
                  acoesAberta={acoesId === t.id}
                  onToggleAcoes={() => abrirAcoes(t.id)}
                  onFecharAcoes={() => setAcoesId(null)}
                  concluindo={concluindoId === t.id}
                  onToggleConcluir={() => abrirConcluir(t.id)}
                  onFecharConcluir={() => setConcluindoId(null)}
                  aoConcluida={(resultado) => aoConcluida(t, resultado)}
                  aoMudar={refrescar}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* "E AGORA?" — depois de concluir qualquer tarefa com lead, em qualquer exibição */}
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

/** `?ver=quadro` e `?foco=<id>` entram na URL por fora de `serializarFiltros` (módulos de outras frentes). */
function comExtras(qs: string, quadro: boolean, foco: string | null): string {
  if (!quadro && !foco) return qs;
  const p = new URLSearchParams(qs);
  if (quadro) p.set("ver", "quadro");
  if (foco) p.set("foco", foco);
  return p.toString();
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-5 pb-16">
      <p className="max-w-md text-center text-[13.5px] leading-relaxed text-suave">{children}</p>
    </div>
  );
}

/**
 * Corpo clicável → a conversa ancorada (31/08). Navegação programática em vez de <Link>: as
 * ações de ciclo de vida (R14) moram DENTRO do card, e botão dentro de âncora não é HTML válido.
 * O painel de ações faz stopPropagation — clicar nele não navega.
 */
function ComLead({
  t,
  className,
  children,
}: {
  t: TarefaVisao;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // `id` estável: a timeline da conversa linka `/tarefas#tarefa-<id>` (F2).
  const destino = destinoDaTarefa(t);
  if (!destino) return <div id={`tarefa-${t.id}`} className={className}>{children}</div>;
  return (
    <div
      id={`tarefa-${t.id}`}
      role="link"
      tabIndex={0}
      onClick={() => router.push(destino)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(destino);
      }}
      className={cn(className, "cursor-pointer")}
    >
      {children}
    </div>
  );
}

interface PropsAcoes {
  pessoas: PessoaAtiva[];
  acoes: AcoesDaTarefa;
  acoesAberta: boolean;
  onToggleAcoes: () => void;
  onFecharAcoes: () => void;
  concluindo: boolean;
  onToggleConcluir: () => void;
  onFecharConcluir: () => void;
  /** W-D5 · abre o "e agora?" no pai, com o resultado em mãos */
  aoConcluida: (resultado: string) => void;
  aoMudar: () => void;
}

/** o executor do painel de concluir: escreve e, no sucesso, avisa o pai com o resultado */
function executorConcluir(acoes: AcoesDaTarefa, aoConcluida: (resultado: string) => void): AcoesDaTarefa {
  return {
    concluir: async (resultado) => {
      const r = acoes.concluir ? await acoes.concluir(resultado) : { ok: false, motivo: "sem executor" };
      if (r.ok) aoConcluida(resultado);
      return r;
    },
  };
}

function CartaoTarefa({
  t,
  agora,
  nomes,
  pessoas,
  acoes,
  acoesAberta,
  onToggleAcoes,
  onFecharAcoes,
  concluindo,
  onToggleConcluir,
  onFecharConcluir,
  aoConcluida,
  aoMudar,
}: {
  t: TarefaVisao;
  agora: number;
  nomes: { membros: Map<string, string>; tipos: Map<string, string> };
} & PropsAcoes) {
  return (
    <ComLead
      t={t}
      className={cn(
        "relative rounded-[10px] border bg-branco px-3 py-2.5 transition-colors",
        t.lead_id && "hover:border-linha-forte",
        t.vencida ? "border-vermelho-bd" : "border-linha",
      )}
    >
      <RailPrioridade prioridade={t.prioridade} />
      <div className="flex items-start gap-1.5">
        {t.status === "pendente" && (
          <BotaoConcluir titulo={t.titulo} aberto={concluindo} onToggle={onToggleConcluir} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug text-tinta">{t.titulo}</div>
          {/* o POR QUE AGORA / FAZER — vinha do banco em toda leitura e não era desenhado */}
          {t.descricao && (
            <div className="mt-0.5 whitespace-pre-line text-[12px] leading-snug text-suave">{t.descricao}</div>
          )}
          <PorQueJarvis t={t} />
          {t.lead_nome && <div className="mt-0.5 truncate text-[12px] text-suave">{t.lead_nome}</div>}
        </div>
        {t.status === "pendente" && <BotaoAcoes aberto={acoesAberta} onToggle={onToggleAcoes} />}
      </div>
      <div className="mt-1.5">
        <MetaTarefa t={t} agora={agora} nomes={nomes} />
      </div>
      {concluindo && t.status === "pendente" && (
        <PainelConcluir
          leadId={t.lead_id}
          tarefaId={t.id}
          executor={executorConcluir(acoes, aoConcluida)}
          aoSucesso={onFecharConcluir}
          onFechar={onFecharConcluir}
        />
      )}
      {acoesAberta && t.status === "pendente" && (
        <AcoesTarefa
          leadId={t.lead_id}
          tarefaId={t.id}
          prazoAtual={t.prazo}
          responsavelAtualId={t.responsavel_id}
          pessoas={pessoas}
          agora={agora}
          executor={acoes}
          aoSucesso={aoMudar}
          onFechar={onFecharAcoes}
        />
      )}
    </ComLead>
  );
}

function LinhaTarefa({
  t,
  agora,
  nomes,
  pessoas,
  acoes,
  acoesAberta,
  onToggleAcoes,
  onFecharAcoes,
  concluindo,
  onToggleConcluir,
  onFecharConcluir,
  aoConcluida,
  aoMudar,
}: {
  t: TarefaVisao;
  agora: number;
  nomes: { membros: Map<string, string>; tipos: Map<string, string> };
} & PropsAcoes) {
  const fechada = t.status !== "pendente";
  return (
    <ComLead
      t={t}
      className={cn(
        "relative border-b border-[#F1F0EC] py-2.5 last:border-b-0",
        t.lead_id && "-mx-2 rounded-md px-2 transition-colors hover:bg-hover",
      )}
    >
      {!fechada && <RailPrioridade prioridade={t.prioridade} />}
      <div className="flex items-baseline gap-2">
        {t.status === "pendente" && (
          <span className="self-center">
            <BotaoConcluir titulo={t.titulo} aberto={concluindo} onToggle={onToggleConcluir} />
          </span>
        )}
        <span className={cn("min-w-0 flex-1 truncate text-[13.5px] leading-snug", fechada ? "text-suave line-through decoration-mute" : "text-tinta")}>
          {t.titulo}
        </span>
        {t.lead_nome && <span className="shrink-0 text-[12px] text-suave">{t.lead_nome}</span>}
        {t.status === "pendente" && (
          <span className="self-center">
            <BotaoAcoes aberto={acoesAberta} onToggle={onToggleAcoes} />
          </span>
        )}
      </div>
      {/* o POR QUE AGORA / FAZER — vinha do banco em toda leitura e não era desenhado */}
      {t.descricao && (
        <div className={cn("mt-0.5 whitespace-pre-line text-[12px] leading-snug", fechada ? "text-mute" : "text-suave")}>
          {t.descricao}
        </div>
      )}
      <PorQueJarvis t={t} apagada={fechada} />
      {t.status === "concluida" && t.resultado && (
        <div className="mt-0.5 text-[12px] leading-snug text-suave">→ {t.resultado}</div>
      )}
      {t.status === "arquivada" && (
        <div className="mt-0.5 text-[12px] leading-snug text-mute">
          arquivada{t.motivo_arquivo ? ` — ${t.motivo_arquivo}` : ""}
        </div>
      )}
      <div className="mt-1.5">
        <MetaTarefa t={t} agora={agora} nomes={nomes} apagada={fechada} />
      </div>
      {concluindo && t.status === "pendente" && (
        <PainelConcluir
          leadId={t.lead_id}
          tarefaId={t.id}
          executor={executorConcluir(acoes, aoConcluida)}
          aoSucesso={onFecharConcluir}
          onFechar={onFecharConcluir}
        />
      )}
      {acoesAberta && t.status === "pendente" && (
        <AcoesTarefa
          leadId={t.lead_id}
          tarefaId={t.id}
          prazoAtual={t.prazo}
          responsavelAtualId={t.responsavel_id}
          pessoas={pessoas}
          agora={agora}
          executor={acoes}
          aoSucesso={aoMudar}
          onFechar={onFecharAcoes}
        />
      )}
    </ComLead>
  );
}

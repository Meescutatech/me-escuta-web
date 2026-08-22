"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { DadosVisaoTarefas } from "@/lib/dados/tarefas-visao";
import { iniciaisDe, nomeResponsavel, textoPrazo } from "@/lib/dados/tarefa-calculos";
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
import { useProjecaoViva } from "@/components/projecao-viva";
import { INTERVALOS } from "@/lib/intervalos-vivos";
import { AcoesTarefa, BotaoAcoes, type PessoaAtiva } from "@/components/tarefas/acoes-tarefa";
import { BotaoConcluir, PainelConcluir } from "@/components/tarefas/concluir-tarefa";
import { LinhaTarefaAutomatica } from "@/components/tarefas/tarefa-automatica";
import { useFilaPrototipo } from "@/lib/tarefas/fila-prototipo";
import { cn } from "@/lib/utils";

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
 */

export function VisaoTarefas({
  dados,
  filtrosIniciais,
  meuId,
  mencionaveis,
  tiposTarefa,
}: {
  dados: DadosVisaoTarefas;
  filtrosIniciais: FiltrosTarefas;
  meuId: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState<FiltrosTarefas>(filtrosIniciais);
  const [agora, setAgora] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // tarefa muda pouco, mas quem deixa a aba aberta merece ver a fila andar sozinha
  useProjecaoViva([{ tabela: { schema: "core", table: "tarefa" } }], { intervaloMs: INTERVALOS.tarefas });

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
  const qsEscritaRef = useRef(serializarFiltros(filtrosIniciais));
  useEffect(() => {
    const qs = serializarFiltros(filtros);
    if (qs === qsEscritaRef.current) return;
    const t = setTimeout(() => {
      qsEscritaRef.current = qs;
      router.replace(qs ? `/tarefas?${qs}` : "/tarefas", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [filtros, filtrosIniciais, router]);

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

  const cont = useMemo(() => contadores(dados.tarefas), [dados.tarefas]);
  const filtradas = useMemo(
    () => aplicarFiltros(dados.tarefas, filtros, meuId, agora),
    [dados.tarefas, filtros, meuId, agora],
  );

  // histórico é lista, não funil (bucket de prazo só descreve compromisso futuro)
  const modoFunil = filtros.exibicao === "funil" && filtros.status === "abertas";
  const grupos = useMemo(
    () => (modoFunil ? agrupar(filtradas, filtros, agora, nomes) : []),
    [modoFunil, filtradas, filtros, agora, nomes],
  );
  const lista = useMemo(
    () => (modoFunil ? [] : ordenarLista(filtradas, filtros.status)),
    [modoFunil, filtradas, filtros.status],
  );

  /**
   * D10 (18/08) · as tarefas que o Jarvis criou SOZINHO, por tipo `auto`. Vêm da fila do
   * protótipo (sessionStorage), não do banco — criar tarefa de verdade escreveria em produção.
   * Ficam ACIMA da lista e ANTES dos estados vazios, de propósito: elas existem mesmo quando o
   * workspace não tem nenhuma tarefa real, e é justamente aí que precisam aparecer.
   */
  const automaticas = useFilaPrototipo();

  const nadaNoWorkspace = dados.tarefas.length === 0;
  const nadaComFiltro = !nadaNoWorkspace && filtradas.length === 0;

  return (
    <div className="flex h-[calc(100vh-var(--altura-topo))] flex-col bg-board">
      {/* ── cabeçalho: título + contadores honestos + exibição ── */}
      <div className="flex flex-shrink-0 flex-wrap items-baseline gap-x-3.5 gap-y-2 px-5 pb-2 pt-4">
        {/* M6: o NOME DA PÁGINA subiu para o header (fonte única rota→título, `lib/header/titulos.ts`).
            A LINHA fica — os instrumentos são da tela; só o nome saiu dela (SPEC-M6 §5.4). */}
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
        <div className="ml-auto flex items-center gap-2 self-center">
          {modoFunil && (
            <select
              value={filtros.agrupamento}
              onChange={(e) => mudar({ agrupamento: e.target.value as Agrupamento })}
              aria-label="Agrupar colunas por"
              className="cursor-pointer rounded-[6px] border border-linha bg-branco px-2 py-1.5 text-[12.5px] text-tinta outline-none focus:border-linha-forte"
            >
              <option value="prazo">Colunas por prazo</option>
              <option value="responsavel">Colunas por responsável</option>
              <option value="tipo">Colunas por tipo</option>
            </select>
          )}
          <div className="flex overflow-hidden rounded-[6px] border border-linha bg-branco" role="group" aria-label="Modo de exibição">
            {(["funil", "lista"] as const).map((modo) => (
              <button
                key={modo}
                type="button"
                onClick={() => mudar({ exibicao: modo })}
                aria-pressed={filtros.exibicao === modo}
                className={cn(
                  "px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  filtros.exibicao === modo
                    ? "bg-[#EAECF5] font-semibold text-navy"
                    : "text-suave hover:bg-hover hover:text-tinta",
                )}
              >
                {modo === "funil" ? "Funil" : "Lista"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── barra de filtros (estado na URL — a visão é compartilhável por link) ── */}
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

        {filtros.status === "abertas" && (
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

        {temFiltroAtivo(filtros) && (
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
      </div>

      {/* ── D10 · criadas pelo Jarvis sem pedir licença ──
          O que muda na tarefa `auto` é QUEM APROVA, não a transparência: cada linha carrega o
          POR QUE AGORA, a frase citada, o fundamento de por que este tipo pôde nascer sozinho,
          e o RECUSAR depois do fato. Autonomia sem desfazer é imposição. */}
      {automaticas.length > 0 && (
        <div className="flex-shrink-0 border-y border-linha bg-branco/60 px-5 py-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[12.5px] font-semibold text-navy">Criadas pelo Jarvis</span>
            <span className="font-mono text-[11.5px] tabular-nums text-mute">{automaticas.length}</span>
            <span className="text-[11.5px] text-mute">
              · nasceram sem pedir aprovação porque o tipo delas é automático — você pode recusar
            </span>
            <span className="ml-auto rounded-full bg-laranja-cl px-2 py-px text-[10.5px] font-semibold uppercase tracking-wide text-laranja-esc">
              protótipo — nada é salvo
            </span>
          </div>
          <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
            {automaticas.map((t) => (
              <LinhaTarefaAutomatica key={t.proposta.id} tarefa={t} />
            ))}
          </div>
        </div>
      )}

      {/* ── conteúdo ── */}
      {nadaNoWorkspace ? (
        <Vazio>
          {/* A tela dizia as DUAS coisas ao mesmo tempo: a faixa do Jarvis com tarefa em cima, e
              logo abaixo "nenhuma tarefa ainda". As duas frases eram verdade — `core.tarefa` tem 0
              linhas e a do Jarvis é do protótipo — mas juntas ficam contraditórias para quem olha,
              e quem olha não tem como saber que são dois lugares diferentes. Então o vazio passa a
              dizer QUAL vazio é, em vez de negar o que está logo acima dele. */}
          {automaticas.length > 0 ? (
            <>
              Nenhuma tarefa <b className="font-semibold text-suave">salva no workspace</b> ainda —{" "}
              {automaticas.length === 1 ? "a tarefa acima foi criada" : `as ${automaticas.length} tarefas acima foram criadas`}{" "}
              pelo Jarvis neste protótipo e não está no banco. Para criar uma de verdade, digite{" "}
              <code className="rounded border border-linha bg-branco px-1.5 py-px font-mono text-[12.5px] text-tinta">/tarefa</code>{" "}
              no campo de uma conversa.
            </>
          ) : (
            <>
              Nenhuma tarefa no workspace ainda. Digite{" "}
              <code className="rounded border border-linha bg-branco px-1.5 py-px font-mono text-[12.5px] text-tinta">/tarefa</code>{" "}
              no campo de uma conversa, ou crie pelo painel do lead no funil.
            </>
          )}
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
      ) : modoFunil ? (
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
                    acoesAberta={acoesId === t.id}
                    onToggleAcoes={() => abrirAcoes(t.id)}
                    onFecharAcoes={() => setAcoesId(null)}
                    concluindo={concluindoId === t.id}
                    onToggleConcluir={() => abrirConcluir(t.id)}
                    onFecharConcluir={() => setConcluindoId(null)}
                    aoMudar={() => router.refresh()}
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
      ) : (
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <div className="mx-auto max-w-3xl rounded-[10px] border border-linha bg-branco px-4 py-1">
            {lista.map((t) => (
              <LinhaTarefa
                key={t.id}
                t={t}
                agora={agora}
                nomes={nomes}
                pessoas={pessoasAtivas}
                acoesAberta={acoesId === t.id}
                onToggleAcoes={() => abrirAcoes(t.id)}
                onFecharAcoes={() => setAcoesId(null)}
                concluindo={concluindoId === t.id}
                onToggleConcluir={() => abrirConcluir(t.id)}
                onFecharConcluir={() => setConcluindoId(null)}
                aoMudar={() => router.refresh()}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-5 pb-16">
      <p className="max-w-md text-center text-[13.5px] leading-relaxed text-suave">{children}</p>
    </div>
  );
}

/**
 * Corpo clicável → drawer do lead no funil (onde concluir vive). Navegação programática em
 * vez de <Link>: as ações de ciclo de vida (R14) moram DENTRO do card, e botão dentro de
 * âncora não é HTML válido. O painel de ações faz stopPropagation — clicar nele não navega.
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
  if (!t.lead_id) return <div className={className}>{children}</div>;
  const destino = `/funil?lead=${t.lead_id}`;
  return (
    <div
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
  acoesAberta: boolean;
  onToggleAcoes: () => void;
  onFecharAcoes: () => void;
  concluindo: boolean;
  onToggleConcluir: () => void;
  onFecharConcluir: () => void;
  aoMudar: () => void;
}

function MetaTarefa({
  t,
  agora,
  nomes,
  apagada,
}: {
  t: TarefaVisao;
  agora: number;
  nomes: { membros: Map<string, string>; tipos: Map<string, string> };
  apagada?: boolean;
}) {
  const quem = nomeResponsavel(t, nomes.membros);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]", apagada ? "text-mute" : "text-suave")}>
      {quem && (
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[8.5px] font-semibold text-branco",
              apagada ? "bg-mute" : "bg-navy",
            )}
          >
            {iniciaisDe(quem)}
          </span>
          {quem}
        </span>
      )}
      {quem && <span className="text-linha">·</span>}
      <span className={cn("font-mono tabular-nums", t.vencida && "font-semibold text-vermelho")}>
        {textoPrazo(t, agora)}
      </span>
      {t.tipo && (
        <span className="rounded-full border border-linha bg-board px-2 py-px text-[10.5px]">
          {nomes.tipos.get(t.tipo) ?? t.tipo}
        </span>
      )}
    </div>
  );
}

function CartaoTarefa({
  t,
  agora,
  nomes,
  pessoas,
  acoesAberta,
  onToggleAcoes,
  onFecharAcoes,
  concluindo,
  onToggleConcluir,
  onFecharConcluir,
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
        "rounded-[10px] border bg-branco px-3 py-2.5 transition-colors",
        t.lead_id && "hover:border-linha-forte",
        t.vencida ? "border-vermelho-bd" : "border-linha",
      )}
    >
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
          aoSucesso={aoMudar}
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
  acoesAberta,
  onToggleAcoes,
  onFecharAcoes,
  concluindo,
  onToggleConcluir,
  onFecharConcluir,
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
        "border-b border-[#F1F0EC] py-2.5 last:border-b-0",
        t.lead_id && "-mx-2 rounded-md px-2 transition-colors hover:bg-hover",
      )}
    >
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
          aoSucesso={aoMudar}
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
          aoSucesso={aoMudar}
          onFechar={onFecharAcoes}
        />
      )}
    </ComLead>
  );
}

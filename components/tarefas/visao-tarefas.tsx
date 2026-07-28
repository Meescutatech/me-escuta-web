"use client";

import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

/*
 * VISÃO DE TAREFAS (`/tarefas`, Rodada 14) — a tela de tarefas do Kommo, com o contrato nosso.
 * O funil aqui é o TEMPO: colunas Vencidas · Hoje · Amanhã · Esta semana · Depois · Sem prazo.
 * Vencidas é a ÚNICA coluna vermelha — no Kommo 97,9% da fila aberta estava vencida e o
 * vermelho não dizia nada; aqui ele fica contido numa coluna que dá pra esvaziar.
 *
 * Nenhuma escrita nesta tela: clicar numa tarefa leva ao drawer do lead no funil
 * (/funil?lead=…), onde concluir-com-resultado já existe. Histórico (concluídas/arquivadas)
 * é lista, não funil — bucket de prazo só faz sentido pra compromisso futuro.
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
    const novo = { ...filtros, ...parcial };
    setFiltros(novo);
    const qs = serializarFiltros(novo);
    router.replace(qs ? `/tarefas?${qs}` : "/tarefas", { scroll: false });
  }

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
        {dados.corte && (
          <span
            className="rounded-full bg-laranja-cl px-2.5 py-0.5 text-[11.5px] font-medium text-laranja-esc"
            title="A leitura bateu no teto — mostrando as mais urgentes (abertas) e mais recentes (histórico)."
          >
            leitura no teto — lista parcial
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
              })
            }
            className="rounded-full px-2 py-1 text-[12px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── conteúdo ── */}
      {nadaNoWorkspace ? (
        <Vazio>
          Nenhuma tarefa no workspace ainda. Digite{" "}
          <code className="rounded border border-linha bg-branco px-1.5 py-px font-mono text-[12.5px] text-tinta">/tarefa</code>{" "}
          no campo de uma conversa, ou crie pelo painel do lead no funil.
        </Vazio>
      ) : nadaComFiltro ? (
        <Vazio>
          Nenhuma tarefa passa pelos filtros ativos.{" "}
          <button
            type="button"
            onClick={() =>
              mudar({ minhas: false, responsavelId: null, status: "abertas", vencidas: false, prazo: "todos", tipo: null })
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
                    onToggleAcoes={() => setAcoesId(acoesId === t.id ? null : t.id)}
                    onFecharAcoes={() => setAcoesId(null)}
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
                onToggleAcoes={() => setAcoesId(acoesId === t.id ? null : t.id)}
                onFecharAcoes={() => setAcoesId(null)}
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
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug text-tinta">{t.titulo}</div>
          {t.lead_nome && <div className="mt-0.5 truncate text-[12px] text-suave">{t.lead_nome}</div>}
        </div>
        {t.status === "pendente" && <BotaoAcoes aberto={acoesAberta} onToggle={onToggleAcoes} />}
      </div>
      <div className="mt-1.5">
        <MetaTarefa t={t} agora={agora} nomes={nomes} />
      </div>
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

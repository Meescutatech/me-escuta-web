import Link from "next/link";
import type { DadosDashboardCeo } from "@/lib/dados/dashboard-ceo";
import {
  fmtInt,
  fmtMinutos,
  fmtMoeda,
  fmtPct,
  tendencia,
  textoVariacao,
  tipoDoAtor,
  type Comparado,
  type EtapaResumo,
  type ResumoAtor,
} from "@/lib/dados/dashboard-ceo-calculos";
import { ROTULO_FAIXA, FAIXAS_ESCALA } from "@/lib/dados/funil-ordenacao";
import { cn } from "@/lib/utils";
import { ControlesDashboard } from "./controles";
import { GraficoBarras } from "./grafico-barras";

/*
 * Dashboard — a tela do CEO (R27 · F6, plano 27/08 §0).
 *
 * Uma pergunta por bloco, e cada numero vem com o mesmo numero do periodo anterior:
 *   1. o que aconteceu (leads, conversas, 1a resposta, valor, % em AGORA)
 *   2. quem atendeu — agente x humano (o trilho dividido e a assinatura da tela)
 *   3. o funil no periodo — entradas por etapa e conversao "ate aqui"
 *   4. por ator — Clara, Jarvis, Sarah, Fernando… lado a lado, mesmas colunas
 * Sem explicacao de sistema na tela: estado vazio e uma linha com acao.
 */

const FILL_AGENTE = "fill-azul-graf";
const FILL_HUMANO = "fill-laranja";
const BG_AGENTE = "bg-azul-graf";
const BG_HUMANO = "bg-laranja";

// ─────────────── peças ───────────────

function Secao({
  titulo,
  direita,
  children,
  className,
}: {
  titulo: string;
  direita?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[10px] border border-linha bg-branco px-5 py-[18px]", className)}>
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-suave">{titulo}</h2>
        {direita && <span className="ml-auto">{direita}</span>}
      </div>
      {children}
    </section>
  );
}

/** "+12%" verde / "−8%" vermelho / "=" / "—" — sempre com o texto, nunca so a cor. */
function Delta({ c, menorEhMelhor = false, className }: { c: Comparado; menorEhMelhor?: boolean; className?: string }) {
  const t = tendencia(c, menorEhMelhor);
  const txt = textoVariacao(c);
  return (
    <span
      className={cn(
        "font-mono text-[11.5px] tabular-nums",
        t === "melhor" && "text-verde",
        t === "pior" && "text-vermelho",
        (t === "igual" || t === "sem") && "text-mute",
        className,
      )}
      title={c.anterior == null ? undefined : `período anterior: ${fmtInt(c.anterior)}`}
    >
      {txt}
    </span>
  );
}

function Kpi({
  rotulo,
  valor,
  delta,
  menorEhMelhor,
  sub,
  tom,
}: {
  rotulo: string;
  valor: React.ReactNode;
  delta?: Comparado;
  menorEhMelhor?: boolean;
  sub?: React.ReactNode;
  tom?: "alerta";
}) {
  return (
    <div className={cn("rounded-[10px] border bg-branco px-5 py-4", tom === "alerta" ? "border-vermelho-bd" : "border-linha")}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-suave">{rotulo}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            "text-[30px] font-[650] leading-[1.1] tracking-[-0.02em] tabular-nums",
            tom === "alerta" ? "text-vermelho" : "text-tinta",
          )}
        >
          {valor}
        </span>
        {delta && <Delta c={delta} menorEhMelhor={menorEhMelhor} />}
      </div>
      {sub && <div className="mt-1 text-[12px] text-suave">{sub}</div>}
    </div>
  );
}

function Ponto({ tipo }: { tipo: "agente" | "humano" | "sistema" }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-[2px]",
        tipo === "agente" ? BG_AGENTE : tipo === "humano" ? BG_HUMANO : "bg-mute",
      )}
      aria-hidden
    />
  );
}

function Legenda() {
  return (
    <span className="flex items-center gap-3 text-[11.5px] text-suave">
      <span className="flex items-center gap-1.5">
        <Ponto tipo="agente" /> agentes
      </span>
      <span className="flex items-center gap-1.5">
        <Ponto tipo="humano" /> pessoas
      </span>
    </span>
  );
}

function Metrica({ rot, val, delta, menorEhMelhor }: { rot: string; val: string; delta?: Comparado; menorEhMelhor?: boolean }) {
  return (
    <div className="flex min-h-8 items-baseline justify-between gap-2">
      <span className="truncate text-[12.5px] text-suave">{rot}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[14px] font-semibold tabular-nums text-tinta">{val}</span>
        {delta && <Delta c={delta} menorEhMelhor={menorEhMelhor} />}
      </span>
    </div>
  );
}

function Acao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-laranja-esc hover:underline">
      {children}
    </Link>
  );
}

// ─────────────── 2. agente × humano ───────────────

function TrilhoAgenteHumano({ dados }: { dados: DadosDashboardCeo }) {
  const a = dados.atendimento;
  const ag = a.conversasAgente.atual ?? 0;
  const hu = a.conversasHumano.atual ?? 0;
  const total = ag + hu;
  const frac = a.fracaoAgente;
  const fracHumano = frac == null ? null : 1 - frac;
  return (
    <Secao titulo="Quem atendeu" direita={<Legenda />}>
      {total === 0 ? (
        <p className="text-[13px] text-suave">
          Nenhuma conversa respondida no período. <Acao href="/conversas">Abrir conversas →</Acao>
        </p>
      ) : (
        <>
          {/* o trilho: uma barra, dois lados, os dois percentuais escritos dentro */}
          <div
            className="flex h-9 w-full overflow-hidden rounded-[8px] bg-board"
            role="img"
            aria-label={`${fmtPct(frac)} das conversas respondidas primeiro por agente, ${fmtPct(fracHumano)} por pessoa`}
          >
            {ag > 0 && (
              <div
                className={cn("flex items-center px-3 text-[12.5px] font-semibold text-branco", BG_AGENTE)}
                style={{ width: `${(ag / total) * 100}%`, minWidth: 48 }}
              >
                <span className="tabular-nums">{fmtPct(frac)}</span>
              </div>
            )}
            {hu > 0 && (
              <div
                className={cn("ml-auto flex items-center justify-end px-3 text-[12.5px] font-semibold text-branco", BG_HUMANO)}
                style={{ width: `${(hu / total) * 100}%`, minWidth: 48 }}
              >
                <span className="tabular-nums">{fmtPct(fracHumano)}</span>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-4">
            <Metrica rot="Por agente" val={fmtInt(ag)} delta={a.conversasAgente} />
            <Metrica rot="Por pessoa" val={fmtInt(hu)} delta={a.conversasHumano} />
            <Metrica rot="Transbordos" val={fmtInt(a.transbordos.atual)} delta={a.transbordos} menorEhMelhor />
            <Metrica rot="Sem resposta" val={fmtInt(a.semResposta.atual)} delta={a.semResposta} menorEhMelhor />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-5 border-t border-linha/60 pt-2 sm:grid-cols-3">
            <Metrica rot="1ª resposta · agentes" val={fmtMinutos(a.primeiraResposta.agenteMin)} />
            <Metrica rot="1ª resposta · pessoas" val={fmtMinutos(a.primeiraResposta.humanoMin)} />
            <Metrica
              rot="1ª resposta · geral"
              val={fmtMinutos(a.primeiraResposta.geralMin.atual)}
              delta={a.primeiraResposta.geralMin}
              menorEhMelhor
            />
          </div>
        </>
      )}
    </Secao>
  );
}

// ─────────────── 3. funil no período ───────────────

function Funil({ etapas, periodo }: { etapas: EtapaResumo[]; periodo: number }) {
  const visiveis = etapas.filter((e) => e.tipo === "aberto" || (e.entradas.atual ?? 0) > 0 || e.estoque > 0);
  const max = Math.max(1, ...visiveis.map((e) => e.entradas.atual ?? 0));
  const semEntradas = visiveis.every((e) => (e.entradas.atual ?? 0) === 0);
  const cab = "text-right font-mono text-[10px] uppercase tracking-[0.04em] text-mute";
  return (
    <Secao titulo="Funil no período" direita={<span className="font-mono text-[10.5px] text-mute">entradas em {periodo} dias</span>}>
      {visiveis.length === 0 ? (
        <p className="text-[13px] text-suave">
          Funil sem etapas configuradas. <Acao href="/configuracoes">Configurar →</Acao>
        </p>
      ) : (
        <>
          <div className="mb-1.5 flex items-center gap-3">
            <span className="w-[150px] min-w-[150px]" />
            <span className="flex-1" />
            <span className={cn("w-11", cab)}>entrou</span>
            <span className={cn("w-14", cab)} title="entradas nesta etapa ÷ entradas na primeira etapa, no período">
              até aqui
            </span>
            <span className={cn("w-12", cab)} title="leads na etapa agora">
              agora
            </span>
          </div>
          {visiveis.map((e) => {
            const terminal = e.tipo !== "aberto";
            const entrou = e.entradas.atual ?? 0;
            return (
              <div key={e.etapa} className="flex min-h-8 items-center gap-3" title={`antes: ${fmtInt(e.entradas.anterior)} · ${fmtMoeda(e.valor)} em valor`}>
                <span className={cn("w-[150px] min-w-[150px] truncate text-[13px]", terminal ? "text-suave" : "text-tinta")}>
                  {e.nome}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-board">
                  {entrou > 0 && (
                    <span
                      className={cn(
                        "block h-full rounded-[3px]",
                        e.tipo === "ganho" ? "bg-verde" : e.tipo === "perdido" ? "bg-vermelho" : "bg-navy opacity-80",
                      )}
                      style={{ width: `${Math.max(2, (entrou / max) * 100)}%` }}
                    />
                  )}
                </span>
                <span className="w-11 text-right font-mono text-[12px] tabular-nums text-tinta">{fmtInt(entrou)}</span>
                <span className="w-14 text-right font-mono text-[11px] tabular-nums text-suave">
                  {e.tipo === "aberto" ? fmtPct(e.pctAteAqui) : ""}
                </span>
                <span className="w-12 text-right font-mono text-[11px] tabular-nums text-suave">{fmtInt(e.estoque)}</span>
              </div>
            );
          })}
          {semEntradas && (
            <p className="mt-2 text-[12.5px] text-suave">
              Nenhum lead entrou ou mudou de etapa no período. <Acao href="/funil">Abrir funil →</Acao>
            </p>
          )}
        </>
      )}
    </Secao>
  );
}

// ─────────────── 4. por ator ───────────────

function LinhaAtor({ r, maxConversas, periodo, ativo }: { r: ResumoAtor; maxConversas: number; periodo: number; ativo: boolean }) {
  const cel = "px-2 py-2 text-right font-mono text-[12px] tabular-nums text-tinta";
  const conv = r.conversas.atual ?? 0;
  const amostra = r.primeiraResposta.amostra;
  return (
    <tr className={cn("border-t border-linha/60", ativo && "bg-hover/60")}>
      <td className="py-2 pr-2">
        <Link
          href={`/?periodo=${periodo}&ator=${encodeURIComponent(r.ator)}`}
          className="flex items-center gap-2 text-[13px] font-medium text-tinta hover:underline"
        >
          <Ponto tipo={r.tipo} />
          <span className="truncate">{r.nome}</span>
          {!r.ativo && <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-mute">inativo</span>}
        </Link>
        <div className="mt-1 h-1 w-full max-w-[160px] overflow-hidden rounded-[2px] bg-board">
          {conv > 0 && (
            <div
              className={cn("h-full rounded-[2px]", r.tipo === "agente" ? BG_AGENTE : BG_HUMANO)}
              style={{ width: `${Math.max(2, (conv / maxConversas) * 100)}%` }}
            />
          )}
        </div>
      </td>
      <td className={cel}>
        {fmtInt(conv)} <Delta c={r.conversas} className="ml-1" />
      </td>
      <td className={cel}>
        {fmtInt(r.mensagens.atual)} <Delta c={r.mensagens} className="ml-1" />
      </td>
      <td
        className={cel}
        title={amostra > 0 ? `${amostra} conversas · antes: ${fmtMinutos(r.primeiraResposta.anteriorMin)}` : undefined}
      >
        {fmtMinutos(r.primeiraResposta.medianaMin)}
        {amostra > 0 && amostra < 5 && (
          <span className="text-mute" title="menos de 5 conversas">
            {" "}*
          </span>
        )}
      </td>
      <td className={cel}>{fmtInt(r.transbordos.atual)}</td>
      <td className={cel}>
        {fmtInt(r.tarefasCriadas.atual)}
        <span className="text-mute"> / </span>
        {fmtInt(r.tarefasConcluidas.atual)}
      </td>
      <td className={cel}>
        {fmtInt(r.leadsMovidos.atual)} <Delta c={r.leadsMovidos} className="ml-1" />
      </td>
    </tr>
  );
}

function PorAtor({ dados }: { dados: DadosDashboardCeo }) {
  const linhas = dados.porAtor.filter((r) => r.ativo || r.temAtividade);
  const max = Math.max(1, ...linhas.map((r) => r.conversas.atual ?? 0));
  const th = "px-2 pb-2 text-right font-mono text-[10px] font-normal uppercase tracking-[0.04em] text-mute";
  return (
    <Secao titulo="Por ator" direita={<span className="font-mono text-[10.5px] text-mute">{dados.periodo} dias · vs. anteriores</span>}>
      {linhas.length === 0 ? (
        <p className="text-[13px] text-suave">
          Ninguém atuou no período. <Acao href="/configuracoes/membros">Ver membros →</Acao>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="pb-2 text-left font-mono text-[10px] font-normal uppercase tracking-[0.04em] text-mute">ator</th>
                <th className={th} title="conversas distintas em que este ator deu a sua primeira resposta no período (uma conversa conta uma vez, mesmo tocada em vários dias)">
                  conversas
                </th>
                <th className={th}>mensagens</th>
                <th className={th} title="mediana das conversas em que este ator deu a primeira resposta">
                  1ª resposta
                </th>
                <th className={th} title="conversas que este ator assumiu da Clara">
                  transbordos
                </th>
                <th className={th} title="tarefas criadas / concluídas por este ator">
                  tarefas c/c
                </th>
                <th className={th} title="leads movidos de etapa por este ator">
                  leads movidos
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <LinhaAtor key={r.ator} r={r} maxConversas={max} periodo={dados.periodo} ativo={dados.atorFiltro === r.ator} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}

// ─────────────── a tela ───────────────

function ddmm(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

export function PainelDashboard({ dados }: { dados: DadosDashboardCeo }) {
  const { negocio, atendimento, serie, agora, valorNegociacao, periodo } = dados;
  const atorNome = dados.atorFiltro
    ? dados.porAtor.find((r) => r.ator === dados.atorFiltro)?.nome ?? dados.atorFiltro
    : null;
  const tudoIndisponivel = dados.indisponiveis.length >= 7;
  const conversasAtendidas: Comparado = {
    atual: (atendimento.conversasAgente.atual ?? 0) + (atendimento.conversasHumano.atual ?? 0),
    anterior: (atendimento.conversasAgente.anterior ?? 0) + (atendimento.conversasHumano.anterior ?? 0),
  };

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-12 pt-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ControlesDashboard periodo={periodo} atorFiltro={dados.atorFiltro} atores={dados.atores} />
        {atorNome && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-suave">
            <Ponto tipo={tipoDoAtor(dados.atorFiltro!)} />
            <b className="font-semibold text-tinta">{atorNome}</b>
            <Link href={`/?periodo=${periodo}`} className="ml-1 font-semibold text-laranja-esc hover:underline">
              limpar
            </Link>
          </span>
        )}
        <span className="ml-auto font-mono text-[10.5px] tabular-nums text-mute">
          {ddmm(dados.janela.inicio)} – {ddmm(dados.janela.fim)}
        </span>
      </div>

      {tudoIndisponivel ? (
        <p className="rounded-[10px] border border-linha bg-branco px-5 py-10 text-center text-[13px] text-suave">
          As leituras do dashboard não responderam. <Acao href="/suporte">Relatar →</Acao>
        </p>
      ) : (
        <>
          {/* 1. o que aconteceu */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi
              rotulo="Leads novos"
              valor={fmtInt(negocio.leadsNovos.atual)}
              delta={negocio.leadsNovos}
              sub={`${fmtInt(negocio.mensagensRecebidas.atual)} mensagens recebidas`}
            />
            <Kpi
              rotulo="Conversas atendidas"
              valor={fmtInt(conversasAtendidas.atual)}
              delta={conversasAtendidas}
              sub={`${fmtPct(atendimento.fracaoAgente)} por agente`}
            />
            <Kpi
              rotulo="1ª resposta"
              valor={fmtMinutos(atendimento.primeiraResposta.geralMin.atual)}
              delta={atendimento.primeiraResposta.geralMin}
              menorEhMelhor
              sub={
                atendimento.primeiraResposta.amostra > 0
                  ? `mediana de ${fmtInt(atendimento.primeiraResposta.amostra)} conversas`
                  : "sem conversas respondidas"
              }
            />
            <Kpi
              rotulo="Em negociação"
              valor={fmtMoeda(valorNegociacao.total)}
              sub={`${fmtInt(valorNegociacao.leadsComValor)} de ${fmtInt(valorNegociacao.leads)} leads abertos com valor`}
            />
            <Kpi
              rotulo="Em AGORA"
              valor={agora ? fmtPct(agora.pctAgora) : "—"}
              tom={agora?.excedeuTeto ? "alerta" : undefined}
              sub={
                agora ? (
                  agora.excedeuTeto ? (
                    <>
                      acima do teto de {fmtPct(agora.teto)} · <Acao href="/funil">abrir funil →</Acao>
                    </>
                  ) : (
                    <span className="flex flex-wrap gap-x-2">
                      {FAIXAS_ESCALA.map((f) => (
                        <span key={f} className="tabular-nums">
                          {fmtInt(agora.porFaixa[f])} <span className="text-mute">{ROTULO_FAIXA[f].toLowerCase()}</span>
                        </span>
                      ))}
                    </span>
                  )
                ) : (
                  "sem leads no funil"
                )
              }
            />
          </div>

          <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[1.35fr_1fr]">
            <div className="flex flex-col gap-3">
              <TrilhoAgenteHumano dados={dados} />
              <Secao titulo="Mensagens enviadas por dia" direita={<Legenda />}>
                <GraficoBarras
                  rotulos={serie.map((p) => p.rotulo)}
                  series={[
                    { chave: "agente", rotulo: "agentes", fill: FILL_AGENTE, valores: serie.map((p) => p.enviadasAgente) },
                    { chave: "humano", rotulo: "pessoas", fill: FILL_HUMANO, valores: serie.map((p) => p.enviadasHumano) },
                  ]}
                  rotuloVazio="sem mensagens enviadas no período"
                />
              </Secao>
              <Secao titulo="Leads novos por dia">
                <GraficoBarras
                  rotulos={serie.map((p) => p.rotulo)}
                  series={[{ chave: "leads", rotulo: "leads novos", fill: "fill-navy", valores: serie.map((p) => p.leadsNovos) }]}
                  altura={72}
                  rotuloVazio="nenhum lead novo no período"
                />
              </Secao>
            </div>
            <Funil etapas={dados.funil} periodo={periodo} />
          </div>

          <div className="mt-3">
            <PorAtor dados={dados} />
          </div>

          {dados.indisponiveis.length > 0 && (
            <p className="mt-3 text-[12px] text-suave">
              Sem leitura de {dados.indisponiveis.map((v) => v.replace("v_dashboard_", "")).join(", ")}.{" "}
              <Acao href="/suporte">Relatar →</Acao>
            </p>
          )}
        </>
      )}
    </main>
  );
}

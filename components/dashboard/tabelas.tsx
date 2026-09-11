import Link from "next/link";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMinutos, fmtMoeda, fmtPct, variacao, type EtapaResumo } from "@/lib/dados/dashboard-ceo-calculos";
import { casaBusca, MINUTOS_SLA_CANAL, type LinhaCanal, type LinhaEquipe } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { AvatarIniciais, Bloco, CabecalhoBloco, Delta, NumPct, Td, Th } from "./pecas";

/**
 * As três tabelas do dashboard (v2), no desenho do painel de referência: linha TOTAL em bold no
 * topo, número semibold com o percentual em 11px apagado ao lado, dinheiro ganho em verde e perdido
 * em vermelho, avatar redondo na coluna de pessoa. Cabeçalho não ordena; a ordem é uma só.
 */

const ROTULO_DEP: Record<string, string> = { pre_venda: "Pré-venda", pos_venda: "Pós-venda", clinico: "Clínico" };

function pctDe(n: number | null | undefined, d: number | null | undefined): string | null {
  if (n == null || d == null || d === 0) return null;
  return fmtPct(n / d, 1);
}

function Vazio({ texto, href, acao }: { texto: string; href?: string; acao?: string }) {
  return (
    <p className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">
      {texto}
      {href && acao ? (
        <>
          {" "}
          <Link href={href} className="font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px]">
            {acao}
          </Link>
        </>
      ) : null}
    </p>
  );
}

// ─────────────── por pessoa ───────────────

export function TabelaPessoas({ dados }: { dados: DadosDashboardDono }) {
  const todas = dados.equipe.filter((r) => r.ativo || r.temAtividade);
  const linhas = todas.filter((r) => casaBusca(r.nome, dados.busca));
  const soma = (f: (r: LinhaEquipe) => number | null | undefined) => todas.reduce((s, r) => s + (f(r) ?? 0), 0);
  const conv = soma((r) => r.conversas.atual);
  const resp = soma((r) => r.respondidas.atual);
  const sla = soma((r) => r.dentroDeSla.atual);
  const concl = soma((r) => r.tarefasConcluidas.atual);
  const criadas = soma((r) => r.tarefasCriadas.atual);
  const vendas = soma((r) => r.ganhos?.vendas);
  const valor = soma((r) => r.ganhos?.valor);
  const temGanhos = todas.some((r) => r.ganhos != null);
  const temCarga = todas.some((r) => r.cargaAgora != null);
  const temSla = todas.some((r) => r.dentroDeSla.atual != null);
  const carga = soma((r) => r.cargaAgora);
  const semLeitura = [!temSla && "≤ 5 min", !temGanhos && "ganhos por pessoa", !temCarga && "carga agora"].filter(Boolean).join(", ");

  return (
    <Bloco denso>
      <CabecalhoBloco
        className="px-5 pt-4"
        titulo="Por pessoa"
        descricao="Agentes primeiro, depois pessoas — quem segurou o período. Clicar no nome recorta o dashboard nela."
        direita={<span className="text-[11px] text-muted-foreground tabular-nums">{fmtInt(todas.filter((r) => r.tipo === "humano").length)} pessoas · {fmtInt(todas.filter((r) => r.tipo === "agente").length)} agentes</span>}
      />
      {todas.length === 0 ? (
        <Vazio texto="Ninguém atuou no período." href="/configuracoes/membros" acao="Ver membros" />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-y border-border bg-muted/40">
                <Th direita={false} className="pl-5">Pessoa</Th>
                <Th>Conversas</Th>
                <Th title="1ª resposta dada por esta pessoa">Respondidas</Th>
                <Th title={`respondidas em até ${MINUTOS_SLA_CANAL} min`}>≤ 5 min</Th>
                <Th title="mediana do tempo até a 1ª resposta">1ª resposta</Th>
                <Th title="concluídas · % do total da equipe">Tarefas</Th>
                <Th title="vendas ganhas no período com esta pessoa como dona">Ganhos</Th>
                <Th title="conversas abertas com esta pessoa agora" className="pr-5">Carga agora</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border font-semibold">
                <Td direita={false} className="pl-5">Total</Td>
                <Td>{fmtInt(conv)}</Td>
                <Td><NumPct n={fmtInt(resp)} pct={pctDe(resp, conv)} /></Td>
                <Td>{temSla ? <NumPct n={fmtInt(sla)} pct={pctDe(sla, resp)} /> : "—"}</Td>
                <Td>{fmtMinutos(dados.atendimento.primeiraResposta.geralMin.atual)}</Td>
                <Td><NumPct n={fmtInt(concl)} pct={`${fmtInt(criadas)} criadas`} /></Td>
                <Td>{temGanhos ? <NumPct n={fmtMoeda(valor)} pct={`${fmtInt(vendas)} vendas`} tom="verde" /> : "—"}</Td>
                <Td className="pr-5">{temCarga ? fmtInt(carga) : "—"}</Td>
              </tr>
              {linhas.map((r) => {
                const c = r.conversas.atual ?? 0;
                const rp = r.respondidas.atual ?? 0;
                const lento = r.primeiraResposta.medianaMin != null && r.primeiraResposta.medianaMin > MINUTOS_SLA_CANAL;
                return (
                  <tr key={r.ator} className={cn("border-b border-border/70 last:border-0 hover:bg-muted/30", dados.atorFiltro === r.ator && "bg-muted/40")}>
                    <Td direita={false} className="pl-5">
                      <Link href={`/?periodo=${dados.periodo}&ator=${encodeURIComponent(r.ator)}`} className="flex items-center gap-2.5 hover:underline">
                        <AvatarIniciais nome={r.nome} agente={r.tipo === "agente"} />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-medium">{r.nome}</span>
                          <span className="truncate text-[11px] font-normal text-muted-foreground">
                            {r.tipo === "agente" ? "agente" : r.departamento ? ROTULO_DEP[r.departamento] ?? r.departamento : "sem departamento"}
                            {!r.ativo ? " · inativo" : ""}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-semibold">{fmtInt(c)}</span>
                        <Delta delta={variacao(r.conversas)} />
                      </span>
                    </Td>
                    <Td><NumPct n={fmtInt(rp)} pct={pctDe(rp, c)} /></Td>
                    <Td>{r.dentroDeSla.atual == null ? <span className="text-muted-foreground">—</span> : <NumPct n={fmtInt(r.dentroDeSla.atual)} pct={pctDe(r.dentroDeSla.atual, rp)} />}</Td>
                    <Td className={cn("font-semibold", lento && r.tipo === "agente" && "text-danger-ink")} title={r.primeiraResposta.amostra > 0 ? `mediana de ${r.primeiraResposta.amostra} conversas · antes: ${fmtMinutos(r.primeiraResposta.anteriorMin)}` : undefined}>
                      {fmtMinutos(r.primeiraResposta.medianaMin)}
                      {r.primeiraResposta.amostra > 0 && r.primeiraResposta.amostra < 5 ? <span className="text-muted-foreground"> *</span> : null}
                    </Td>
                    <Td><NumPct n={fmtInt(r.tarefasConcluidas.atual)} pct={pctDe(r.tarefasConcluidas.atual, concl)} /></Td>
                    <Td>{r.ganhos ? r.ganhos.vendas > 0 ? <NumPct n={fmtMoeda(r.ganhos.valor)} pct={`${fmtInt(r.ganhos.vendas)}`} tom="verde" /> : <span className="text-muted-foreground">—</span> : <span className="text-muted-foreground">—</span>}</Td>
                    <Td className={cn("pr-5 font-semibold", r.cargaAgora != null && r.cargaAgora >= 8 && "text-danger-ink")}>{r.cargaAgora == null ? <span className="font-normal text-muted-foreground">—</span> : fmtInt(r.cargaAgora)}</Td>
                  </tr>
                );
              })}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={8}><Vazio texto={`Ninguém com "${dados.busca}" no período.`} /></td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-5 py-2 text-[11px] text-muted-foreground">
            * menos de 5 conversas na amostra.{semLeitura ? ` Sem leitura de ${semLeitura}.` : ""}
          </p>
        </div>
      )}
    </Bloco>
  );
}

// ─────────────── por número ───────────────

export function TabelaNumeros({ dados }: { dados: DadosDashboardDono }) {
  const canais = dados.canais;
  if (!canais) {
    return (
      <Bloco denso>
        <CabecalhoBloco className="px-5 pt-4" titulo="Por número" descricao="Recebidas, respondidas e 1ª resposta, número a número." />
        <Vazio texto="Sem leitura por número — as views do dashboard ainda não registram por qual número a conversa entrou." href="/configuracoes/canais" acao="Abrir canais" />
      </Bloco>
    );
  }
  const todas = [...canais].sort((a, b) => (b.recebidas.atual ?? 0) - (a.recebidas.atual ?? 0));
  const linhas = todas.filter((c) => casaBusca(`${c.apelido} ${c.numero}`, dados.busca));
  const soma = (f: (c: LinhaCanal) => number | null | undefined) => todas.reduce((s, c) => s + (f(c) ?? 0), 0);
  const rec = soma((c) => c.recebidas.atual);
  const recAnt = soma((c) => c.recebidas.anterior);
  const resp = soma((c) => c.respondidas.atual);
  const sla = soma((c) => c.dentroDeSla.atual);
  const sem = soma((c) => c.semResposta);

  return (
    <Bloco denso>
      <CabecalhoBloco
        className="px-5 pt-4"
        titulo="Por número"
        descricao={`1ª resposta acima de ${MINUTOS_SLA_CANAL} min fica em vermelho. Clicar abre a caixa de entrada naquele número.`}
        direita={sem > 0 ? <span className="text-[11px] text-danger-ink tabular-nums">{fmtInt(sem)} sem resposta agora</span> : null}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[500px] border-collapse">
          <thead>
            <tr className="border-y border-border bg-muted/40">
              <Th direita={false} className="pl-5">Número</Th>
              <Th>Recebidas</Th>
              <Th>Respondidas</Th>
              <Th>≤ 5 min</Th>
              <Th>1ª resposta</Th>
              <Th title="última mensagem é do cliente, agora" className="pr-5">Sem resposta</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border font-semibold">
              <Td direita={false} className="pl-5">Total</Td>
              <Td>
                <span className="inline-flex items-center gap-1.5">
                  {fmtInt(rec)}
                  <Delta delta={variacao({ atual: rec, anterior: recAnt })} />
                </span>
              </Td>
              <Td><NumPct n={fmtInt(resp)} pct={pctDe(resp, rec)} /></Td>
              <Td><NumPct n={fmtInt(sla)} pct={pctDe(sla, resp)} /></Td>
              <Td>{fmtMinutos(dados.atendimento.primeiraResposta.geralMin.atual)}</Td>
              <Td className={cn("pr-5", sem > 0 && "text-danger-ink")}>{fmtInt(sem)}</Td>
            </tr>
            {linhas.map((c) => {
              const r = c.recebidas.atual ?? 0;
              const rp = c.respondidas.atual ?? 0;
              const lento = c.primeiraRespostaMin != null && c.primeiraRespostaMin > MINUTOS_SLA_CANAL;
              return (
                <tr key={c.canal_id} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                  <Td direita={false} className="pl-5">
                    <Link href={`/conversas?canal=${encodeURIComponent(c.canal_id)}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", c.ativo && c.conectado ? "bg-success-ink" : "bg-danger-ink")} title={c.ativo ? (c.conectado ? "conectado" : "desconectado") : "desligado"} />
                      <span className="flex min-w-0 max-w-[190px] flex-col leading-tight">
                        <span className="truncate font-medium">{c.apelido}</span>
                        <span className="truncate text-[11px] font-normal text-muted-foreground" title={`${c.numero} · ${c.provedor === "waba" ? "oficial" : "Lite"} · ${ROTULO_DEP[c.departamento] ?? c.departamento}`}>
                          {c.numero} · {c.provedor === "waba" ? "oficial" : "Lite"}
                          {!c.conectado && c.ativo ? " · desconectado" : ""}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-semibold">{fmtInt(r)}</span>
                      <Delta delta={variacao(c.recebidas)} />
                    </span>
                  </Td>
                  <Td><NumPct n={fmtInt(rp)} pct={pctDe(rp, r)} /></Td>
                  <Td><NumPct n={fmtInt(c.dentroDeSla.atual)} pct={pctDe(c.dentroDeSla.atual, rp)} /></Td>
                  <Td className={cn("font-semibold", lento && "text-danger-ink")}>{fmtMinutos(c.primeiraRespostaMin)}</Td>
                  <Td className={cn("pr-5 font-semibold", c.semResposta > 0 && "text-danger-ink")}>{fmtInt(c.semResposta)}</Td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6}><Vazio texto={`Nenhum número com "${dados.busca}".`} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

// ─────────────── funil por etapa ───────────────

function fmtDias(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return `${Math.round(d * 24)} h`;
  return `${d.toFixed(1).replace(".", ",")} d`;
}

export function TabelaFunil({ dados }: { dados: DadosDashboardDono }) {
  const todas = dados.funilComTempo.filter((e) => e.tipo === "aberto" || (e.entradas.atual ?? 0) > 0 || e.estoque > 0);
  const linhas = todas.filter((e) => casaBusca(e.nome, dados.busca));
  const abertas = todas.filter((e) => e.tipo === "aberto");
  const base = abertas[0]?.entradas.atual ?? 0;
  const ganho = todas.find((e) => e.tipo === "ganho");
  const perdido = todas.find((e) => e.tipo === "perdido");
  const estoque = abertas.reduce((s, e) => s + e.estoque, 0);
  const temTempo = todas.some((e) => e.tempoMedioDias != null);

  const Linha = ({ e }: { e: EtapaResumo & { tempoMedioDias: number | null } }) => {
    const terminal = e.tipo !== "aberto";
    const entrou = e.entradas.atual ?? 0;
    return (
      <tr className="border-b border-border/70 last:border-0 hover:bg-muted/30">
        <Td direita={false} className="pl-5">
          <Link href={`/funil?etapa=${encodeURIComponent(e.etapa)}`} className={cn("hover:underline", terminal ? "text-muted-foreground" : "font-medium")}>
            {e.nome}
          </Link>
        </Td>
        <Td>
          <span className="inline-flex items-center gap-1.5">
            <NumPct n={fmtInt(entrou)} pct={e.tipo === "aberto" ? fmtPct(e.pctAteAqui) : null} tom={e.tipo === "ganho" ? "verde" : e.tipo === "perdido" ? "vermelho" : undefined} />
            <Delta delta={variacao(e.entradas)} menorEhMelhor={e.tipo === "perdido"} />
          </span>
        </Td>
        <Td className="text-muted-foreground">{e.tipo === "aberto" && e.pctDaAnterior != null ? fmtPct(e.pctDaAnterior) : ""}</Td>
        <Td className="text-muted-foreground">{e.tipo === "aberto" ? fmtDias(e.tempoMedioDias) : ""}</Td>
        <Td className="font-semibold">{e.tipo === "aberto" ? fmtInt(e.estoque) : ""}</Td>
        <Td className="pr-5 text-muted-foreground">{e.tipo === "aberto" && e.valor > 0 ? fmtMoeda(e.valor) : ""}</Td>
      </tr>
    );
  };

  return (
    <Bloco denso>
      <CabecalhoBloco
        className="px-5 pt-4"
        titulo="Funil por etapa"
        descricao="Entradas no período com a conversão até aqui; 'agora' é o estoque, sem janela."
        direita={base > 0 && ganho ? <span className="text-[11px] text-muted-foreground tabular-nums">{fmtPct((ganho.entradas.atual ?? 0) / base, 1)} de entrada a venda</span> : null}
      />
      {todas.length === 0 ? (
        <Vazio texto="Funil sem etapas configuradas." href="/configuracoes" acao="Configurar" />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead>
              <tr className="border-y border-border bg-muted/40">
                <Th direita={false} className="pl-5">Etapa</Th>
                <Th title="entradas · % da primeira etapa">Entrou</Th>
                <Th title="entradas ÷ etapa anterior">Da anterior</Th>
                <Th title="permanência média na etapa">{temTempo ? "Tempo" : ""}</Th>
                <Th title="leads na etapa agora">Agora</Th>
                <Th className="pr-5" title="valor registrado nos leads da etapa">Valor</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border font-semibold">
                <Td direita={false} className="pl-5">Total</Td>
                <Td><NumPct n={fmtInt(base)} pct="entraram" /></Td>
                <Td className="text-muted-foreground">{ganho && base > 0 ? `${fmtPct((ganho.entradas.atual ?? 0) / base, 1)} venda` : ""}</Td>
                <Td />
                <Td>{fmtInt(estoque)}</Td>
                <Td className="pr-5" title="valor registrado nos leads das etapas abertas">{fmtMoeda(dados.valorNegociacao.total)}</Td>
              </tr>
              {linhas.map((e) => (
                <Linha key={e.etapa} e={e} />
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6}><Vazio texto={`Nenhuma etapa com "${dados.busca}".`} /></td>
                </tr>
              )}
            </tbody>
          </table>
          {(ganho || perdido) && (
            <p className="px-5 py-2 text-[11px] text-muted-foreground tabular-nums">
              No período: <b className="font-semibold text-success-ink">{fmtInt(ganho?.entradas.atual ?? 0)} ganhos</b> · <b className="font-semibold text-danger-ink">{fmtInt(perdido?.entradas.atual ?? 0)} perdidos</b>.
              {!temTempo ? " Tempo por etapa sem leitura." : ""}
            </p>
          )}
        </div>
      )}
    </Bloco>
  );
}

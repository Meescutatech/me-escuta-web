import Link from "next/link";
import type { DadosDashboard, DiaMensagens, FaixaEtapa } from "@/lib/dados/dashboard";
import {
  formatarDuracaoMin,
  idadeCurta,
  percentualChegouAteAqui,
  taxaFechamento,
} from "@/lib/dados/dashboard-calculos";
import { segmentosReguaAgregada } from "@/lib/dados/funil-calculos";
import { ReguaFunil } from "@/components/regua-funil";
import { CarimboVivo } from "./carimbo-vivo";
import { cn } from "@/lib/utils";

/*
 * Visão geral (R9) — mockup r9-dashboard.html: 4 tiles de números-chave (peso 650,
 * -0.02em, tabular — número de operação é leitura, não pôster), leads por etapa com a
 * régua-assinatura + barras, mensagens de hoje em linhas métricas, fechamentos.
 * Números 100% do ledger/projeções (R7); indisponível = "—", nunca zero inventado.
 */

function n(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}

/** "22/07 14:34" (fuso da operação) pro carimbo de recência do snapshot. */
function ddmmhhmm(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} ${hora}`;
}

function Tile({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
      <div className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-suave">{rotulo}</div>
      {children}
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 text-[34px] font-[650] leading-[1.15] tracking-[-0.02em] tabular-nums text-tinta">
      {children}
    </div>
  );
}

// ─────────────── leads por etapa ───────────────

function LeadsPorEtapa({ faixas }: { faixas: FaixaEtapa[] }) {
  const max = Math.max(1, ...faixas.map((f) => f.qtd ?? 0));
  // R19 (2.3): funil com queda — % dos leads ativos que estão na etapa ou além (leitura
  // honesta de um snapshot; razão entre etapas vizinhas mediria estoque, não conversão).
  const chegouAteAqui = percentualChegouAteAqui(faixas.map((f) => f.qtd));
  const temPct = chegouAteAqui.some((p) => p != null);
  return (
    <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Leads por etapa</h2>
        {/* F5: "ao vivo" saiu daqui. O painel não tem assinatura de Realtime — quem diz de quanto
            em quanto tempo ele relê é o CarimboVivo do cabeçalho, e agora ele diz a verdade. */}
        <span className="ml-auto font-mono text-[10.5px] text-mute">derivado do ledger</span>
      </div>
      <div className="mb-4">
        <ReguaFunil segmentos={segmentosReguaAgregada(faixas)} rotulo="Etapas do funil com leads" />
      </div>
      {temPct && (
        <div className="mb-1.5 flex items-center gap-3">
          <span className="w-[190px] min-w-[190px]" />
          <span className="flex-1" />
          <span className="w-11 text-right font-mono text-[10px] uppercase tracking-[0.04em] text-mute">leads</span>
          <span className="w-14 text-right font-mono text-[10px] uppercase tracking-[0.04em] text-mute" title="% dos leads ativos que estão nesta etapa ou além">
            até aqui
          </span>
        </div>
      )}
      {faixas.map(({ etapa, qtd }, i) => {
        const alerta = /faltou/i.test(etapa.chave) || /faltou/i.test(etapa.nome);
        const pct = chegouAteAqui[i];
        return (
          <div key={etapa.chave} className="flex min-h-8 items-center gap-3">
            <span className={cn("w-[190px] min-w-[190px] truncate text-[13px]", alerta ? "text-amarelo" : "text-tinta")} title={etapa.nome}>
              {etapa.nome}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-board">
              {qtd != null && qtd > 0 && (
                <span
                  className={cn("block h-full rounded-[3px]", alerta ? "bg-amarelo" : "bg-laranja opacity-85")}
                  style={{ width: `${Math.max(2, (qtd / max) * 100)}%` }}
                />
              )}
            </span>
            <span className="w-11 text-right font-mono text-[12px] tabular-nums text-tinta">{n(qtd)}</span>
            {temPct && (
              <span className="w-14 text-right font-mono text-[11px] tabular-nums text-suave">
                {pct == null ? "—" : `${pct.toLocaleString("pt-BR")}%`}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─────────────── mensagens · 7 dias (R19, 2.1) ───────────────

/**
 * A série `mensagens7d` sempre foi lida inteira e mostrada só no último dia. Barras finas
 * pareadas por dia: recebidas (laranja) / enviadas (azul-gráfico) — o par validado pela bateria
 * CVD. Dia sem leitura mostra "—" no lugar do par (null não vira barra zero).
 */
function TendenciaMensagens({ dias }: { dias: DiaMensagens[] }) {
  const max = Math.max(1, ...dias.flatMap((d) => [d.entrada ?? 0, d.saida ?? 0]));
  const altura = 64; // px da área de plotagem
  return (
    <div>
      <div className="flex items-end gap-1.5 border-b border-linha pb-px" style={{ height: altura + 1 }}>
        {dias.map((d, i) => {
          const semLeitura = d.entrada == null && d.saida == null;
          const hoje = i === dias.length - 1;
          const rotuloCompleto = `${d.rotulo} · ${n(d.entrada)} recebidas / ${n(d.saida)} enviadas`;
          return (
            <div key={d.rotulo} className="flex flex-1 items-end justify-center gap-[2px]" title={rotuloCompleto}>
              {semLeitura ? (
                <span className="pb-0.5 font-mono text-[10.5px] text-mute">—</span>
              ) : (
                <>
                  <span
                    className={cn("w-2 rounded-t-[2px] bg-laranja", !hoje && "opacity-75")}
                    style={{ height: `${d.entrada ? Math.max(3, (d.entrada / max) * altura) : 0}px` }}
                  />
                  <span
                    className={cn("w-2 rounded-t-[2px] bg-azul-graf", !hoje && "opacity-75")}
                    style={{ height: `${d.saida ? Math.max(3, (d.saida / max) * altura) : 0}px` }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {dias.map((d, i) => (
          <span
            key={d.rotulo}
            className={cn(
              "flex-1 text-center font-mono text-[10px] tabular-nums",
              i === dias.length - 1 ? "font-semibold text-tinta" : "text-mute",
            )}
          >
            {d.rotulo.slice(0, 3)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────── operação de agentes (R19, 2.2) ───────────────

/**
 * A fila de `core.sugestao_ia` pendente — o coração do human-on-the-loop, antes invisível no
 * painel. Total sempre; quebra por agente quando a leitura estreita coube no teto.
 */
function OperacaoAgentes({ dados, geradoEm }: { dados: DadosDashboard["sugestoes"]; geradoEm: string }) {
  const idade = idadeCurta(dados.maisAntigaEm, new Date(geradoEm));
  const parada = dados.maisAntigaEm != null && Date.parse(geradoEm) - Date.parse(dados.maisAntigaEm) >= 86400_000;
  const maxAgente = Math.max(1, ...(dados.porAgente ?? []).map((a) => a.qtd));
  return (
    <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Operação de agentes</h2>
        <Link href="/fila" className="ml-auto text-[12px] font-semibold text-laranja-esc hover:underline">
          Ver fila →
        </Link>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] font-[650] leading-[1.15] tracking-[-0.02em] tabular-nums text-tinta">
          {n(dados.pendentes)}
        </span>
        <span className="text-[12.5px] text-suave">propostas aguardando validação</span>
      </div>
      {idade && (
        <div className={cn("mt-1 text-[12.5px]", parada ? "font-semibold text-amarelo" : "text-suave")}>
          mais antiga há {idade}
        </div>
      )}
      {dados.porAgente && dados.porAgente.length > 0 && (
        <div className="mt-3 border-t border-linha/60 pt-2">
          {dados.porAgente.map((a) => (
            <div key={a.agente} className="flex min-h-7 items-center gap-3">
              <span className="w-[72px] min-w-[72px] truncate text-[13px] text-tinta" title={a.agente}>
                {a.agente}
              </span>
              <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-board">
                <span
                  className="block h-full rounded-[2px] bg-laranja opacity-70"
                  style={{ width: `${Math.max(2, (a.qtd / maxAgente) * 100)}%` }}
                />
              </span>
              <span className="w-11 text-right font-mono text-[12px] tabular-nums text-tinta">
                {a.qtd.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────── painel ───────────────

export function PainelDashboard({ dados, geradoEm }: { dados: DadosDashboard; geradoEm: string }) {
  const { entrega, primeiraResposta, valorNegociacao } = dados;
  const abertas = dados.leadsPorEtapa.filter((f) => f.etapa.tipo === "aberto");
  const hoje = dados.mensagens7d[dados.mensagens7d.length - 1] ?? null;
  const ganhos = dados.leadsPorEtapa.filter((f) => f.etapa.tipo === "ganho");
  const perdidos = dados.leadsPorEtapa.filter((f) => f.etapa.tipo === "perdido");
  const somaOuNull = (fs: FaixaEtapa[]) =>
    fs.length === 0 || fs.some((f) => f.qtd == null) ? null : fs.reduce((s, f) => s + (f.qtd ?? 0), 0);
  const fechamento = taxaFechamento(somaOuNull(ganhos), somaOuNull(perdidos));
  const snapshot = ddmmhhmm(dados.ultimoEventoEm);
  const semDados = dados.ultimoEventoEm == null && (dados.leadsAtivos ?? 0) === 0;

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-12 pt-6">
      <div className="mb-5 flex items-baseline gap-3.5">
        {/* M6: o NOME DA PÁGINA subiu para o header (fonte única rota→título, `lib/header/titulos.ts`).
            A LINHA fica — os instrumentos são da tela; só o nome saiu dela (SPEC-M6 §5.4). */}
        <span className="ml-auto">
          <CarimboVivo geradoEm={geradoEm} />
        </span>
      </div>

      {semDados ? (
        <div className="grid place-items-center rounded-[10px] border border-linha bg-branco py-24 text-center">
          <div>
            <p className="text-[17px] font-[650] text-tinta">Nada no ledger ainda</p>
            <p className="mt-2 max-w-md text-[13px] text-suave">
              Os números daqui derivam dos eventos reais — quando o primeiro lead ou mensagem
              entrar, o painel acende sozinho.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* números-chave */}
          <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Tile rotulo="Leads ativos no funil">
              <Num>{n(dados.leadsAtivos)}</Num>
              <div className="mt-1.5 text-[12.5px] text-suave">
                <b className="font-semibold tabular-nums text-tinta">{n(dados.novosHoje)}</b> novos hoje ·{" "}
                <b className="font-semibold tabular-nums text-tinta">{n(dados.novos7d)}</b> nos últimos 7 dias
              </div>
            </Tile>
            <Tile rotulo="Mensagens hoje">
              <Num>
                {n(hoje?.entrada ?? null)}{" "}
                <span className="text-[16px] font-semibold tracking-normal text-suave">/ {n(hoje?.saida ?? null)}</span>
              </Num>
              <div className="mt-1.5 text-[12.5px] text-suave">
                recebidas / enviadas · entrega{" "}
                <b className="font-semibold tabular-nums text-tinta">
                  {entrega.pct != null ? `${entrega.pct.toLocaleString("pt-BR")}%` : "—"}
                </b>
              </div>
            </Tile>
            <Tile rotulo="1ª resposta (mediana 7d)">
              <Num>{formatarDuracaoMin(primeiraResposta.medianaMin)}</Num>
              <div className="mt-1.5 text-[12.5px] text-suave">
                {primeiraResposta.amostra > 0
                  ? `${n(primeiraResposta.amostra)} conversas${primeiraResposta.parcial ? " · amostra parcial" : ""}`
                  : "sem conversas com resposta"}{" "}
                · meta: qualificação em <b className="font-semibold text-tinta">48 h</b>
              </div>
            </Tile>
            <Tile rotulo="Valor em negociação">
              <Num>
                <span className="text-[16px] font-semibold tracking-normal text-suave">R$</span>{" "}
                {valorNegociacao.total.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              </Num>
              <div className="mt-1.5 text-[12.5px] text-suave">
                <b className="font-semibold tabular-nums text-tinta">{n(valorNegociacao.comValor)}</b> leads com valor
                {(valorNegociacao.semValor ?? 0) > 0 && <> · {n(valorNegociacao.semValor)} sem</>}
              </div>
              <div className="mt-1.5 font-mono text-[10.5px] text-mute">valor lançado no fechamento</div>
            </Tile>
          </div>

          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1.6fr_1fr]">
            <LeadsPorEtapa faixas={abertas} />

            <div className="flex flex-col gap-3">
              {/* operação de agentes (R19, 2.2) */}
              <OperacaoAgentes dados={dados.sugestoes} geradoEm={geradoEm} />

              {/* mensagens (R19, 2.1: a série de 7 dias que já era lida vira gráfico) */}
              <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
                <div className="mb-3 flex items-baseline gap-2.5">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Mensagens · 7 dias</h2>
                  {/* F5: idem — o carimbo do cabeçalho é o único selo de frescor da página. */}
                  <span className="ml-auto flex items-center gap-3 text-[11px] text-suave">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-[2px] bg-laranja" aria-hidden />
                      recebidas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-[2px] bg-azul-graf" aria-hidden />
                      enviadas
                    </span>
                  </span>
                </div>
                <TendenciaMensagens dias={dados.mensagens7d} />
                <div className="mt-3 grid grid-cols-2 gap-x-5">
                  <Metrica rot="Recebidas hoje" val={n(hoje?.entrada ?? null)} />
                  <Metrica rot="Enviadas hoje" val={n(hoje?.saida ?? null)} />
                  <Metrica
                    rot="Entrega"
                    val={entrega.pct != null ? `${entrega.pct.toLocaleString("pt-BR")}%` : "—"}
                    tom={entrega.pct != null && entrega.pct >= 95 ? "ok" : undefined}
                  />
                  <Metrica rot="Falhas" val={n(entrega.falhas)} tom={(entrega.falhas ?? 0) > 0 ? "alerta" : undefined} />
                </div>
              </section>

              {/* fechamentos (R19, 2.4: os 2 números soltos ganham a razão entre eles) */}
              <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
                <div className="mb-3 flex items-baseline gap-2.5">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Fechamentos</h2>
                  {snapshot && <span className="ml-auto font-mono text-[10.5px] text-mute">snapshot {snapshot}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-linha px-3.5 py-3">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-verde">Venda ganha</div>
                    <div className="mt-1 text-2xl font-[650] tracking-[-0.02em] tabular-nums">{n(somaOuNull(ganhos))}</div>
                  </div>
                  <div className="rounded-lg border border-linha px-3.5 py-3">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-vermelho">Venda perdida</div>
                    <div className="mt-1 text-2xl font-[650] tracking-[-0.02em] tabular-nums">{n(somaOuNull(perdidos))}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-linha/60 pt-2.5">
                  <span className="text-[13px] text-suave">Taxa de ganho</span>
                  <span className="text-[16px] font-[650] tracking-[-0.01em] tabular-nums text-tinta">
                    {fechamento.pct == null ? "—" : `${fechamento.pct.toLocaleString("pt-BR")}%`}
                    {fechamento.pct != null && fechamento.base != null && (
                      <span className="ml-1.5 font-mono text-[10.5px] font-normal text-mute">
                        de {fechamento.base.toLocaleString("pt-BR")} fechados
                      </span>
                    )}
                  </span>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Metrica({ rot, val, tom }: { rot: string; val: string; tom?: "ok" | "alerta" }) {
  return (
    <div className="flex min-h-9 items-baseline justify-between border-b border-linha/60 [&:nth-last-child(-n+2)]:border-b-0">
      <span className="text-[13px] text-suave">{rot}</span>
      <span
        className={cn(
          "text-[16px] font-[650] tracking-[-0.01em] tabular-nums",
          tom === "ok" && "text-verde",
          tom === "alerta" && "text-amarelo",
        )}
      >
        {val}
      </span>
    </div>
  );
}

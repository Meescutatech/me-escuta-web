import type { DadosDashboard, FaixaEtapa } from "@/lib/dados/dashboard";
import { formatarDuracaoMin } from "@/lib/dados/dashboard-calculos";
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
      {faixas.map(({ etapa, qtd }) => {
        const alerta = /faltou/i.test(etapa.chave) || /faltou/i.test(etapa.nome);
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
          </div>
        );
      })}
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
  const snapshot = ddmmhhmm(dados.ultimoEventoEm);
  const semDados = dados.ultimoEventoEm == null && (dados.leadsAtivos ?? 0) === 0;

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-12 pt-6">
      <div className="mb-5 flex items-baseline gap-3.5">
        <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">Visão geral</h1>
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
              {/* mensagens */}
              <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
                <div className="mb-2 flex items-baseline gap-2.5">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Mensagens · hoje</h2>
                  {/* F5: idem — o carimbo do cabeçalho é o único selo de frescor da página. */}
                </div>
                <div className="grid grid-cols-2 gap-x-5">
                  <Metrica rot="Recebidas" val={n(hoje?.entrada ?? null)} />
                  <Metrica rot="Enviadas" val={n(hoje?.saida ?? null)} />
                  <Metrica
                    rot="Entrega"
                    val={entrega.pct != null ? `${entrega.pct.toLocaleString("pt-BR")}%` : "—"}
                    tom={entrega.pct != null && entrega.pct >= 95 ? "ok" : undefined}
                  />
                  <Metrica rot="Falhas" val={n(entrega.falhas)} tom={(entrega.falhas ?? 0) > 0 ? "alerta" : undefined} />
                </div>
              </section>

              {/* fechamentos */}
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

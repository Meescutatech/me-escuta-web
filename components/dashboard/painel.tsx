import type { DadosDashboard, DiaMensagens, FaixaEtapa } from "@/lib/dados/dashboard";
import { formatarDuracaoMin } from "@/lib/dados/dashboard-calculos";
import { CarimboVivo } from "./carimbo-vivo";

/*
 * Dashboard v1 (Rodada 7, D5) — números grandes + barras simples, SEM lib de gráfico.
 * Mesmos tokens do redesign Notion-minimalista (fase 1): Fraunces nos números, navy/laranja,
 * cartões brancos com hairline. Número indisponível = "—" (nunca zero inventado).
 * Server component puro: tudo chega pronto de lerDashboard().
 */

function n(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}
function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** "dados de 21/07, 20:15" no fuso da operação. */
function recencia(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `dados de ${dia}, ${hora}`;
}

function Cartao({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-[9px] border border-linha bg-branco px-5 py-4 shadow-suave ${className ?? ""}`}>
      <h2 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-mute">{titulo}</h2>
      {children}
    </section>
  );
}

function NumeroGrande({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div>
      <div className="font-serif text-[2.1rem] font-semibold leading-none tabular-nums text-navy">{valor}</div>
      <div className="mt-1.5 text-[0.78rem] text-mute">{rotulo}</div>
    </div>
  );
}

// ─────────────── funil por etapa (barras horizontais) ───────────────

function FunilEtapas({ faixas }: { faixas: FaixaEtapa[] }) {
  const max = Math.max(1, ...faixas.map((f) => f.qtd ?? 0));
  return (
    <div className="flex flex-col gap-2">
      {faixas.map(({ etapa, qtd }) => (
        <div key={etapa.chave} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-[0.8rem] text-suave" title={etapa.nome}>
            {etapa.nome}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-board">
            {qtd != null && qtd > 0 && (
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(4, (qtd / max) * 100)}%`, background: etapa.cor }}
              />
            )}
          </div>
          <span className="w-8 shrink-0 text-right font-serif text-[0.9rem] font-medium tabular-nums text-navy">
            {n(qtd)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────── mensagens por dia (barras verticais pareadas) ───────────────

function MensagensPorDia({ dias }: { dias: DiaMensagens[] }) {
  const max = Math.max(1, ...dias.flatMap((d) => [d.entrada ?? 0, d.saida ?? 0]));
  const totalEntrada = dias.some((d) => d.entrada == null)
    ? null
    : dias.reduce((s, d) => s + (d.entrada ?? 0), 0);
  const totalSaida = dias.some((d) => d.saida == null)
    ? null
    : dias.reduce((s, d) => s + (d.saida ?? 0), 0);
  return (
    <div>
      <div className="flex h-24 items-end gap-2">
        {dias.map((d) => (
          <div key={d.rotulo} className="flex flex-1 flex-col items-center gap-1" title={`${d.rotulo}: ${n(d.entrada)} recebidas · ${n(d.saida)} enviadas`}>
            <div className="flex h-20 w-full items-end justify-center gap-[3px]">
              <div
                className="w-[9px] rounded-t-sm bg-laranja"
                style={{ height: `${((d.entrada ?? 0) / max) * 100}%`, minHeight: (d.entrada ?? 0) > 0 ? 3 : 0 }}
              />
              <div
                className="w-[9px] rounded-t-sm bg-navy"
                style={{ height: `${((d.saida ?? 0) / max) * 100}%`, minHeight: (d.saida ?? 0) > 0 ? 3 : 0 }}
              />
            </div>
            <span className="whitespace-nowrap text-[0.62rem] text-mute">{d.rotulo.split(" ")[0]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-linha pt-2.5 text-[0.78rem] text-suave">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-laranja" /> {n(totalEntrada)} recebidas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-navy" /> {n(totalSaida)} enviadas
        </span>
      </div>
    </div>
  );
}

// ─────────────── painel ───────────────

export function PainelDashboard({ dados, geradoEm }: { dados: DadosDashboard; geradoEm: string }) {
  const rec = recencia(dados.ultimoEventoEm);
  const { entrega, primeiraResposta, valorNegociacao } = dados;
  const semDados = dados.ultimoEventoEm == null && (dados.leadsAtivos ?? 0) === 0;

  return (
    <div className="min-h-[calc(100vh-58px)] bg-board">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-linha bg-branco px-6 pb-3 pt-4">
        <h1 className="font-serif text-2xl font-semibold leading-none text-navy">Dashboard</h1>
        {dados.leadsAtivos != null && (
          <span className="flex items-baseline gap-1.5">
            <span className="font-serif text-[1.02rem] font-medium tabular-nums text-navy">{n(dados.leadsAtivos)}</span>
            <span className="text-[0.78rem] text-mute">leads ativos</span>
          </span>
        )}
        {/* recência honesta: o universo Kommo é snapshot — divergência até o sync contínuo é esperada */}
        <span className="ml-auto flex items-baseline gap-3">
          {rec && <span className="text-[0.78rem] text-mute">{rec} · importado do Kommo</span>}
          <CarimboVivo geradoEm={geradoEm} />
        </span>
      </div>

      {semDados ? (
        <div className="grid place-items-center px-6 py-24 text-center">
          <div>
            <p className="font-serif text-xl font-semibold text-navy">Nada no ledger ainda</p>
            <p className="mt-2 max-w-md text-sm text-mute">
              Os números daqui derivam dos eventos reais — quando o primeiro lead ou mensagem
              entrar, o dashboard acende sozinho.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-6 py-5 md:grid-cols-2 xl:grid-cols-3">
          <Cartao titulo="Leads por etapa" className="md:row-span-2">
            <FunilEtapas faixas={dados.leadsPorEtapa} />
          </Cartao>

          <Cartao titulo="Novos leads">
            <div className="flex items-end gap-8">
              <NumeroGrande valor={n(dados.novosHoje)} rotulo="hoje" />
              <NumeroGrande valor={n(dados.novos7d)} rotulo="últimos 7 dias" />
            </div>
          </Cartao>

          <Cartao titulo="Valor em negociação">
            <NumeroGrande valor={brl(valorNegociacao.total)} rotulo={`${n(valorNegociacao.comValor)} leads com valor em etapas abertas`} />
            {(valorNegociacao.semValor ?? 0) > 0 && (
              <p className="mt-2.5 text-[0.74rem] leading-relaxed text-mute">
                {n(valorNegociacao.semValor)} sem valor — o Kommo só preenche o valor no fechamento.
              </p>
            )}
          </Cartao>

          <Cartao titulo="Mensagens · últimos 7 dias">
            <MensagensPorDia dias={dados.mensagens7d} />
          </Cartao>

          <Cartao titulo="Entrega no WhatsApp">
            <NumeroGrande
              valor={entrega.pct != null ? `${entrega.pct.toLocaleString("pt-BR")}%` : "—"}
              rotulo="das saídas com estado conhecido chegaram (entregue ou lido)"
            />
            <div className="mt-3 flex gap-4 border-t border-linha pt-2.5 text-[0.78rem] text-suave">
              <span>{n(entrega.entregues)} entregues</span>
              <span>{n(entrega.base)} com estado</span>
              <span className={entrega.falhas ? "font-semibold text-vermelho" : ""}>{n(entrega.falhas)} falhas</span>
            </div>
          </Cartao>

          <Cartao titulo="Tempo de 1ª resposta">
            <NumeroGrande
              valor={formatarDuracaoMin(primeiraResposta.medianaMin)}
              rotulo={
                primeiraResposta.amostra > 0
                  ? `mediana · ${n(primeiraResposta.amostra)} conversas nos últimos 7 dias${primeiraResposta.parcial ? " · amostra parcial" : ""}`
                  : "sem conversas com resposta nos últimos 7 dias"
              }
            />
          </Cartao>
        </div>
      )}
    </div>
  );
}

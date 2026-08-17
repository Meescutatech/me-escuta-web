import Link from "next/link";
import type { DadosDashboard, DiaMensagens, FaixaEtapa, SaudeFluxo } from "@/lib/dados/dashboard";
import {
  MINIMO_DECISOES_PARA_REGUA,
  amostraFraca,
  formatarDuracaoMin,
  idadeCurta,
  percentualChegouAteAqui,
  taxaFechamento,
} from "@/lib/dados/dashboard-calculos";
import { diasDesde, lacunasDoPainel, DIAS_LEDGER_PARADO, type Lacuna } from "@/lib/dados/dashboard-lacunas";
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
  // Janela inteira em zero MEDIDO (não null): dizer, não deixar o vazio parecer falha de render.
  const tudoZero = dias.length > 0 && dias.every((d) => d.entrada === 0 && d.saida === 0);
  return (
    <div className="relative">
      {tudoZero && (
        <span className="absolute inset-x-0 top-5 text-center text-[12px] text-mute">
          sem mensagens nos últimos 7 dias
        </span>
      )}
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

// ─────────────── precisão por agente (R23, RF-15.3) ───────────────

/**
 * A base da régua de autonomia (RF-M3), visível pela primeira vez.
 *
 * Mostra a conta inteira, não só o percentual: aprovadas / corrigidas / rejeitadas ao lado da %.
 * É deliberado — "66,7%" sozinho não deixa ninguém julgar se aquilo é medição ou coincidência, e
 * com 15 decisões é coincidência. A marca "amostra pequena" diz isso na cara, e a % continua
 * aparecendo, porque escondê-la esconderia junto o fato de que a fila não está sendo validada.
 */
function PrecisaoAgentes({
  dados,
  geradoEm,
}: {
  dados: DadosDashboard["precisao"];
  geradoEm: string;
}) {
  const desdeUltima = idadeCurta(dados.ultimaDecisaoEm, new Date(geradoEm));
  return (
    <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Precisão por agente</h2>
        <span
          className="ml-auto font-mono text-[10.5px] text-mute"
          title="aprovadas sem correção ÷ (aprovadas + corrigidas + rejeitadas). Pendentes e obsoletas ficam fora."
        >
          aprovada sem correção ÷ decididas
        </span>
      </div>

      {dados.agentes == null ? (
        <p className="mt-3 text-[13px] text-suave">
          Leitura indisponível agora — <span className="font-mono">—</span> em vez de um número que não medimos.
        </p>
      ) : dados.agentes.length === 0 ? (
        <p className="mt-3 text-[13px] text-suave">
          Nenhuma sugestão foi decidida ainda. Precisão sem decisão não é 0% — é pergunta sem resposta.
        </p>
      ) : (
        <>
          {dados.geral && (
            <div className="flex items-baseline gap-2">
              <span className="text-[34px] font-[650] leading-[1.15] tracking-[-0.02em] tabular-nums text-tinta">
                {dados.geral.pct == null ? "—" : `${dados.geral.pct.toLocaleString("pt-BR")}%`}
              </span>
              <span className="text-[12.5px] text-suave">
                geral · <b className="font-semibold tabular-nums text-tinta">{dados.geral.aprovadas}</b> de{" "}
                <b className="font-semibold tabular-nums text-tinta">{dados.geral.decididas}</b> decisões
              </span>
            </div>
          )}
          {desdeUltima && (
            <div className={cn("mt-1 text-[12.5px]", (dados.geral?.decididas ?? 0) > 0 && "text-suave")}>
              última decisão há {desdeUltima}
            </div>
          )}
          <div className="mt-3 border-t border-linha/60 pt-2">
            <div className="mb-1 flex items-center gap-3">
              <span className="w-[72px] min-w-[72px]" />
              <span className="flex-1" />
              <span className="w-[74px] text-right font-mono text-[10px] uppercase tracking-[0.04em] text-mute">
                apr/cor/rej
              </span>
              <span className="w-12 text-right font-mono text-[10px] uppercase tracking-[0.04em] text-mute">
                precisão
              </span>
            </div>
            {dados.agentes.map((a) => {
              const fraca = amostraFraca(a);
              return (
                <div key={a.agente} className="flex min-h-7 items-center gap-3">
                  <span className="w-[72px] min-w-[72px] truncate text-[13px] text-tinta" title={a.agente}>
                    {a.agente}
                  </span>
                  <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-board">
                    {a.pct != null && (
                      <span
                        className={cn(
                          "block h-full rounded-[2px]",
                          // Cinza quando a amostra é pequena: a barra é comparação visual, e comparar
                          // 4 decisões com 15 pintadas da mesma cor convida exatamente ao erro que a
                          // marca "amostra pequena" tenta evitar.
                          fraca ? "bg-mute opacity-50" : a.pct >= 80 ? "bg-verde opacity-80" : "bg-laranja opacity-75",
                        )}
                        style={{ width: `${Math.max(2, a.pct)}%` }}
                      />
                    )}
                  </span>
                  <span className="w-[74px] text-right font-mono text-[11px] tabular-nums text-suave">
                    {a.aprovadas}/{a.corrigidas}/{a.rejeitadas}
                  </span>
                  <span
                    className={cn(
                      "w-12 text-right font-mono text-[12px] tabular-nums",
                      fraca ? "text-mute" : "text-tinta",
                    )}
                    title={fraca ? `só ${a.decididas} decisões — pouco para mover a régua de autonomia` : undefined}
                  >
                    {a.pct == null ? "—" : `${a.pct.toLocaleString("pt-BR")}%`}
                    {fraca && <span aria-hidden> *</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {dados.agentes.some(amostraFraca) && (
            <p className="mt-2 border-t border-linha/60 pt-2 text-[11.5px] text-mute">
              * menos de {MINIMO_DECISOES_PARA_REGUA} decisões — número real, amostra pequena demais para mover a
              régua de autonomia.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─────────────── saúde do fluxo (R23, RF-15.4) ───────────────

/** "2 min", "3 h", "5 d" a partir de segundos — a idade do item mais velho parado na fila. */
function segundosCurto(seg: number | null): string {
  if (seg == null) return "—";
  if (seg < 90) return `${Math.round(seg)}s`;
  const min = Math.round(seg / 60);
  if (min < 90) return `${min}min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/**
 * Fonte única com o F2: `ops.v_saude_fluxo`, atravessada por `core.v_saude_fluxo` (migration 0180).
 * Sem a view, a seção NÃO desenha zeros — ela diz que não está medindo. Lag 0 e falhas 0 é como um
 * sistema saudável se parece; é o disfarce mais perigoso que um painel pode vestir.
 */
function SaudeDoFluxo({ dados }: { dados: SaudeFluxo | null }) {
  return (
    <section className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
      <div className="mb-3 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">Saúde do fluxo</h2>
        <span className="ml-auto font-mono text-[10.5px] text-mute">ops.v_saude_fluxo</span>
      </div>
      {dados == null || !dados.disponivel ? (
        <p className="text-[13px] text-suave">
          <b className="font-semibold text-amarelo">Não medido.</b> A fonte existe, mas ainda não está exposta à
          API — sem ela, zeros aqui pareceriam saúde.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-5">
            <Metrica rot="Eventos · última hora" val={n(dados.eventosUltimaHora)} />
            <Metrica rot="Eventos · último min" val={n(dados.eventosUltimoMinuto)} />
            <Metrica
              rot="Duplicados rejeitados"
              val={n(dados.duplicadosUltimaHora)}
              // Duplicado rejeitado é o sistema FUNCIONANDO (idempotência barrando reentrega),
              // não um defeito — por isso não pinta de alerta.
            />
            <Metrica
              rot="Falhas de ingestão"
              val={n(dados.falhasUltimaHora)}
              tom={(dados.falhasUltimaHora ?? 0) > 0 ? "alerta" : undefined}
            />
            <Metrica
              rot="Fila de eventos"
              val={n(dados.lagFilaEventos)}
              tom={(dados.lagFilaEventos ?? 0) > 0 ? "alerta" : undefined}
            />
            <Metrica
              rot="Mais antigo na fila"
              val={segundosCurto(dados.idadeFilaEventosSeg)}
              // Idade alta com lag baixo = item preso reentregando; é o sintoma que o lag esconde.
              tom={(dados.idadeFilaEventosSeg ?? 0) > 300 ? "alerta" : undefined}
            />
            <Metrica rot="Fila de saída" val={n(dados.lagFilaSaida)} tom={(dados.lagFilaSaida ?? 0) > 0 ? "alerta" : undefined} />
            <Metrica
              rot="Envios falhados 24 h"
              val={n(dados.enviosFalhados24h)}
              tom={(dados.enviosFalhados24h ?? 0) > 0 ? "alerta" : undefined}
            />
          </div>
          {dados.ultimaIngestaoWhatsapp && (
            <p className="mt-2.5 border-t border-linha/60 pt-2 font-mono text-[10.5px] text-mute">
              última entrada de WhatsApp: {ddmmhhmm(dados.ultimaIngestaoWhatsapp) ?? "—"}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─────────────── o que não está sendo medido (R23, RF-15.5) ───────────────

/**
 * A regra do Rodolfo, na tela: no Kommo o campo Venda é R$ 0 em 12 das 13 etapas, e quem lê aquilo
 * conclui que a operação não vende. Aqui o que não é medido é ESCRITO, com o motivo — nunca
 * exibido como zero ao lado dos números que foram medidos de verdade.
 */
function NaoMedido({ lacunas }: { lacunas: Lacuna[] }) {
  if (lacunas.length === 0) return null;
  return (
    <section className="rounded-[10px] border border-dashed border-linha bg-board/40 px-5 py-[18px]">
      <div className="mb-3 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">
          O que este painel não está medindo
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-mute">{lacunas.length}</span>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {lacunas.map((l) => (
          <li key={l.titulo} className="border-l-2 border-linha pl-3">
            <div className="text-[13px] font-semibold text-tinta">{l.titulo}</div>
            <div className="mt-0.5 text-[12.5px] leading-[1.45] text-suave">{l.porque}</div>
          </li>
        ))}
      </ul>
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

  // R23 · a ingestão parou? Então "0 novos hoje" é notícia sobre a IMPORTAÇÃO, não sobre a
  // operação — e o tile precisa dizer qual das duas, em vez de deixar o zero responder pelas duas.
  const agora = new Date(geradoEm);
  const diasSemLeadNovo = diasDesde(dados.recencia.ultimoLeadCriadoEm, agora);
  const ingestaoParada = diasSemLeadNovo != null && diasSemLeadNovo >= DIAS_LEDGER_PARADO;
  const lacunas = lacunasDoPainel({
    ultimoLeadCriadoEm: dados.recencia.ultimoLeadCriadoEm,
    saudeFluxoDisponivel: dados.saudeFluxo?.disponivel === true,
    decisoesDeSugestao: dados.precisao.geral?.decididas ?? null,
    agora,
  });

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
              {/* R23: o "novos hoje / 7 dias" some quando a ingestão parou. Ele lê a data de
                  IMPORTAÇÃO do lead, então com o ledger parado ele reporta zero importações — e
                  esse zero, ao lado de um número medido, é lido como "nenhum lead novo". */}
              {ingestaoParada ? (
                <div className="mt-1.5 text-[12.5px] text-amarelo">
                  nenhum lead entrou no ledger há {diasSemLeadNovo} dias — leads novos{" "}
                  <b className="font-semibold">não estão sendo medidos</b>
                </div>
              ) : (
                <div className="mt-1.5 text-[12.5px] text-suave">
                  <b className="font-semibold tabular-nums text-tinta">{n(dados.novosHoje)}</b> novos hoje ·{" "}
                  <b className="font-semibold tabular-nums text-tinta">{n(dados.novos7d)}</b> nos últimos 7 dias
                </div>
              )}
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

              {/* R23 · RF-15.3: a precisão que a régua de autonomia lê, logo abaixo da fila que a
                  alimenta — as duas juntas contam a história inteira do human-on-the-loop. */}
              <PrecisaoAgentes dados={dados.precisao} geradoEm={geradoEm} />

              {/* R23 · RF-15.4 */}
              <SaudeDoFluxo dados={dados.saudeFluxo} />

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

          {/* R23 · RF-15.5 — por último e com moldura diferente: é o rodapé de honestidade do
              painel, não mais um número. Separá-lo visualmente é o ponto. */}
          <div className="mt-3">
            <NaoMedido lacunas={lacunas} />
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

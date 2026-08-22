import Link from "next/link";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { PRESETS } from "@/lib/dados/marketing";
import {
  brl,
  pct,
  type Fatia,
  type Frescura,
  type LinhaCampanha,
  type PontoSerie,
  type ToqueCru,
} from "@/lib/dados/marketing-calculos";
import { BarraPopulacao, type Segmento } from "./barra-populacao";
import { cn } from "@/lib/utils";

/**
 * T7 - A TELA DO FERNANDO (RF-10 / RF-11 / RF-13).
 *
 * A ordem de leitura e uma decisao, nao um acaso: COBERTURA ANTES DOS NUMEROS. A tela diz
 * quanto ela enxerga antes de dizer o que enxergou, porque numero sem cobertura declarada
 * parece completo - foi assim que "75,4% -> 17,5%" passou 36 dias sem ninguem ver.
 *
 * Apresentacao pura: recebe a visao pronta, nao le banco, nao decide recorte.
 */

function n(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}

function ddmm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
}

function ddmmhh(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} ${hora}`;
}

function Secao({
  titulo,
  nota,
  children,
  className,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[10px] border border-linha bg-branco px-5 py-[18px]", className)}>
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">{titulo}</h2>
        {nota && <span className="ml-auto font-mono text-[10.5px] text-mute">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────── periodo ───────────────────────────

function SeletorPeriodo({ ativo }: { ativo: string }) {
  return (
    <nav className="flex items-center gap-1" aria-label="Periodo">
      {PRESETS.map((p) => {
        const selecionado = ativo.includes(p.rotulo);
        return (
          <Link
            key={p.chave}
            href={`/marketing?p=${p.chave}`}
            className={cn(
              "rounded-[7px] border px-2.5 py-1 text-[12.5px] transition-colors",
              selecionado
                ? "border-navy bg-bolha-out font-semibold text-navy"
                : "border-linha text-suave hover:bg-hover",
            )}
            aria-current={selecionado ? "page" : undefined}
          >
            {p.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

// ─────────────────────────── RF-13 · frescura ───────────────────────────

/**
 * Duas fontes, dois carimbos, NUNCA uma media - custo e captacao atrasam por motivos
 * diferentes, e a media esconderia justamente a que parou.
 */
function FaixaFrescura({ frescura }: { frescura: Frescura[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {frescura.map((f) => (
        <span key={f.fonte} className="flex items-center gap-1.5 font-mono text-[11px]">
          <span
            className={cn(
              "h-[7px] w-[7px] rounded-full",
              f.velha === true ? "bg-amarelo" : f.velha === false ? "bg-verde" : "border border-mute",
            )}
            aria-hidden
          />
          <span className="text-suave">{f.rotulo}:</span>
          {f.ate == null ? (
            <span className="text-mute">sem dado nenhum</span>
          ) : (
            <span className={f.velha ? "font-semibold text-amarelo" : "text-tinta"}>
              {ddmmhh(f.ate)}
              {f.velha && ` · parada ha ${Math.floor(f.horas ?? 0)}h`}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────── RF-11 · cobertura ───────────────────────────

/**
 * A tela declara a propria cobertura ANTES de mostrar numero. Nao e enfeite: e o que impede
 * "12 leads de anuncio" de ser lido como "o marketing trouxe 12 leads" quando o que houve
 * foram 100 leads e visao de 12.
 *
 * A taxa e "—" quando o denominador e zero, nunca "0%": zero dividido por zero nao mede
 * cobertura nenhuma, e exibir 0% AFIRMA uma medicao que nao aconteceu.
 */
function FaixaCobertura({ visao }: { visao: VisaoMarketing }) {
  const c = visao.cobertura;
  const tudoCasado =
    c.taxaComAtribuicao === 1 &&
    visao.baldes.leadsSemCusto === 0 &&
    visao.baldes.gastoSemLead === 0 &&
    visao.baldes.leadsSemData === 0 &&
    visao.baldes.leadsSemPlataforma === 0;

  const populacao: Segmento[] = [
    {
      rotulo: "Com atribuicao",
      valor: c.leadsComAtribuicao,
      tom: "ok",
      porque: "sabemos por onde entrou",
    },
    {
      rotulo: "Sem canal nenhum",
      valor: c.leadsSemCanalNenhum ?? 0,
      tom: "buraco",
      porque: "entrou por caminho que nao deixa rastro",
    },
  ];

  return (
    <Secao titulo="O que esta tela enxerga" nota="cobertura declarada · RF-11">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 self-start">
          <Medida
            rotulo="Leads com atribuicao"
            valor={pct(c.taxaComAtribuicao)}
            detalhe={
              c.leadsNoPeriodo == null
                ? "total de leads do periodo indisponivel"
                : `${n(c.leadsComAtribuicao)} de ${n(c.leadsNoPeriodo)} leads`
            }
          />
          <Medida
            rotulo="Toques com ctwa_clid"
            valor={pct(c.taxaComClid)}
            detalhe={c.toques === 0 ? "nenhum toque no periodo" : `de ${n(c.toques)} toques`}
          />
          <Medida
            rotulo="Serie comeca em"
            valor={c.inicioSerie ? ddmm(c.inicioSerie) : "—"}
            detalhe={
              c.inicioSerie
                ? "antes disso nao havia captura, nao havia zero"
                : "nenhuma captacao entrou ainda"
            }
          />
          <Medida
            rotulo="Toques sem data"
            valor={n(visao.baldes.leadsSemData)}
            detalhe="contados fora de qualquer periodo"
          />
        </div>
        <BarraPopulacao
          titulo="Leads do periodo, por visibilidade"
          segmentos={populacao}
          vazioDiz={
            c.leadsNoPeriodo == null
              ? "Nao foi possivel ler o total de leads do periodo — sem ele nao ha como dizer que fracao esta coberta."
              : "Nenhum lead entrou no periodo. Sem leads, nao ha cobertura a medir."
          }
        />
      </div>

      {/*
        Aviso que aparece SEMPRE vira ruido e ninguem le. Quando esta tudo casado, ele some -
        e a mesma regua do RF-14: alarme que grita sem motivo treina a operacao a ignora-lo.
      */}
      {tudoCasado && (
        <p className="mt-4 border-t border-linha pt-3 text-[12.5px] text-verde">
          Tudo casado neste periodo: cobertura total, nada sem custo, nada sem lead, nada sem data.
        </p>
      )}
    </Secao>
  );
}

function Medida({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-suave">{rotulo}</div>
      <div className="mt-1 text-[26px] font-[650] leading-[1.15] tracking-[-0.02em] tabular-nums text-tinta">
        {valor}
      </div>
      <div className="mt-0.5 text-[11.5px] text-mute">{detalhe}</div>
    </div>
  );
}

// ─────────────────────────── o estado vazio, nomeado ───────────────────────────

const ESTADO_VAZIO: Record<string, { titulo: string; corpo: string; tom: "neutro" | "incidente" }> = {
  serie_nao_iniciada: {
    titulo: "A captura ainda nao entrou no ar",
    corpo:
      "Nenhuma captacao foi registrada ate agora, em periodo nenhum. Isto e estado de implantacao, nao resultado de marketing — nao ha o que este periodo pudesse mostrar.",
    tom: "incidente",
  },
  antes_da_serie: {
    titulo: "Este periodo e anterior ao inicio da serie",
    corpo:
      "A captura comecou depois do fim deste recorte. Um grafico zerado aqui diria 'o marketing nao trouxe ninguem', e a verdade e 'ainda nao mediamos'.",
    tom: "neutro",
  },
  sem_dado_no_periodo: {
    titulo: "Sem dado no periodo",
    corpo:
      "A serie cobre este recorte e nenhuma captacao caiu nele. Este zero e medido: e noticia sobre o periodo, nao falha de leitura.",
    tom: "neutro",
  },
};

function EstadoVazio({ estado, inicioSerie }: { estado: string; inicioSerie: string | null }) {
  const e = ESTADO_VAZIO[estado];
  if (!e) return null;
  return (
    <section
      className={cn(
        "rounded-[10px] border px-5 py-6",
        e.tom === "incidente" ? "border-amarelo-bd bg-amarelo-bg" : "border-linha bg-branco",
      )}
    >
      <h2 className={cn("text-[15px] font-semibold", e.tom === "incidente" ? "text-amarelo" : "text-tinta")}>
        {e.titulo}
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-suave">{e.corpo}</p>
      {estado === "antes_da_serie" && inicioSerie && (
        <p className="mt-2 font-mono text-[12px] text-tinta">A serie comeca em {ddmm(inicioSerie)}.</p>
      )}
    </section>
  );
}

// ─────────────────────────── resumo ───────────────────────────

function Tile({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
      <div className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-suave">{rotulo}</div>
      <div className="mt-2 text-[34px] font-[650] leading-[1.15] tracking-[-0.02em] tabular-nums text-tinta">
        {valor}
      </div>
      {detalhe && <div className="mt-1 text-[11.5px] text-mute">{detalhe}</div>}
    </div>
  );
}

/** O texto do dinheiro muda com o ESTADO da ingestao - nunca "R$ 0,00" por tabela vazia. */
function detalheDoCusto(estado: VisaoMarketing["estadoCusto"]): string {
  if (estado === "sem_ingestao") return "nenhum custo ingerido — incidente, nao zero";
  if (estado === "sem_linhas_no_periodo") return "ha custo ingerido, nenhum neste periodo";
  return "soma do periodo";
}

// ─────────────────────────── serie temporal ───────────────────────────

function Serie({ pontos }: { pontos: PontoSerie[] }) {
  const max = Math.max(1, ...pontos.map((p) => p.toques));
  const altura = 72;
  // Rotulo so nas pontas e no meio quando a janela e longa: 90 legendas viram tarja cinza.
  const passo = Math.max(1, Math.ceil(pontos.length / 10));
  return (
    <div>
      <div className="flex items-end gap-[3px] border-b border-linha pb-px" style={{ height: altura + 1 }}>
        {pontos.map((p) => (
          <div
            key={p.dia}
            className="flex flex-1 items-end justify-center"
            title={`${p.rotulo} · ${n(p.toques)} toques${p.gasto == null ? "" : ` · ${brl(p.gasto)}`}`}
          >
            <span
              className={cn("w-full max-w-[18px] rounded-t-[2px]", p.toques > 0 ? "bg-laranja" : "bg-linha")}
              style={{ height: `${p.toques > 0 ? Math.max(3, (p.toques / max) * altura) : 2}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {pontos.map((p, i) => (
          <span key={p.dia} className="flex-1 text-center font-mono text-[10px] text-mute">
            {i % passo === 0 ? p.rotulo.slice(4) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── rankings ───────────────────────────

function Ranking({ fatias, vazioDiz, teto = 8 }: { fatias: Fatia[]; vazioDiz: string; teto?: number }) {
  if (fatias.length === 0) return <p className="text-[12.5px] text-mute">{vazioDiz}</p>;
  const max = Math.max(1, ...fatias.map((f) => f.toques));
  const mostradas = fatias.slice(0, teto);
  const sobra = fatias.length - mostradas.length;
  return (
    <div>
      {mostradas.map((f) => (
        <div key={f.chave} className="flex min-h-7 items-center gap-3">
          <span
            className={cn("w-[46%] truncate text-[13px]", f.chave === "__ausente__" ? "text-amarelo" : "text-tinta")}
            title={f.rotulo}
          >
            {f.rotulo}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-board">
            <span
              className={cn("block h-full rounded-[3px]", f.chave === "__ausente__" ? "bg-amarelo" : "bg-laranja opacity-85")}
              style={{ width: `${Math.max(2, (f.toques / max) * 100)}%` }}
            />
          </span>
          <span className="w-10 text-right font-mono text-[12px] tabular-nums text-tinta">{n(f.toques)}</span>
        </div>
      ))}
      {sobra > 0 && (
        <p className="mt-2 font-mono text-[11px] text-mute">
          + {n(sobra)} fora da lista — o ranking mostra {teto}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── (f) custo por campanha ───────────────────────────

function TabelaCampanhas({ linhas, estadoCusto }: { linhas: LinhaCampanha[]; estadoCusto: VisaoMarketing["estadoCusto"] }) {
  if (linhas.length === 0) {
    return <p className="text-[12.5px] text-mute">Nenhuma campanha com toque ou com gasto neste periodo.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-linha text-left font-mono text-[10.5px] uppercase tracking-[0.04em] text-mute">
            <th className="pb-1.5 font-normal">Campanha</th>
            <th className="pb-1.5 font-normal">Plataforma</th>
            <th className="pb-1.5 text-right font-normal">Leads</th>
            <th className="pb-1.5 text-right font-normal">Gasto</th>
            <th className="pb-1.5 text-right font-normal">Por lead</th>
          </tr>
        </thead>
        <tbody>
          {linhas.slice(0, 12).map((l) => (
            <tr key={`${l.plataforma}-${l.campanhaId}`} className="border-b border-linha/60 last:border-0">
              <td className="max-w-[280px] truncate py-1.5 text-tinta" title={l.rotulo}>
                {l.rotulo}
              </td>
              <td className="py-1.5 text-suave">
                {l.plataforma ?? <span className="text-amarelo">sem plataforma</span>}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums text-tinta">
                {l.leads === 0 ? <span className="text-amarelo">0</span> : n(l.leads)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums text-tinta">{brl(l.gasto)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-tinta">{brl(l.custoPorLead)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {estadoCusto === "sem_ingestao" && (
        <p className="mt-2.5 text-[12px] text-amarelo">
          Os travessoes de gasto sao ausencia de ingestao, nao gasto zero: nenhuma linha de custo entrou no
          sistema ate agora.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── atribuicoes recentes ───────────────────────────

function Recentes({ toques }: { toques: ToqueCru[] }) {
  if (toques.length === 0) {
    return <p className="text-[12.5px] text-mute">Nenhuma atribuicao no periodo.</p>;
  }
  return (
    <ul className="divide-y divide-linha/60">
      {toques.map((t, i) => (
        <li key={`${t.lead_id}-${t.criado_em}-${i}`} className="flex items-baseline gap-3 py-1.5 text-[12.5px]">
          <span className="w-[86px] shrink-0 font-mono text-[11.5px] tabular-nums text-mute">
            {ddmmhh(t.capturado_em)}
          </span>
          <span className="w-[92px] shrink-0 truncate text-suave" title={t.fonte}>
            {t.fonte}
          </span>
          <span className="min-w-0 flex-1 truncate text-tinta" title={t.campanha_nome ?? t.campanha_id ?? ""}>
            {t.campanha_nome ?? t.campanha_id ?? <span className="text-amarelo">sem campanha</span>}
          </span>
          <span className="hidden w-[160px] shrink-0 truncate text-suave sm:block" title={t.anuncio_nome ?? ""}>
            {t.anuncio_nome ?? t.anuncio_id ?? "—"}
          </span>
          <span className="w-[70px] shrink-0 text-right font-mono text-[11px] text-mute">
            {t.clids?.ctwa_clid ? "ctwa" : t.clids?.gclid ? "gclid" : t.clids?.fbclid ? "fbclid" : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────── os cinco baldes ───────────────────────────

function Baldes({ visao }: { visao: VisaoMarketing }) {
  const b = visao.baldes;
  const leads: Segmento[] = [
    { rotulo: "Casados com custo", valor: b.leadsCasados, tom: "ok", porque: "campanha com gasto ingerido" },
    { rotulo: "Sem custo", valor: b.leadsSemCusto, tom: "buraco", porque: "campanha sem gasto ingerido" },
    { rotulo: "Sem campanha, por falha", valor: b.leadsSemCampanhaPorFalha, tom: "buraco", porque: "a resolucao tentou e nao conseguiu" },
    { rotulo: "Sem campanha, correto", valor: b.leadsSemCampanhaOk, tom: "neutro", porque: "nao havia anuncio a resolver" },
  ];
  const dinheiro: Segmento[] = [
    { rotulo: "Gasto casado", valor: b.gastoCasado, tom: "ok", porque: "campanha com lead no periodo" },
    { rotulo: "Gasto sem lead", valor: b.gastoSemLead, tom: "buraco", porque: "dinheiro que nao trouxe lead casado" },
  ];

  return (
    <Secao titulo="Os cinco baldes do casamento" nota="RF-9 · calculado pela tela, nao pelo oraculo">
      <div className="grid gap-7 md:grid-cols-2">
        <BarraPopulacao
          titulo="Leads do periodo"
          segmentos={leads}
          vazioDiz="Nenhum toque no periodo — nao ha o que casar."
        />
        <BarraPopulacao
          titulo="Dinheiro do periodo"
          segmentos={dinheiro}
          formatar={(v) => brl(v)}
          vazioDiz={
            visao.estadoCusto === "sem_ingestao"
              ? "Nenhum custo ingerido ate agora. Isto e incidente de ingestao, nao gasto zero."
              : "Nenhum gasto neste periodo."
          }
        />
      </div>

      <div className="mt-5 grid gap-x-6 gap-y-2 border-t border-linha pt-3.5 sm:grid-cols-2">
        <LinhaBalde
          rotulo="Toques sem data de ocorrencia"
          valor={n(b.leadsSemData)}
          porque="fora de todo periodo — a fonte nao disse quando aconteceu"
          alerta={b.leadsSemData > 0}
        />
        {/*
          O ROTULO DIZ "COM CAMPANHA" DE PROPOSITO. Este numero conta so quem tem campanha e nao
          tem plataforma; a barra "Meta x Google" acima conta TODO toque sem plataforma, inclusive
          os que nao tem campanha nenhuma. Sao definicoes diferentes e os dois estao certos — mas
          com o rotulo generico ficavam lado a lado parecendo contradicao (5 aqui, 12 la), e um
          numero que parece se contradizer com o vizinho e um numero em que ninguem confia.
        */}
        <LinhaBalde
          rotulo="Com campanha e sem plataforma"
          valor={n(b.leadsSemPlataforma)}
          porque="metade da chave de casamento faltando — nunca casam"
          alerta={b.leadsSemPlataforma > 0}
        />
        <LinhaBalde
          rotulo="As partes fecham o dinheiro"
          valor={b.reconciliaDinheiro ? "sim" : "NAO"}
          porque="casado + sem lead = gasto total"
          alerta={!b.reconciliaDinheiro}
        />
        <LinhaBalde
          rotulo="As partes fecham os leads"
          valor={b.reconciliaLeads ? "sim" : "NAO"}
          porque="os quatro baldes = total de toques"
          alerta={!b.reconciliaLeads}
        />
      </div>
    </Secao>
  );
}

function LinhaBalde({
  rotulo,
  valor,
  porque,
  alerta,
}: {
  rotulo: string;
  valor: string;
  porque: string;
  alerta: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 text-[12.5px]">
      <span className="text-suave">{rotulo}</span>
      <span className="hidden text-[11.5px] text-mute lg:inline">{porque}</span>
      <span className={cn("ml-auto font-mono tabular-nums", alerta ? "font-semibold text-amarelo" : "text-tinta")}>
        {valor}
      </span>
    </div>
  );
}

// ─────────────────────────── a tela ───────────────────────────

export function PainelMarketing({ visao }: { visao: VisaoMarketing }) {
  const temDado = visao.estado === "com_dado";

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-7">
      <header className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <h1 className="text-[22px] font-[650] leading-tight tracking-[-0.01em] text-tinta">Marketing</h1>
          <p className="mt-0.5 text-[12.5px] text-suave">
            De onde vieram os leads, quanto custaram, e o quanto disso nos conseguimos ver — {visao.periodo.rotulo}.
          </p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          <SeletorPeriodo ativo={visao.periodo.rotulo} />
          <FaixaFrescura frescura={visao.frescura} />
        </div>
      </header>

      {visao.leituraFalhou && (
        <p className="mb-4 rounded-[7px] border border-vermelho-bd bg-vermelho-bg px-3.5 py-2.5 text-[12.5px] text-vermelho">
          Parte da leitura falhou agora. O que nao chegou aparece como travessao — nao como zero. Recarregar pode
          resolver.
        </p>
      )}

      {visao.parcial && (
        <p className="mb-4 rounded-[7px] border border-amarelo-bd bg-amarelo-bg px-3.5 py-2.5 text-[12.5px] text-amarelo">
          O periodo tem mais linhas do que esta tela le de uma vez. Os numeros abaixo sao de uma AMOSTRA, nao do
          total — escolha um periodo menor para ter o numero fechado.
        </p>
      )}

      {/* COBERTURA PRIMEIRO. Ela vale para todo recorte, inclusive o vazio. */}
      <div className="space-y-5">
        <FaixaCobertura visao={visao} />

        {!temDado && <EstadoVazio estado={visao.estado} inicioSerie={visao.cobertura.inicioSerie} />}

        {temDado && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Tile rotulo="Toques" valor={n(visao.resumo.toques)} detalhe="1 linha por captacao" />
              <Tile rotulo="Leads" valor={n(visao.resumo.leads)} detalhe="pessoas distintas" />
              <Tile
                rotulo="Gasto"
                valor={brl(visao.resumo.gasto)}
                detalhe={detalheDoCusto(visao.estadoCusto)}
              />
              <Tile
                rotulo="Custo por lead"
                valor={brl(visao.resumo.custoPorLead)}
                detalhe={visao.resumo.custoPorLead == null ? "sem gasto ou sem lead para dividir" : "gasto / leads"}
              />
            </div>

            <Secao titulo="Captacao por dia" nota="serie temporal">
              <Serie pontos={visao.serie} />
            </Secao>

            <div className="grid gap-5 md:grid-cols-2">
              <Secao titulo="Pago x organico" nota="config canal_captacao v2">
                {visao.vocabularioDisponivel ? (
                  <BarraPopulacao
                    titulo="Toques por natureza da fonte"
                    segmentos={visao.pagoOrganico.map((f) => ({
                      rotulo: f.rotulo,
                      valor: f.toques,
                      tom: f.chave === "pago" ? "ok" : f.chave === "organico" ? "neutro" : "buraco",
                      porque:
                        f.chave === "nao_classificado"
                          ? "a fonte recebe pago E organico pela mesma chave"
                          : undefined,
                    }))}
                    vazioDiz="Nenhum toque no periodo."
                  />
                ) : (
                  <p className="text-[12.5px] text-amarelo">
                    O vocabulario `canal_captacao` nao respondeu. Sem ele nao da para dizer o que e pago e o que e
                    organico — e chutar seria pior que nao responder.
                  </p>
                )}
              </Secao>

              <Secao titulo="Meta x Google" nota="plataforma da captacao">
                <BarraPopulacao
                  titulo="Toques por plataforma"
                  // Meta e Google precisam de cores DIFERENTES: a barra existe para compara-las,
                  // e duas fatias laranja nao respondem a pergunta que dao nome a secao.
                  segmentos={visao.plataformas.map((f) => ({
                    rotulo: f.rotulo,
                    valor: f.toques,
                    tom:
                      f.chave === "sem_plataforma"
                        ? "buraco"
                        : f.chave === "meta"
                          ? "ok"
                          : f.chave === "google"
                            ? "alt"
                            : "neutro",
                    porque: f.chave === "sem_plataforma" ? "nao casa com custo nenhum" : undefined,
                  }))}
                  vazioDiz="Nenhum toque no periodo."
                />
              </Secao>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Secao titulo="Ranking por anuncio" nota="qual criativo trouxe">
                <Ranking fatias={visao.anuncios} vazioDiz="Nenhum anuncio identificado no periodo." />
              </Secao>
              <Secao titulo="Cidade da segmentacao" nota="onde o anuncio rodou, nao onde a pessoa esta">
                <Ranking fatias={visao.cidades} vazioDiz="Nenhuma cidade na segmentacao das campanhas do periodo." />
              </Secao>
            </div>

            <Secao titulo="Campanhas e o que custaram" nota="custo por campanha · D20">
              <TabelaCampanhas linhas={visao.custoCampanhas} estadoCusto={visao.estadoCusto} />
            </Secao>
          </>
        )}

        {/* Os baldes valem para todo recorte: e onde o dinheiro sem lead aparece mesmo com zero lead. */}
        <Baldes visao={visao} />

        {temDado && (
          <Secao titulo="Atribuicoes recentes" nota={`ultimas ${visao.recentes.length}`}>
            <Recentes toques={visao.recentes} />
          </Secao>
        )}

        <Rodape visao={visao} />
      </div>
    </div>
  );
}

/**
 * A PROVENIENCIA, escrita na tela e nao so no commit. Quem le um numero aqui tem direito de
 * saber por qual caminho ele veio - e, principalmente, que ele NAO veio do mesmo lugar que o
 * comando que o confere.
 */
function Rodape({ visao }: { visao: VisaoMarketing }) {
  return (
    <footer className="border-t border-linha pt-3.5 text-[11.5px] leading-relaxed text-mute">
      <p>
        Numeros lidos de <span className="font-mono">core.captacao</span> e{" "}
        <span className="font-mono">core.custo_midia</span> e agregados por esta tela. A tela nao chama{" "}
        <span className="font-mono">core.casamento_midia</span>: aquela funcao e o oraculo que confere estes
        numeros, e tela que chama o proprio conferidor nao pode ficar vermelha (RF-10).
      </p>
      <p className="mt-1">
        Recorte <span className="font-mono">{visao.periodo.ini}</span> ate{" "}
        <span className="font-mono">{visao.periodo.fim}</span> (fim exclusivo) · gerado{" "}
        {ddmmhh(visao.geradoEm)}
        {visao.flagAtiva == null && (
          <>
            {" · "}
            <span className="text-amarelo">
              a flag `flag.modulo_marketing` ainda nao existe em core.config — esta tela nao esta atras de flag
              nenhuma
            </span>
          </>
        )}
      </p>
    </footer>
  );
}

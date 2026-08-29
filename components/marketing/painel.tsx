import Link from "next/link";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { PRESETS } from "@/lib/dados/marketing";
import { brl, inteiro, pct } from "@/lib/dados/marketing-calculos";
import { cn } from "@/lib/utils";
import { ArvoreOrigem } from "./arvore-origem";
import { FunilOrigem } from "./funil-origem";
import { SerieLeads } from "./serie-leads";
import { TabelaCampanhas } from "./tabela-campanhas";
import { TEXTO_SEM_CAPTURA, Vazio } from "./vazio";

/**
 * Marketing — a tela do Fernando. Apresentacao pura: recebe a visao pronta.
 * Ordem de leitura: quanto (tiles) -> quando (serie) -> de onde (arvore) -> ate onde (funil)
 * -> quanto custou cada uma (campanhas).
 */

function Secao({ titulo, nota, children, className }: { titulo: string; nota?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[10px] border border-linha bg-branco px-5 py-[18px]", className)}>
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-suave">{titulo}</h2>
        {nota && <span className="ml-auto text-[11.5px] text-mute">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function SeletorPeriodo({ ativo }: { ativo: VisaoMarketing["periodo"]["preset"] }) {
  return (
    <nav className="flex items-center gap-1" aria-label="Periodo">
      {PRESETS.map((p) => {
        const selecionado = ativo === p.chave;
        return (
          <Link
            key={p.chave}
            href={`/marketing?p=${p.chave}`}
            className={cn(
              "rounded-[7px] border px-2.5 py-1 text-[12.5px] transition-colors",
              selecionado ? "border-navy bg-bolha-out font-semibold text-navy" : "border-linha text-suave hover:bg-hover",
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

function Tile({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-[10px] border border-linha bg-branco px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-suave">{rotulo}</div>
      <div className="mt-1.5 text-[28px] font-[650] leading-[1.1] tracking-[-0.02em] tabular-nums text-tinta">{valor}</div>
      {detalhe && <div className="mt-1 text-[11.5px] text-mute">{detalhe}</div>}
    </div>
  );
}

export function PainelMarketing({ visao }: { visao: VisaoMarketing }) {
  const semCaptura = visao.estado !== "com_dado";
  const acao90 = visao.periodo.preset !== "90d" ? { rotulo: "Ver 90 dias", href: "/marketing?p=90d" } : undefined;
  const textoVazio =
    visao.estado === "serie_nao_iniciada" || visao.estado === "antes_da_serie"
      ? TEXTO_SEM_CAPTURA
      : "Nenhum lead captado neste periodo.";

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-[650] leading-tight tracking-[-0.01em] text-tinta">Marketing</h1>
            {visao.ensaio && (
              <span className="rounded-[5px] border border-amarelo-bd bg-amarelo-bg px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-amarelo">
                ensaio
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-suave">{visao.periodo.rotulo}</p>
        </div>
        <SeletorPeriodo ativo={visao.periodo.preset} />
      </header>

      {visao.leituraFalhou && (
        <p className="mb-4 rounded-[7px] border border-vermelho-bd bg-vermelho-bg px-3.5 py-2 text-[12.5px] text-vermelho">
          Parte da leitura falhou. O que falhou aparece como &ldquo;—&rdquo;.{" "}
          <Link href={`/marketing?p=${visao.periodo.preset ?? "30d"}`} className="font-medium underline-offset-2 hover:underline">
            Recarregar
          </Link>
        </p>
      )}
      {visao.parcial && (
        <p className="mb-4 rounded-[7px] border border-amarelo-bd bg-amarelo-bg px-3.5 py-2 text-[12.5px] text-amarelo">
          Periodo grande demais: os numeros sao de uma amostra.{" "}
          <Link href="/marketing?p=7d" className="font-medium underline-offset-2 hover:underline">
            Ver 7 dias
          </Link>
        </p>
      )}

      {semCaptura ? (
        <div className="rounded-[10px] border border-linha bg-branco px-5 py-6">
          <Vazio texto={textoVazio} acao={acao90} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile rotulo="Leads" valor={inteiro(visao.resumo.leads)} />
            <Tile rotulo="Pagos" valor={pct(visao.resumo.fracaoPaga)} detalhe="dos leads vieram de anuncio" />
            <Tile
              rotulo="Investido"
              valor={brl(visao.resumo.gasto)}
              detalhe={visao.resumo.gasto == null ? "sem custo ingerido" : "Meta e Google"}
            />
            <Tile rotulo="CPL" valor={brl(visao.resumo.cpl)} detalhe={visao.resumo.cpl == null ? "sem custo ingerido" : "por lead pago"} />
          </div>

          <Secao titulo="Leads por dia">
            <SerieLeads pontos={visao.serie} />
          </Secao>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Secao titulo="De onde vieram" nota={!visao.vocabularioDisponivel ? "sem vocabulario de canais" : undefined}>
              {visao.arvore.length === 0 ? (
                <Vazio texto="Nenhum lead com origem neste periodo." />
              ) : (
                <ArvoreOrigem arvore={visao.arvore} total={visao.resumo.leads} />
              )}
            </Secao>
            <div className="space-y-4">
              <Secao titulo="Ate onde chegaram" nota="etapa atual">
                <FunilOrigem linhas={visao.funil} marcos={visao.marcos} />
              </Secao>
              <Secao titulo="Campanhas e custo">
                <TabelaCampanhas linhas={visao.campanhas} estadoCusto={visao.estadoCusto} />
              </Secao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

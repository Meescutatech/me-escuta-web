import { brl, inteiro, pct, SEM_CAMPANHA, type NoOrigem } from "@/lib/dados/marketing-calculos";
import { corDe } from "./marcas";
import { cn } from "@/lib/utils";

/**
 * A ORIGEM DO LEAD como hierarquia — o elemento que a tela e.
 *
 * Pago / Organico -> Meta / Google -> campanha -> anuncio. Cada linha e um no: nome, cidades
 * da segmentacao, barra proporcional ao total de leads do periodo, leads e CPL. Campanha com
 * anuncios abre e fecha com `<details>` nativo — zero JS, funciona no teclado.
 */

const RECUO = 18;

function Linha({ no, total, nivel, resumo }: { no: NoOrigem; total: number; nivel: number; resumo: boolean }) {
  const cor = corDe(no.balde, no.plataforma);
  const largura = total > 0 ? Math.max(no.leads > 0 ? 1.5 : 0, (no.leads / total) * 100) : 0;
  const forte = nivel === 0;
  const cidades = no.cidades.length > 0 && no.nivel !== "balde" ? no.cidades.join(" · ") : null;
  const semCampanha = no.chave === SEM_CAMPANHA;
  return (
    <div
      className={cn(
        "grid items-center gap-x-3 py-[7px]",
        "grid-cols-[minmax(0,1fr)_minmax(90px,28%)_56px_84px]",
        nivel > 0 && "border-t border-linha/70",
        resumo && "cursor-pointer rounded-[6px] hover:bg-hover",
      )}
      style={{ paddingLeft: nivel * RECUO }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {resumo ? (
          <span className="seta-arvore shrink-0 text-[10px] text-mute transition-transform" aria-hidden>
            ▶
          </span>
        ) : (
          <span className="w-[10px] shrink-0" aria-hidden />
        )}
        <span
          className={cn("h-[9px] w-[9px] shrink-0", no.nivel === "balde" ? "rounded-[2px]" : "rounded-full")}
          style={{ background: no.leads > 0 || no.gasto != null ? cor : "transparent", boxShadow: no.leads === 0 && no.gasto == null ? `inset 0 0 0 1.5px ${cor}` : undefined }}
          aria-hidden
        />
        <span className={cn("truncate", forte ? "text-[13.5px] font-semibold text-tinta" : "text-[13px] text-tinta", semCampanha && "text-suave")}>
          {no.rotulo}
        </span>
        {cidades && <span className="truncate text-[11.5px] text-mute">{cidades}</span>}
      </div>
      <div className="h-[8px] overflow-hidden rounded-[2px] bg-fundo" aria-hidden>
        <div className="h-full rounded-[2px]" style={{ width: `${largura}%`, background: cor, opacity: forte ? 1 : 0.85 }} />
      </div>
      <div className={cn("text-right font-mono tabular-nums", forte ? "text-[13px] font-semibold text-tinta" : "text-[12.5px] text-tinta")}>
        {inteiro(no.leads)}
        {forte && no.fracao != null && <span className="ml-1 text-[11px] font-normal text-mute">{pct(no.fracao)}</span>}
      </div>
      <div className="text-right font-mono text-[12px] tabular-nums text-suave" title={no.gasto != null ? `Investido ${brl(no.gasto)}` : undefined}>
        {no.cpl != null ? brl(no.cpl) : no.gasto != null && no.leads === 0 ? <span className="text-amarelo">{brl(no.gasto)} · 0 leads</span> : ""}
      </div>
    </div>
  );
}

function No({ no, total, nivel }: { no: NoOrigem; total: number; nivel: number }) {
  const abrivel = no.filhos.length > 0;
  if (!abrivel) return <Linha no={no} total={total} nivel={nivel} resumo={false} />;
  // Balde e plataforma nascem abertos; campanha nasce fechada (o anuncio e detalhe).
  const aberto = no.nivel !== "campanha";
  return (
    <details open={aberto} className="group">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <Linha no={no} total={total} nivel={nivel} resumo />
      </summary>
      <div>
        {no.filhos.map((f) => (
          <No key={f.chave} no={f} total={total} nivel={nivel + 1} />
        ))}
      </div>
    </details>
  );
}

export function ArvoreOrigem({ arvore, total }: { arvore: NoOrigem[]; total: number }) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(90px,28%)_56px_84px] gap-x-3 border-b border-linha pb-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-mute">
        <span>Origem</span>
        <span>Parte do total</span>
        <span className="text-right">Leads</span>
        <span className="text-right">CPL</span>
      </div>
      <div className="[&_details[open]>summary_.seta-arvore]:rotate-90">
        {arvore.map((n, i) => (
          <div key={n.chave} className={cn(i > 0 && "mt-1 border-t border-linha pt-1")}>
            <No no={n} total={total} nivel={0} />
          </div>
        ))}
      </div>
    </div>
  );
}

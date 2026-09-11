import Link from "next/link";
import { cn } from "@/lib/utils";
import { rotuloFerramenta, type FerramentaUsada } from "@/lib/jarvis/contrato";
import { ListaDeAcoes, type ItemAcao } from "./lista-de-acoes";
import { MarcaJarvis } from "./marca";

/**
 * A RESPOSTA DO JARVIS EM BLOCOS (W-J, 10/09/2026 23:10). "Ele é o Sistema": a resposta não é
 * uma bolha de chat, é o mesmo desenho do "Jarvis diz" — a frase-resposta em 15px medium e,
 * abaixo, números e linhas com link para a tela onde a coisa se resolve. O arco entra só como
 * assinatura da resposta, na linha discreta de cima, com o que foi consultado ("consultou o
 * funil · 42 leads") — o rastro do "não inventa número".
 *
 * Blocos:
 *   texto    parágrafos curtos (a resposta livre do modelo, em produção)
 *   numeros  grade de rótulo → valor, cada um com link
 *   linhas   lista de frases, cada uma com link para a tela
 *   acoes    `ListaDeAcoes` com estado (vencidas = atenção, feitas riscadas…)
 */

export type BlocoResposta =
  | { tipo: "texto"; texto: string }
  | { tipo: "numeros"; itens: Array<{ rotulo: string; valor: string; href?: string | null; destino?: string | null }> }
  | { tipo: "linhas"; itens: Array<{ texto: string; href?: string | null; destino?: string | null }> }
  | { tipo: "acoes"; rotulo?: string | null; itens: ItemAcao[] };

export interface RespostaJarvis {
  frase: string | null;
  blocos: BlocoResposta[];
  consultas: FerramentaUsada[];
  /** ISO */
  em: string;
  erro?: string | null;
}

function horaCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
}

const LINK = "underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:underline";

/** Texto livre do modelo: parágrafos e listas "- " simples, sem markdown pesado. */
function Texto({ texto }: { texto: string }) {
  const partes = texto.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className="space-y-1.5 text-[13.5px] leading-normal text-foreground">
      {partes.map((p, i) => {
        const linhas = p.split("\n");
        if (linhas.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="ml-4 list-disc space-y-0.5">
              {linhas.map((l, j) => (
                <li key={j}>{l.replace(/^\s*[-•]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words">
            {p}
          </p>
        );
      })}
    </div>
  );
}

export function RespostaBlocos({ resposta: r, vivo = false, className }: { resposta: RespostaJarvis; vivo?: boolean; className?: string }) {
  return (
    <article className={cn("space-y-3", className)} aria-live="polite" aria-busy={vivo}>
      <header className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted-foreground">
        <MarcaJarvis tamanho={16} vivo={vivo} rotulo="Jarvis" className="text-foreground" />
        {r.consultas.length === 0 && !vivo && <span>{horaCurta(r.em)}</span>}
        {r.consultas.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>·</span>}
            <span>
              {rotuloFerramenta(c.nome)}
              {c.resumo && c.resumo !== "falhou" ? <span className="text-muted-foreground/80"> · {c.resumo}</span> : null}
            </span>
          </span>
        ))}
        {vivo && <span className="inline-flex items-center gap-1.5">{r.consultas.length > 0 && <span aria-hidden>·</span>}consultando…</span>}
      </header>

      {r.erro ? (
        <p className="text-[13.5px] leading-normal text-muted-foreground">{r.erro}</p>
      ) : (
        <>
          {r.frase && <p className="max-w-[64ch] text-[15px] font-medium leading-snug text-foreground">{r.frase}</p>}
          {r.blocos.map((b, i) => {
            if (b.tipo === "texto") return <Texto key={i} texto={b.texto} />;
            if (b.tipo === "numeros") {
              return (
                <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  {b.itens.map((n, j) => (
                    <div key={j} className="contents">
                      <dt className="text-right font-medium tabular-nums text-foreground">{n.valor}</dt>
                      <dd className="flex items-baseline gap-3 text-muted-foreground">
                        {n.href ? (
                          <Link href={n.href} className={cn("min-w-0 flex-1 text-foreground", LINK)}>
                            {n.rotulo}
                          </Link>
                        ) : (
                          <span className="min-w-0 flex-1 text-foreground">{n.rotulo}</span>
                        )}
                        {n.destino && n.href && (
                          <Link href={n.href} className={cn("shrink-0 text-[12px]", LINK)}>
                            {n.destino}
                          </Link>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              );
            }
            if (b.tipo === "linhas") {
              return (
                <ul key={i} className="space-y-1.5">
                  {b.itens.map((l, j) => (
                    <li key={j} className="flex items-baseline gap-3 text-[13px] leading-normal">
                      {l.href ? (
                        <Link href={l.href} className={cn("min-w-0 flex-1 text-foreground", LINK)}>
                          {l.texto}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 text-foreground">{l.texto}</span>
                      )}
                      {l.destino && l.href && (
                        <Link href={l.href} className={cn("shrink-0 text-[12px] text-muted-foreground", LINK)}>
                          {l.destino}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <div key={i}>
                {b.rotulo && <p className="mb-1 text-[12px] text-muted-foreground">{b.rotulo}</p>}
                <ListaDeAcoes itens={b.itens} rotulo={b.rotulo ?? undefined} />
              </div>
            );
          })}
        </>
      )}
    </article>
  );
}

"use client";

import Link from "next/link";
import { LayoutGroup, motion } from "motion/react";
import { ArrowUpRightIcon, FilterIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { rotuloFerramenta } from "@/lib/jarvis/contrato";
import type { AcaoResposta, BlocoResposta, PassoJarvis, RespostaJarvis } from "@/lib/jarvis/resposta-tipos";
import { ListaDeAcoes } from "./lista-de-acoes";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";
import { PassosJarvis } from "./passos";

export type { AcaoResposta, BlocoResposta, PassoJarvis, RespostaJarvis };

/**
 * A RESPOSTA DO JARVIS EM BLOCOS — v5 (W-JX, 11/09/2026: "preciso que ele mostre presença").
 *
 * "Ele é o Sistema": a resposta não é bolha de chat, é o desenho do "Jarvis diz" — a frase em 15px
 * medium e, abaixo, números e linhas com link para a tela onde a coisa se resolve. O arco entra só
 * como assinatura, na linha de cima, com o que foi consultado — o rastro do "não inventa número".
 *
 * O MESMO componente serve as três superfícies: o overlay ⌘J (sobre qualquer tela), a página
 * `/jarvis` (tela cheia) e o painel lateral. Quem muda é a moldura, nunca a linguagem.
 *
 * v5 acrescenta duas camadas, as duas de PRESENÇA:
 *   PASSOS — o trabalho aparecendo enquanto acontece, e depois colapsado em "como cheguei aqui";
 *   AÇÕES  — o que dá para fazer com a resposta SEM SAIR DA TELA (criar tarefa, abrir a conversa,
 *            filtrar a tela em que a pessoa já está). `onAcao` decide o que acontece; sem ele, só
 *            as de `abrir` aparecem, como link.
 *
 * Os tipos moraram aqui até a v4 e agora moram em `lib/jarvis/resposta-tipos.ts` (o motor e a
 * fixture precisavam deles sem importar componente). Este arquivo REEXPORTA todos: quem importava
 * `RespostaJarvis` daqui não muda uma linha.
 */

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

const ICONE_ACAO = { abrir: ArrowUpRightIcon, criar_tarefa: PlusIcon, filtrar: FilterIcon } as const;

/**
 * O rodapé de ações. Botões discretos, hairline, 12,5px — não é barra de CTA; é o que a resposta
 * permite fazer daqui mesmo, sem navegar.
 */
export function AcoesDaResposta({ acoes, onAcao, className }: { acoes: AcaoResposta[]; onAcao?: (a: AcaoResposta) => void; className?: string }) {
  const uteis = onAcao ? acoes : acoes.filter((a) => a.tipo === "abrir" && a.href);
  if (uteis.length === 0) return null;
  const estilo =
    "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-[12.5px] text-foreground transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3", className)}>
      {uteis.map((a) => {
        const Icone = ICONE_ACAO[a.tipo];
        const conteudo = (
          <>
            <Icone className="size-3.5 text-muted-foreground" aria-hidden />
            {a.rotulo}
          </>
        );
        if (!onAcao && a.href) {
          return (
            <Link key={a.id} href={a.href} className={estilo}>
              {conteudo}
            </Link>
          );
        }
        return (
          <button key={a.id} type="button" onClick={() => onAcao?.(a)} title={a.detalhe ?? undefined} className={estilo}>
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}

export function RespostaBlocos({
  resposta: r,
  vivo = false,
  className,
  onAcao,
}: {
  resposta: RespostaJarvis;
  vivo?: boolean;
  className?: string;
  /** o que fazer com "criar tarefa" / "filtrar esta tela" — sem isto, só as de abrir aparecem */
  onAcao?: (a: AcaoResposta) => void;
}) {
  const mov = useMovimento();
  const passos = r.passos ?? [];

  return (
    <LayoutGroup>
      <motion.article key={r.em} variants={mov.lista} initial="hidden" animate="visible" className={cn("space-y-3", className)} aria-live="polite" aria-busy={vivo}>
        <motion.header variants={mov.item} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted-foreground">
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
        </motion.header>

        {/* o trabalho: à vista enquanto pensa, colapsado em "como cheguei aqui" depois */}
        {passos.length > 0 && (
          <motion.div variants={mov.item}>
            <PassosJarvis passos={passos} vivo={vivo} em={r.em} />
          </motion.div>
        )}

        {r.erro ? (
          <motion.p variants={mov.item} className="text-[13.5px] leading-normal text-muted-foreground">
            {r.erro}
          </motion.p>
        ) : (
          <>
            {r.frase && <motion.p variants={mov.item} className="max-w-[64ch] text-[15px] font-medium leading-snug text-foreground">{r.frase}</motion.p>}
            {r.blocos.map((b, i) => {
              if (b.tipo === "texto") return <motion.div key={i} variants={mov.item}><Texto texto={b.texto} /></motion.div>;
              if (b.tipo === "numeros") {
                return (
                  <motion.dl key={i} variants={mov.item} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[13px]">
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
                  </motion.dl>
                );
              }
              if (b.tipo === "linhas") {
                return (
                  <motion.ul key={i} variants={mov.item} className="space-y-1.5 border-t border-border/60 pt-3">
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
                  </motion.ul>
                );
              }
              return (
                <motion.div key={i} variants={mov.item} className="border-t border-border/60 pt-3">
                  {b.rotulo && <p className="mb-1 text-[12px] text-muted-foreground">{b.rotulo}</p>}
                  <ListaDeAcoes itens={b.itens} rotulo={b.rotulo ?? undefined} />
                </motion.div>
              );
            })}
            {r.acoes && r.acoes.length > 0 && !vivo && (
              <motion.div variants={mov.item}>
                <AcoesDaResposta acoes={r.acoes} onAcao={onAcao} />
              </motion.div>
            )}
          </>
        )}
      </motion.article>
    </LayoutGroup>
  );
}

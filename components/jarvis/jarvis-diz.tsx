"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { MarcaJarvis } from "./marca";
import { ListaDeAcoes, type EstadoAcao, type ItemAcao } from "./lista-de-acoes";
import { useMovimento } from "./movimento";

/**
 * "JARVIS DIZ" — o bloco do dashboard, v4 (W-J, 10/09/2026 23:35; "gostei muito, ainda falta
 * alguma coisa — evitaria o layout shift em todos os toggles").
 *
 *   ◠                                                   olhou às 23:02   (11px, à direita)
 *   A frase do dia                                                        (15px medium)
 *   ── hairline
 *   ◔ observação com estado e link                                        (ListaDeAcoes)
 *   ◔ …                                          ver mais ↓ / fechar      (expand animado)
 *   ── hairline
 *   Pergunte                                                              (links)
 *
 * As observações são itens da `ListaDeAcoes` — com ícone de estado (o que já se resolveu vem
 * riscado), href para a tela e o destino como selo em texto muted. Só as 3 primeiras ficam à
 * mostra; "ver mais" abre o resto e as `acoes` com `height: auto` animado — zero pulo de layout.
 * `prefers-reduced-motion` respeitado por `useMovimento`. Só tokens semânticos.
 *
 * Client component (usa estado e motion). `hrefPergunta` é opcional; quem chama de um server
 * component NÃO deve passar função — use o padrão (`/jarvis?pergunta=`).
 */

export interface ObservacaoJarvis {
  id?: string;
  texto: string;
  href: string;
  /** "conversas", "funil", "tarefas" — vira o selo à direita */
  destino: string;
  /** nome da ferramenta do contrato (consultar_funil…) — no title do link */
  origem?: string | null;
  /** AGORA/HOJE/NA SEMANA — vira estado se `estado` não vier */
  faixa?: "AGORA" | "HOJE" | "NA SEMANA" | null;
  /** o que já se resolveu vem `feito` (riscado) */
  estado?: EstadoAcao;
}

export interface JarvisDizProps {
  frase: string | null;
  observacoes: ObservacaoJarvis[];
  perguntas: string[];
  geradoEm: string | null;
  hrefPergunta?: (pergunta: string) => string;
  /** itens extras (ex.: "Precisa de atenção") — ficam atrás do "ver mais" junto com as observações além da 3ª */
  acoes?: ItemAcao[];
  rotuloAcoes?: string;
  /** quantas observações ficam à mostra antes do "ver mais" (padrão 3) */
  visiveis?: number;
  className?: string;
  /** aceita e IGNORADA — a marca está travada no arco */
  marca?: string;
}

function horaCurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
}

function estadoDe(o: ObservacaoJarvis): EstadoAcao {
  if (o.estado) return o.estado;
  if (o.faixa === "AGORA") return "atencao";
  if (o.faixa === "HOJE") return "andamento";
  return "pendente";
}

function itemDe(o: ObservacaoJarvis, i: number): ItemAcao {
  return { id: o.id ?? `obs-${i}`, titulo: o.texto, estado: estadoDe(o), href: o.href, badge: o.destino };
}

const LINK = "underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:underline";

export function JarvisDiz({ frase, observacoes, perguntas, geradoEm, hrefPergunta, acoes, rotuloAcoes, visiveis = 3, className }: JarvisDizProps) {
  const mov = useMovimento();
  const [aberto, setAberto] = useState(false);
  const hora = horaCurta(geradoEm);
  const href = hrefPergunta ?? ((q: string) => `/jarvis?contexto=${encodeURIComponent("/")}&pergunta=${encodeURIComponent(q)}`);

  const itens = observacoes.map(itemDe);
  const aVista = itens.slice(0, visiveis);
  const escondidos = itens.slice(visiveis);
  const extras = acoes ?? [];
  const temMais = escondidos.length > 0 || extras.length > 0;
  const vazio = !frase && itens.length === 0 && extras.length === 0;

  return (
    <LayoutGroup>
      <motion.section layout transition={mov.layout} className={cn("rounded-md border border-border/60 bg-muted/30 px-4 py-3", className)} aria-labelledby="jarvis-diz-titulo">
        <header className="flex items-center gap-1.5">
          <MarcaJarvis tamanho={16} rotulo="Jarvis" className="text-foreground" />
          <h2 id="jarvis-diz-titulo" className="sr-only">
            Jarvis diz
          </h2>
          <span className="ml-auto text-[11px] text-muted-foreground">{hora ? `olhou às ${hora}` : "ainda não olhou hoje"}</span>
        </header>

        {vazio ? (
          <p className="mt-2 text-[13.5px] leading-normal text-muted-foreground">Nada a apontar por enquanto. A próxima passada é em poucos minutos.</p>
        ) : (
          <>
            {frase && <p className="mt-2 max-w-[64ch] text-[15px] font-medium leading-snug text-foreground">{frase}</p>}

            {(aVista.length > 0 || temMais) && (
              <div className={cn(frase && "mt-3 border-t border-border/60 pt-2.5")}>
                {aVista.length > 0 && <ListaDeAcoes itens={aVista} rotulo="Observações" />}

                <AnimatePresence initial={false}>
                  {aberto && temMais && (
                    <motion.div key="mais" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
                      {escondidos.length > 0 && <ListaDeAcoes itens={escondidos} rotulo="Mais observações" />}
                      {extras.length > 0 && (
                        <div className={cn((aVista.length > 0 || escondidos.length > 0) && "mt-2.5 border-t border-border/60 pt-2.5")}>
                          {rotuloAcoes && <p className="mb-1 text-[12px] text-muted-foreground">{rotuloAcoes}</p>}
                          <ListaDeAcoes itens={extras} rotulo={rotuloAcoes} />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {temMais && (
                  <button
                    type="button"
                    onClick={() => setAberto((v) => !v)}
                    aria-expanded={aberto}
                    className={cn("mt-1.5 text-[12px] text-muted-foreground hover:text-foreground", LINK)}
                  >
                    {aberto ? "fechar" : `ver mais${escondidos.length + extras.length > 0 ? ` (${escondidos.length + extras.length})` : ""}`}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {perguntas.length > 0 && (
          <footer className="mt-3 border-t border-border/60 pt-2.5 text-[12.5px] text-muted-foreground">
            <p>Pergunte</p>
            <ul className="mt-1 space-y-0.5">
              {perguntas.slice(0, 3).map((q) => (
                <li key={q}>
                  <Link href={href(q)} className={cn("text-foreground", LINK)}>
                    {q}
                  </Link>
                </li>
              ))}
            </ul>
          </footer>
        )}
      </motion.section>
    </LayoutGroup>
  );
}

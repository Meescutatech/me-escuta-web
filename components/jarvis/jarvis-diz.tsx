import Link from "next/link";
import { cn } from "@/lib/utils";
import { rotuloFerramenta } from "@/lib/jarvis/contrato";
import { MarcaJarvis } from "./marca";
import { ListaDeAcoes, type ItemAcao } from "./lista-de-acoes";

/**
 * "JARVIS DIZ" — o bloco do dashboard, dieta final (W-J, 10/09/2026 22:40).
 *
 * O que o Jarvis viu hoje e onde clicar, em tipo — sem chip, sem pastilha colorida. O arco é a
 * assinatura; o nome não se repete ao lado dele:
 *   1. cabeçalho discreto: arco + "olhou às 22:26" (12px, muted, uma linha);
 *   2. a frase do dia (15px, medium) — lida em 3 segundos;
 *   3. até três observações; cada uma é um link para a tela certa, com o destino em texto
 *      muted à direita e, no hover, a consulta de origem ("consultou o funil");
 *   4. três perguntas prontas, como links de texto, que abrem o /jarvis com o contexto.
 * Sem observação e sem frase o bloco diz que ainda não olhou, com a hora — não some.
 */

export interface ObservacaoJarvis {
  texto: string;
  href: string;
  /** "conversas", "funil", "tarefas" */
  destino: string;
  /** nome da ferramenta do contrato (consultar_funil…) */
  origem?: string | null;
  faixa?: "AGORA" | "HOJE" | "NA SEMANA" | null;
}

export interface JarvisDizProps {
  frase: string | null;
  observacoes: ObservacaoJarvis[];
  perguntas: string[];
  geradoEm: string | null;
  hrefPergunta?: (pergunta: string) => string;
  /** expandido: as observações viram itens com estado (feito / em andamento / pendente / atenção) */
  acoes?: ItemAcao[];
  rotuloAcoes?: string;
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

const LINK = "underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:underline";

export function JarvisDiz({ frase, observacoes, perguntas, geradoEm, hrefPergunta, acoes, rotuloAcoes, className }: JarvisDizProps) {
  const hora = horaCurta(geradoEm);
  const href = hrefPergunta ?? ((q: string) => `/jarvis?contexto=${encodeURIComponent("/")}&pergunta=${encodeURIComponent(q)}`);
  const vazio = !frase && observacoes.length === 0 && !(acoes && acoes.length > 0);

  return (
    <section className={cn("rounded-md border border-border/60 bg-muted/30 px-4 py-3", className)} aria-labelledby="jarvis-diz-titulo">
      <header className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <MarcaJarvis tamanho={16} rotulo="Jarvis" className="text-foreground" />
        <h2 id="jarvis-diz-titulo" className="font-normal">
          {hora ? `olhou às ${hora}` : "ainda não olhou hoje"}
        </h2>
      </header>

      {vazio ? (
        <p className="mt-2 text-[13px] leading-normal text-muted-foreground">Nada a apontar por enquanto. A próxima passada é em poucos minutos.</p>
      ) : (
        <>
          {frase && <p className="mt-2 max-w-[64ch] text-[15px] font-medium leading-snug text-foreground">{frase}</p>}
          {observacoes.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {observacoes.slice(0, 3).map((o, i) => (
                <li key={i} className="group flex items-baseline gap-3 text-[13px] leading-normal">
                  <Link href={o.href} className={cn("min-w-0 flex-1 text-foreground", LINK)} title={o.origem ? rotuloFerramenta(o.origem) : undefined}>
                    {o.texto}
                  </Link>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {o.origem && <span className="hidden group-hover:inline">{rotuloFerramenta(o.origem)} · </span>}
                    <Link href={o.href} className={LINK}>
                      {o.destino}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {acoes && acoes.length > 0 && (
            <div className={cn(observacoes.length > 0 || frase ? "mt-3 border-t border-border/60 pt-2.5" : "mt-2")}>
              {rotuloAcoes && <p className="mb-1 text-[12px] text-muted-foreground">{rotuloAcoes}</p>}
              <ListaDeAcoes itens={acoes} rotulo={rotuloAcoes} />
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
    </section>
  );
}

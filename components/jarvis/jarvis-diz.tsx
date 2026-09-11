import Link from "next/link";
import { cn } from "@/lib/utils";
import { rotuloFerramenta } from "@/lib/jarvis/contrato";
import { MarcaJarvis } from "./marca";

/**
 * "JARVIS DIZ" — o bloco do dashboard (W-J, 10/09/2026).
 *
 * Não é KPI e não é gráfico: é o que o Jarvis VIU hoje e onde clicar. Três partes, nesta ordem:
 *   1. a frase do dia — uma sentença, em peso de título, que a dona do processo lê em 3 segundos;
 *   2. até três observações, cada uma com o link para a tela certa (a conversa parada, o lead no
 *      funil, a tarefa vencida) e o chip da consulta de origem ("consultou o funil") — o mesmo
 *      rastro do "não inventa número" do chat, aqui em miniatura;
 *   3. três perguntas prontas, que abrem o `/jarvis` com o contexto do dashboard.
 *
 * O que fica FORA, de propósito: resumo automático cravado que não se dispensa (Front), custo em
 * créditos na cara de quem opera (Attio/HubSpot). Sem observação e sem frase o bloco não some —
 * ele diz que ainda não olhou hoje, com hora da última passada.
 */

export interface ObservacaoJarvis {
  texto: string;
  /** para onde o clique leva — /conversas?…, /funil?…, /tarefas?… */
  href: string;
  /** rótulo curto do destino: "conversas", "funil", "tarefas" */
  destino: string;
  /** ferramenta que originou (nome do contrato: consultar_funil…) */
  origem?: string | null;
  /** AGORA/HOJE/NA SEMANA — pinta o ponto da linha */
  faixa?: "AGORA" | "HOJE" | "NA SEMANA" | null;
}

export interface JarvisDizProps {
  frase: string | null;
  observacoes: ObservacaoJarvis[];
  perguntas: string[];
  /** ISO da última passada do Jarvis */
  geradoEm: string | null;
  /** monta o href de uma pergunta sugerida; padrão abre /jarvis com contexto do dashboard */
  hrefPergunta?: (pergunta: string) => string;
  className?: string;
}

const PONTO: Record<NonNullable<ObservacaoJarvis["faixa"]>, string> = {
  AGORA: "bg-vermelho",
  HOJE: "bg-amarelo-barra",
  "NA SEMANA": "bg-azul-graf",
};

function horaCurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
}

export function JarvisDiz({ frase, observacoes, perguntas, geradoEm, hrefPergunta, className }: JarvisDizProps) {
  const hora = horaCurta(geradoEm);
  const href = hrefPergunta ?? ((q: string) => `/jarvis?contexto=${encodeURIComponent("/")}&pergunta=${encodeURIComponent(q)}`);
  const vazio = !frase && observacoes.length === 0;

  return (
    <section className={cn("rounded-[11px] border border-linha bg-branco px-5 py-4", className)} aria-labelledby="jarvis-diz-titulo">
      <header className="flex items-center gap-2.5">
        <MarcaJarvis tamanho={32} rotulo="Jarvis" />
        <h2 id="jarvis-diz-titulo" className="text-[15px] font-[650] leading-none tracking-[-0.01em] text-navy">
          Jarvis diz
        </h2>
        <span className="ml-auto text-[11.5px] text-suave">{hora ? `olhou às ${hora}` : "ainda não olhou hoje"}</span>
      </header>

      {vazio ? (
        <p className="mt-3 text-[13.5px] leading-relaxed text-suave">
          Nada a apontar por enquanto. A próxima passada é em poucos minutos; se quiser, pergunte algo abaixo.
        </p>
      ) : (
        <>
          {frase && <p className="mt-3 max-w-[62ch] text-[16px] font-[650] leading-snug tracking-[-0.01em] text-tinta">{frase}</p>}

          {observacoes.length > 0 && (
            <ul className="mt-3 divide-y divide-linha">
              {observacoes.slice(0, 3).map((o, i) => (
                <li key={i} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                  <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", o.faixa ? PONTO[o.faixa] : "bg-linha-forte")} />
                  <Link href={o.href} className="min-w-0 flex-1 text-[13.5px] leading-normal text-tinta underline-offset-2 hover:underline">
                    {o.texto}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {o.origem && <span className="hidden text-[11px] text-mute sm:inline">{rotuloFerramenta(o.origem)}</span>}
                    <Link href={o.href} className="rounded-full border border-linha px-2 py-px text-[11.5px] font-medium text-navy hover:bg-hover">
                      {o.destino}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {perguntas.length > 0 && (
        <footer className="mt-4 border-t border-linha pt-3">
          <p className="mb-2 text-[11.5px] font-semibold text-mute">Pergunte ao Jarvis</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Perguntas sugeridas">
            {perguntas.slice(0, 3).map((q) => (
              <li key={q}>
                <Link
                  href={href(q)}
                  className="inline-block rounded-full border border-linha bg-branco px-3 py-1 text-[12.5px] text-suave transition-colors hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
                >
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

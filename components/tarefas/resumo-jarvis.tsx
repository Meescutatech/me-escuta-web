"use client";

import { MarcaJarvis } from "@/components/jarvis/marca";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { horaSP, type ResumoJarvis } from "@/lib/tarefas/resumo";
import { cn } from "@/lib/utils";

/*
 * O RESUMO DO JARVIS — o primeiro bloco quando a tarefa se abre, e o texto grande do foco
 * (W-T, 10/09 noite; proposta em pesquisa/TAREFAS-MODO-FOCO-E-RESUMO-DO-JARVIS-2026-09-10.md §3b).
 *
 * Três frases, na ordem em que a Sara pensa: onde o lead está → o que ele disse → o que fazer e
 * por que agora. O arco (a assinatura do W-J) abre o bloco; o nome "Jarvis" não se repete. A
 * situação vai em tinta (é o fato), o que ele viu em suave com o trecho em itálico e "ver no
 * fio", a sugestão em tinta de novo. Embaixo, à direita, "resumiu às 23:18" em 11px — o mesmo
 * lugar do "olhou às" do Jarvis diz.
 *
 * Tarefa de HUMANO: o arco continua (o Jarvis é o Sistema e resumiu o contexto), mas a terceira
 * frase começa com quem pediu ("Sara pediu: …") — o resumo nunca finge que a ideia foi dele.
 *
 * Sem resumo gravado (leitura real hoje): o bloco não aparece; a linha continua mostrando o
 * porquê e o trecho como antes. Não se inventa resumo na tela.
 */

export function ResumoJarvisBloco({
  resumo,
  t,
  onVerNoFio,
  tamanho = "linha",
  caixa = false,
  className,
}: {
  resumo: ResumoJarvis;
  t: Pick<TarefaVisao, "trecho" | "por_que" | "origem">;
  onVerNoFio?: () => void;
  /** `linha` = 13px dentro da lista · `foco` = 14/15px no painel do modo foco */
  tamanho?: "linha" | "foco";
  /** com fundo e hairline (fora da lista) */
  caixa?: boolean;
  className?: string;
}) {
  const foco = tamanho === "foco";
  const texto = foco ? "text-[14px] leading-[1.5]" : "text-[13px] leading-snug";
  const trecho = t.trecho;
  return (
    <div
      className={cn(
        "flex gap-2.5",
        caixa && "rounded-md border border-border/60 bg-muted/30 px-3.5 py-3",
        className,
      )}
      aria-label="Resumo do Jarvis"
    >
      <MarcaJarvis tamanho={foco ? 20 : 16} rotulo="Resumo do Jarvis" className={cn("shrink-0 text-mute", foco ? "mt-[3px]" : "mt-px")} />
      {/* medida de leitura: na lista a linha tem 1.500px e o resumo é PROSA — 76ch é o que separa
          ler de varrer. A assinatura alinha pelo fim da medida, não pelo fim da linha (era o que
          a jogava a 1.200px do texto). */}
      <div className={cn("min-w-0 max-w-[76ch] flex-1", texto)}>
        <p className="text-tinta">{resumo.situacao}</p>
        {(resumo.visto || trecho) && (
          <p className="mt-1 text-suave">
            {resumo.visto && <span>{resumo.visto} </span>}
            {trecho && (
              <>
                <q className="italic">{trecho}</q>
                {onVerNoFio && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVerNoFio();
                      }}
                      className="text-[0.92em] text-mute underline-offset-[3px] hover:text-tinta hover:underline"
                    >
                      ver no fio
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        )}
        <p className={cn("mt-1 text-tinta", foco && "font-medium")}>{resumo.sugestao}</p>
        <p className={cn("mt-1.5 text-right text-mute", foco ? "text-[12px]" : "text-[11px]")}>
          {resumo.humano ? "contexto resumido" : "resumiu"} às {horaSP(resumo.gerado_em)}
        </p>
      </div>
    </div>
  );
}

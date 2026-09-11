import Link from "next/link";
import { MarcaJarvis } from "@/components/jarvis/marca";
import type { JarvisDiz } from "@/lib/dados/dashboard-dono-calculos";
import { hrefPergunta } from "@/lib/dados/dashboard-dono-calculos";

/**
 * "Jarvis diz" como UMA linha fina abaixo da toolbar: a marca (arco), a frase do dia, e "ver mais"
 * que expande as observações e as perguntas. Sem card, sem prosa flutuando — é um `<details>`
 * nativo, fechado por padrão, que não pede JS.
 */
export function JarvisLinha({ jarvis }: { jarvis: JarvisDiz }) {
  const hora = jarvis.geradoEm ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(jarvis.geradoEm)) : null;
  return (
    <details className="group border-b border-border py-1.5 text-[12.5px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <MarcaJarvis tamanho={16} rotulo="Jarvis" className="shrink-0 text-foreground" />
        <span className="min-w-0 flex-1 truncate text-foreground">{jarvis.frase ?? "O Jarvis ainda não escreveu o resumo de hoje."}</span>
        {hora ? <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{hora}</span> : null}
        <span className="shrink-0 text-[11.5px] text-muted-foreground underline underline-offset-2 group-open:hidden">ver mais</span>
        <span className="hidden shrink-0 text-[11.5px] text-muted-foreground underline underline-offset-2 group-open:inline">fechar</span>
      </summary>
      <div className="mt-2 grid gap-x-8 gap-y-1 pl-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <ul className="flex flex-col gap-1">
          {jarvis.observacoes.map((o, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[12.5px] text-foreground">
              <Link href={o.href} className="underline-offset-2 hover:underline">
                {o.texto}
              </Link>
              <span className="text-[11px] text-muted-foreground">{o.destino}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1 text-[12px]">
          {jarvis.perguntas.map((p) => (
            <li key={p}>
              <Link href={hrefPergunta(p)} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {p}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

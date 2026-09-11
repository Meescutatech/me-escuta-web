import { cn } from "@/lib/utils";

/**
 * A MARCA DO JARVIS — o ARCO (escolhido pelo Diogo em 10/09/2026, 22:40: "gostei muito desse
 * conceito, deixa ele bem minimalista, clean — ele é o Sistema").
 *
 * Um ponto e um arco fino por cima dele: uma forma só, escuta/atenção — o Jarvis nota algo e
 * avisa. Monocromática em `currentColor` (vale na sidebar, no header, sobre navy), traço 1,5; o
 * laranja entra SÓ no estado `vivo` (consultando/pensando), no ponto, pulsando —
 * `pulso-ao-vivo` de globals.css respeita `prefers-reduced-motion`.
 *
 * O arco É a assinatura: onde ele aparece, o nome "Jarvis" não se repete. O nome em texto só
 * entra onde não há glifo (`NomeJarvis`). Substitui o brilho de quatro pontas de
 * `components/header/icone-jarvis.tsx` e o `SparklesIcon` da seção Agentes.
 *
 * Grade 24×24. Tamanhos 16 / 20 / 32. `rotulo` dá `role="img"`; sem ele a marca é decorativa.
 */

export type TamanhoMarca = 16 | 20 | 32;

export function MarcaJarvis({
  tamanho = 20,
  vivo = false,
  rotulo,
  className,
}: {
  tamanho?: TamanhoMarca;
  /** o Jarvis está consultando/pensando */
  vivo?: boolean;
  /** rótulo acessível; sem ele a marca é decorativa */
  rotulo?: string;
  className?: string;
  /** aceita e IGNORADA — a marca está travada no arco (escolha do Diogo, 22:40) */
  variante?: string;
}) {
  const a11y = rotulo ? { role: "img" as const, "aria-label": rotulo } : { "aria-hidden": true as const };
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={tamanho <= 16 ? 1.75 : 1.5}
      strokeLinecap="round"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      <path d="M4.64 9.64A9 9 0 0 1 20 16" />
      <circle cx="11" cy="16" r={tamanho <= 16 ? 2.4 : 2.1} fill="currentColor" stroke="none" className={cn(vivo && "fill-primary pulso-ao-vivo")} />
    </svg>
  );
}

/** O nome em texto, para onde NÃO há glifo (ex.: uma frase corrida, um tooltip). */
export function NomeJarvis({ className }: { className?: string }) {
  return <span className={cn("font-medium text-foreground", className)}>Jarvis</span>;
}

/**
 * Assinatura inline para cabeçalhos: o arco + um sufixo discreto ("propõe", "sugere uma tarefa").
 * Pela dieta do Diogo, NÃO escreve "Jarvis" — o arco já é a assinatura. Mantida porque o W-D5 já
 * a monta em `components/tarefas/proposta-tarefa.tsx`.
 */
export function AssinaturaJarvis({
  tamanho = 16,
  vivo = false,
  sufixo,
  className,
}: {
  tamanho?: TamanhoMarca;
  vivo?: boolean;
  sufixo?: string;
  className?: string;
  /** aceita e IGNORADA */
  variante?: string;
}) {
  const fonte = tamanho >= 32 ? "text-[14px]" : tamanho === 20 ? "text-[13px]" : "text-[12px]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", fonte, className)}>
      <MarcaJarvis tamanho={tamanho} vivo={vivo} rotulo="Jarvis" className="text-foreground" />
      {sufixo && <span>{sufixo}</span>}
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * A MARCA DO JARVIS — v2 (W-J, 10/09/2026, depois da reprovação do roundel navy às 22:30).
 *
 * Régua do Diogo: tem de ficar MELHOR que o sparkles genérico. Monocromática no `foreground`
 * (herda `currentColor`, então vale na sidebar, no header e sobre navy), traço fino, o laranja só
 * como acento do estado `vivo` (consultando/pensando). Nada de roundel, avatar com letra ou navy
 * chapado. Três variantes, para escolher na galeria `/jarvis/galeria`:
 *
 *   `arco`    (a) glifo próprio: um ponto e um arco fino por cima dele — uma forma só. É a ideia
 *             de escuta/atenção (o Jarvis nota algo e avisa), não de robô. Em `vivo` o ponto
 *             fica laranja e pulsa.
 *   `faisca`  (b) o sparkles reinterpretado: UMA faísca — a cabeça no alto à direita e um raio só
 *             que afina para baixo e à esquerda. Assimétrica, cheia (em
 *             traço virava agulha). Sem o brilho de quatro pontas. Em `vivo` fica laranja.
 *   `palavra` (c) wordmark "jarvis" em mono semibold 11–12px, minúsculo, com um ponto de estado
 *             antes — para uso inline (assinatura de nota, chip, cabeçalho de card). O ponto é
 *             `muted-foreground`; em `vivo`, laranja e pulsando.
 *
 * Grade 24×24 nas duas de traço. Tamanhos 16 / 20 / 32. `rotulo` dá `role="img"`; sem ele a
 * marca é decorativa. `pulso-ao-vivo` (globals.css) respeita `prefers-reduced-motion`.
 */

export type TamanhoMarca = 16 | 20 | 32;
export type VarianteMarca = "arco" | "faisca" | "palavra";

export function MarcaJarvis({
  variante = "arco",
  tamanho = 20,
  vivo = false,
  rotulo,
  className,
}: {
  variante?: VarianteMarca;
  tamanho?: TamanhoMarca;
  /** o Jarvis está consultando/pensando */
  vivo?: boolean;
  /** rótulo acessível; sem ele a marca é decorativa */
  rotulo?: string;
  className?: string;
}) {
  const a11y = rotulo ? { role: "img" as const, "aria-label": rotulo } : { "aria-hidden": true as const };

  if (variante === "palavra") {
    const fonte = tamanho >= 32 ? "text-[13px]" : tamanho === 20 ? "text-[12px]" : "text-[11px]";
    return (
      <span className={cn("inline-flex items-center gap-1.5 font-mono font-semibold leading-none tracking-[-0.01em] text-foreground", fonte, className)} {...a11y}>
        <span
          aria-hidden
          className={cn("inline-block rounded-full", tamanho >= 32 ? "h-[7px] w-[7px]" : "h-1.5 w-1.5", vivo ? "bg-primary pulso-ao-vivo" : "bg-muted-foreground")}
        />
        jarvis
      </span>
    );
  }

  const traco = tamanho <= 16 ? 1.75 : 1.5;

  if (variante === "faisca") {
    // Uma faísca: a cabeça (ponto cheio) no alto à direita e UM raio que afina para baixo e à
    // esquerda. Cheia, não em traço — em traço virava agulha/pena (medido na galeria v2a).
    return (
      <svg
        viewBox="0 0 24 24"
        width={tamanho}
        height={tamanho}
        fill="currentColor"
        className={cn("shrink-0", vivo && "text-primary pulso-ao-vivo", className)}
        {...a11y}
      >
        <circle cx="16.5" cy="7.5" r={tamanho <= 16 ? 2.9 : 2.6} />
        <path d="M4.5 19.5L17.7 8.9 15.1 6.3Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      <path d="M4.64 9.64A9 9 0 0 1 20 16" />
      <circle cx="11" cy="16" r={tamanho <= 16 ? 2.4 : 2.1} fill="currentColor" stroke="none" className={cn(vivo && "fill-primary pulso-ao-vivo")} />
    </svg>
  );
}

/**
 * Assinatura inline: a marca escolhida + "Jarvis" em texto, para cabeçalhos de nota e de card.
 * Com `variante="palavra"` a própria marca já é o nome — não duplica.
 */
export function AssinaturaJarvis({
  variante = "arco",
  tamanho = 16,
  vivo = false,
  sufixo,
  className,
}: {
  variante?: VarianteMarca;
  tamanho?: TamanhoMarca;
  vivo?: boolean;
  /** "sugere uma tarefa", "diz", "criou tarefa" */
  sufixo?: string;
  className?: string;
}) {
  const fonte = tamanho >= 32 ? "text-[14px]" : tamanho === 20 ? "text-[13px]" : "text-[12px]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", fonte, className)}>
      <MarcaJarvis variante={variante} tamanho={tamanho} vivo={vivo} className={variante === "palavra" ? undefined : "text-foreground"} />
      {variante !== "palavra" && <span className="font-medium text-foreground">Jarvis</span>}
      {sufixo && <span>{sufixo}</span>}
    </span>
  );
}

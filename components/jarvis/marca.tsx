import { cn } from "@/lib/utils";

/**
 * A MARCA DO JARVIS (W-J, 10/09/2026) — um desenho só, para todo lugar em que o Jarvis aparece.
 *
 * O problema que ela resolve: "IA" estava com o mesmo brilho de quatro pontas em três lugares
 * (sidebar, header, seção Agentes das configurações) — e o brilho é o ícone genérico de IA de
 * qualquer produto. O Jarvis não é "a IA": é um agente com nome, que MONITORA a operação e
 * chama a atenção de alguém. A marca diz isso em duas formas:
 *
 *   • o monograma J — a mesma letra que o Diogo já usava como avatar no chat `/jarvis` e no
 *     registro "Jarvis criou tarefa" do fio. Não é sparkle, não é robô, não é balão.
 *   • o ponto de atenção — um ponto laranja na borda superior direita. Laranja é o único acento
 *     de ação do sistema (R9), e é exatamente o que o Jarvis faz: aponta onde agir. Quando o
 *     Jarvis está pensando/consultando, o ponto pulsa (`vivo`), com `prefers-reduced-motion`
 *     respeitado pela classe `pulso-ao-vivo` de globals.css.
 *
 * Duas variantes, mesma grade 24×24:
 *   `selo`  — roundel navy com o J em branco. É o AVATAR: fio da conversa, chat, cards, dashboard.
 *   `traco` — J em traço, `currentColor`, stroke 1.8 como os outros ícones da sidebar/header.
 *             Aqui o ponto também é currentColor: na navegação nada é colorido além do ativo.
 *
 * Tamanhos: 16 (inline em texto/chip), 20 (header, linha de card), 32 (cabeçalho de bloco).
 * A Clara e os outros agentes NÃO usam esta marca — cada um terá a sua; o que se compartilha é a
 * regra (letra + ponto), não o desenho.
 */

export type TamanhoMarca = 16 | 20 | 32;
export type VarianteMarca = "selo" | "traco";

export function MarcaJarvis({
  tamanho = 20,
  variante = "selo",
  vivo = false,
  rotulo,
  className,
}: {
  tamanho?: TamanhoMarca;
  variante?: VarianteMarca;
  /** o Jarvis está consultando/pensando: o ponto pulsa */
  vivo?: boolean;
  /** rótulo acessível; sem ele a marca é decorativa (`aria-hidden`) */
  rotulo?: string;
  className?: string;
}) {
  const a11y = rotulo ? { role: "img" as const, "aria-label": rotulo } : { "aria-hidden": true as const };

  if (variante === "traco") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={tamanho}
        height={tamanho}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0", className)}
        {...a11y}
      >
        <path d="M9.5 6.5h6.5" />
        <path d="M14 6.5v8a3.25 3.25 0 0 1-6.5 0" />
        <circle cx="19" cy="5" r="2.1" fill="currentColor" stroke="none" className={cn(vivo && "pulso-ao-vivo")} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" className={cn("shrink-0", className)} {...a11y}>
      <circle cx="12" cy="12" r="11" className="fill-navy" />
      <g stroke="#FFFFFF" strokeWidth={tamanho <= 16 ? 2.4 : 2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 7h6.5" />
        <path d="M13.75 7v7.6a3.1 3.1 0 0 1-6.2 0" />
      </g>
      <circle cx="19.2" cy="4.8" r={tamanho <= 16 ? 3.7 : 3.3} className="fill-branco" />
      <circle cx="19.2" cy="4.8" r={tamanho <= 16 ? 2.7 : 2.3} className={cn("fill-laranja", vivo && "pulso-ao-vivo")} />
    </svg>
  );
}

/**
 * O lockup "marca + Jarvis" para cabeçalhos de bloco e chips. O nome vai em navy, no peso 650 que
 * os títulos da casa usam — o Jarvis assina, não grita.
 */
export function AssinaturaJarvis({
  tamanho = 20,
  vivo = false,
  sufixo,
  className,
}: {
  tamanho?: TamanhoMarca;
  vivo?: boolean;
  /** texto discreto depois do nome: "propõe", "diz", "criou tarefa" */
  sufixo?: string;
  className?: string;
}) {
  const texto = tamanho >= 32 ? "text-[15px]" : tamanho === 20 ? "text-[13px]" : "text-[12px]";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <MarcaJarvis tamanho={tamanho} vivo={vivo} />
      <span className={cn("font-[650] leading-none tracking-[-0.01em] text-navy", texto)}>
        Jarvis
        {sufixo && <span className="font-medium text-suave"> {sufixo}</span>}
      </span>
    </span>
  );
}

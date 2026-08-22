import * as React from "react";
import { cn } from "@/lib/utils";

type Variante = "primary" | "destructive" | "outline" | "ghost" | "verde";

/*
 * W4 (22/08) — O HOVER DE `outline` E DE `ghost` ERA LITERALMENTE UM NO-OP.
 *
 * Os dois faziam `hover:bg-creme`, e `creme` E o fundo da pagina (#F7F7F4, remapeado em R9 quando o
 * creme quente morreu). Passar o mouse pintava o botao da cor que ele ja tinha atras: medido, 1,03:1
 * contra o branco do card e 1,00:1 contra o board. O unico sinal que sobrava era `hover:text-navy`,
 * que e mudanca de cor de TEXTO — invisivel pra quem esta olhando pro cursor, e nula pra quem tem
 * deficiencia de cor. Agora usam o token `hover` (#EAE9E3, ver tailwind.config.ts): 1,22:1 no branco
 * e 1,13:1 no board.
 *
 * `hover:text-navy` fica, mas como reforco, nao como o sinal inteiro.
 */
const estilos: Record<Variante, string> = {
  primary: "bg-laranja text-branco shadow-laranja hover:bg-laranja-esc",
  destructive: "bg-vermelho text-branco hover:opacity-90",
  outline: "border-[1.5px] border-borda-forte bg-branco text-suave hover:bg-hover hover:text-navy",
  ghost: "bg-transparent text-suave hover:bg-hover hover:text-navy",
  verde: "bg-verde text-branco hover:opacity-90",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none",
        // Foco visivel proprio: varios pontos do app zeram o outline do navegador, e botao sem anel
        // de foco quebra 2.4.7 pra quem navega por teclado. O anel usa o laranja da marca (3,23:1
        // contra o branco — passa o piso de 3:1 de indicador nao-textual) com offset pra nao sumir
        // dentro do proprio preenchimento nas variantes cheias.
        "outline-none focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2 focus-visible:ring-offset-branco",
        estilos[variante],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

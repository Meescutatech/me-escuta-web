import * as React from "react";
import { cn } from "@/lib/utils";

type Variante = "primary" | "destructive" | "outline" | "ghost" | "verde";

const estilos: Record<Variante, string> = {
  primary: "bg-laranja text-branco shadow-laranja hover:bg-laranja-esc",
  destructive: "bg-vermelho text-branco hover:opacity-90",
  outline: "border-[1.5px] border-borda-forte bg-branco text-suave hover:bg-creme hover:text-navy",
  ghost: "bg-transparent text-suave hover:bg-creme hover:text-navy",
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
        estilos[variante],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

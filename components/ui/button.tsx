import * as React from "react";
import { cn } from "@/lib/utils";

type Variante = "primary" | "destructive" | "outline";

const estilos: Record<Variante, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-muted",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50 disabled:pointer-events-none",
        estilos[variante],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

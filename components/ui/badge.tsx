import * as React from "react";
import { cn } from "@/lib/utils";

type Tom = "neutro" | "laranja" | "navy" | "verde" | "vermelho";

const tons: Record<Tom, string> = {
  neutro: "bg-creme text-suave",
  laranja: "bg-laranja-cl text-laranja-esc",
  navy: "bg-azul-bg text-navy",
  verde: "bg-verde-bg text-verde",
  vermelho: "bg-vermelho-bg text-vermelho",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tom?: Tom;
}

export function Badge({ className, tom = "neutro", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        tons[tom],
        className,
      )}
      {...props}
    />
  );
}

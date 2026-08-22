import * as React from "react";
import { cn } from "@/lib/utils";

type Tom = "neutro" | "laranja" | "navy" | "verde" | "vermelho";

const tons: Record<Tom, string> = {
  // W4 (22/08): `neutro` era `bg-creme`, e creme E o fundo da pagina (#F7F7F4) — a pastilha
  // neutra media 1,00:1 contra o board, ou seja, nao existia como pastilha. `bg-linha` (#E8E7E2)
  // da 1,15:1 no board e 1,24:1 no branco, e o texto `suave` novo sobre ela mede 5,91:1.
  neutro: "bg-linha text-suave",
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

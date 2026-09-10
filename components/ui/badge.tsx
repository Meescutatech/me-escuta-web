"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium",
  {
    variants: {
      variant: {
        default: "bg-foreground/[0.08] text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        muted: "bg-muted text-muted-foreground",
        accent: "bg-accent text-accent-foreground",
        // Tríade do Figma (`state/*-tint` + `state/*-ink`): o `-ink` é a
        // tinta LEGÍVEL sobre o tint. Usar a cor cheia como texto
        // (`text-success`) reprova contraste no tema claro.
        destructive: "bg-danger-tint text-danger-ink",
        success: "bg-success-tint text-success-ink",
        warning: "bg-warning-tint text-warning-ink",
        info: "bg-info-tint text-info-ink",
        outline: "border border-border bg-transparent text-foreground",
        ghost:
          "bg-transparent text-foreground hover:bg-muted hover:text-muted-foreground",
        link: "bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        // `text-ui-10` é o piso da escala. Além do tamanho, o token traz a
        // entrelinha (14px) — antes, com o px cravado, a altura do badge
        // herdava a entrelinha do contexto e variava de tela para tela.
        xs: "px-1.5 py-px text-ui-10",
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

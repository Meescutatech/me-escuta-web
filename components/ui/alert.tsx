"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva("relative flex gap-3 rounded-xl border p-4", {
  variants: {
    variant: {
      default:
        "bg-muted/50 border-border text-foreground [&_[data-slot=alert-icon]]:text-muted-foreground",
      // Tríade do Figma: `-soft` no fundo, `-line` na borda, `-ink` no ícone.
      info: "bg-info-tint border-info/20 text-foreground [&_[data-slot=alert-icon]]:text-info",
      success:
        "bg-success-soft border-success-line text-foreground [&_[data-slot=alert-icon]]:text-success-ink",
      warning:
        "bg-warning-soft border-warning-line text-foreground [&_[data-slot=alert-icon]]:text-warning-ink",
      destructive:
        "bg-danger-soft border-danger-line text-foreground [&_[data-slot=alert-icon]]:text-danger-ink",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-icon"
      className={cn("mt-0.5 shrink-0 *:size-4", className)}
      {...props}
    />
  );
}

function AlertContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-content"
      className={cn("min-w-0 flex-1 space-y-0.5", className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("text-sm leading-snug font-semibold", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Alert,
  AlertIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
  alertVariants,
};

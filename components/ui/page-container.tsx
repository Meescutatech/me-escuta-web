"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.ComponentProps<"div"> {
  variant?: "default" | "large" | "full";
}

const variantClasses = {
  default: "max-w-4xl px-10 py-10 mx-auto w-full",
  large: "max-w-6xl px-10 py-10 mx-auto w-full",
  full: "w-full px-10 py-10",
} as const;

function PageContainer({
  variant = "default",
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      data-variant={variant}
      className={cn(variantClasses[variant], className)}
      {...props}
    />
  );
}

export { PageContainer };

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pageHeaderVariants = cva("flex flex-col", {
  variants: {
    size: {
      default: "gap-4 py-6",
      small: "gap-3 py-4",
      large: "gap-6 py-8",
      full: "gap-4 py-6 min-h-[200px]",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

interface PageHeaderProps
  extends
    React.ComponentProps<"div">,
    VariantProps<typeof pageHeaderVariants> {}

function PageHeader({ className, size, ...props }: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(pageHeaderVariants({ size }), className)}
      {...props}
    />
  );
}

function PageHeaderBreadcrumb({
  className,
  ...props
}: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="page-header-breadcrumb"
      aria-label="Navegação estrutural"
      className={cn("", className)}
      {...props}
    />
  );
}

function PageHeaderMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-meta"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-icon"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderSummary({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-summary"
      className={cn("flex flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn(
        "text-2xl font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function PageHeaderAside({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-aside"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

function PageHeaderNavigationTabs({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-navigation-tabs"
      className={cn("border-b border-border", className)}
      {...props}
    />
  );
}

function PageHeaderRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-row"
      className={cn("flex items-start gap-4", className)}
      {...props}
    />
  );
}

function PageHeaderContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-content"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderBreadcrumb,
  PageHeaderMeta,
  PageHeaderIcon,
  PageHeaderSummary,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderAside,
  PageHeaderNavigationTabs,
  PageHeaderRow,
  PageHeaderContent,
};

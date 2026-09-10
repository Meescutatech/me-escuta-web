"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pageSectionVariants = cva("flex flex-col gap-4", {
  variants: {
    orientation: {
      vertical: "",
      horizontal:
        "lg:flex-row lg:gap-8 [&>[data-slot=page-section-meta]]:lg:w-80 [&>[data-slot=page-section-meta]]:lg:shrink-0 [&>[data-slot=page-section-content]]:lg:flex-1",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

interface PageSectionProps
  extends
    React.ComponentProps<"section">,
    VariantProps<typeof pageSectionVariants> {}

function PageSection({ orientation, className, ...props }: PageSectionProps) {
  return (
    <section
      data-slot="page-section"
      data-orientation={orientation}
      className={cn(pageSectionVariants({ orientation }), className)}
      {...props}
    />
  );
}

function PageSectionMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-meta"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    />
  );
}

function PageSectionSummary({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-summary"
      className={cn("flex flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}

function PageSectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="page-section-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function PageSectionDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-section-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function PageSectionAside({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-aside"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

function PageSectionContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-content"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function PageSectionHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

export {
  PageSection,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
  PageSectionDescription,
  PageSectionAside,
  PageSectionContent,
  PageSectionHeader,
};

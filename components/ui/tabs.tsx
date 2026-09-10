"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

// Root — adds group/tabs + flex-col for horizontal orientation
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("group/tabs flex flex-col gap-2", className)}
      {...props}
    />
  );
}

// ── TabsList ──────────────────────────────────────────────────────────────────

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground",
  {
    variants: {
      variant: {
        // Pill/fill: muted background, active trigger gets white fill + shadow
        default: "rounded-lg bg-muted p-[3px] h-9",
        // Line: underline per trigger, no background
        line: "w-full gap-1 bg-transparent border-b border-border justify-start rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

// ── TabsTrigger ───────────────────────────────────────────────────────────────

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Base layout — matches shadcn exactly
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5",
        "rounded-md border border-transparent px-2 py-1",
        "cursor-pointer text-sm font-medium whitespace-nowrap",
        "text-foreground/60 hover:text-foreground",
        "transition-all duration-150",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",

        // ── default (fill) variant ──
        // Active: white background fill + shadow
        "group-data-[variant=default]/tabs-list:data-[active]:bg-background",
        "group-data-[variant=default]/tabs-list:data-[active]:text-foreground",
        "group-data-[variant=default]/tabs-list:data-[active]:shadow-sm",

        // ── line variant ──
        // Adjust sizing/layout for line
        "group-data-[variant=line]/tabs-list:-mb-px",
        "group-data-[variant=line]/tabs-list:h-9",
        "group-data-[variant=line]/tabs-list:flex-none",
        "group-data-[variant=line]/tabs-list:rounded-none",
        "group-data-[variant=line]/tabs-list:border-0",
        "group-data-[variant=line]/tabs-list:border-b-2",
        "group-data-[variant=line]/tabs-list:border-transparent",
        "group-data-[variant=line]/tabs-list:bg-transparent",
        "group-data-[variant=line]/tabs-list:px-3",
        "group-data-[variant=line]/tabs-list:shadow-none",
        // Active underline
        "group-data-[variant=line]/tabs-list:data-[active]:border-foreground",
        "group-data-[variant=line]/tabs-list:data-[active]:bg-transparent",
        "group-data-[variant=line]/tabs-list:data-[active]:text-foreground",
        "group-data-[variant=line]/tabs-list:data-[active]:shadow-none",

        className,
      )}
      {...props}
    />
  );
}

// ── TabsContent ───────────────────────────────────────────────────────────────

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 pt-2 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };

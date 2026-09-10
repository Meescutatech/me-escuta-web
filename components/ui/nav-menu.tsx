"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VariantProps } from "class-variance-authority";
import { tabsListVariants } from "@/components/ui/tabs";

export interface NavMenuItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export interface NavMenuProps {
  items: NavMenuItem[];
  variant?: VariantProps<typeof tabsListVariants>["variant"];
  className?: string;
}

function NavMenu({ items, variant = "default", className }: NavMenuProps) {
  // Portado do react-router (LiderHub e SPA) para o App Router do Next.
  const pathname = usePathname() ?? "";
  const router = useRouter();

  // Find the active item based on current pathname
  const activeHref =
    items.find((item) => pathname.startsWith(item.href))?.href ??
    items[0]?.href ??
    "";

  return (
    <Tabs
      data-slot="nav-menu"
      value={activeHref}
      onValueChange={(value) => router.push(value as string)}
      className={cn("", className)}
    >
      <TabsList variant={variant}>
        {items.map((item) => (
          <TabsTrigger
            key={item.href}
            value={item.href}
            disabled={item.disabled}
            className="gap-1.5"
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && (
              <Badge variant="default" size="xs" className="ml-1">
                {item.badge}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export { NavMenu };

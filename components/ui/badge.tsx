import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

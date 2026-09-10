"use client";

import * as React from "react";
import { Toaster as SonnerToaster } from "sonner";
export { toast } from "sonner";

// ---------------------------------------------------------------------------
// Toaster — opinionated wrapper around sonner with design system tokens
// ---------------------------------------------------------------------------

function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-popover text-popover-foreground border border-border shadow-md rounded-xl text-sm",
          description: "text-muted-foreground",
          actionButton:
            "bg-primary text-primary-foreground text-xs font-medium rounded-lg px-2.5 py-1",
          cancelButton:
            "bg-muted text-muted-foreground text-xs font-medium rounded-lg px-2.5 py-1",
          success: "text-foreground",
          error: "text-destructive",
          warning: "text-warning",
          info: "text-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };

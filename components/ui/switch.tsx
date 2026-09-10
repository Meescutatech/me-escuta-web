"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const switchVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-input transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary",
  {
    variants: {
      size: {
        sm: "h-4 w-7",
        default: "h-5 w-9",
        lg: "h-6 w-11",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const thumbVariants = cva(
  "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
  {
    variants: {
      size: {
        sm: "size-3 data-[checked]:translate-x-3",
        default: "size-4 data-[checked]:translate-x-4",
        lg: "size-5 data-[checked]:translate-x-5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

interface SwitchProps
  extends SwitchPrimitive.Root.Props, VariantProps<typeof switchVariants> {}

function Switch({ className, size, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchVariants({ size }), className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(thumbVariants({ size }))}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

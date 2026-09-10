"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// RadioGroup
// ---------------------------------------------------------------------------

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// RadioGroupItem
// ---------------------------------------------------------------------------

interface RadioGroupItemProps extends Radio.Root.Props {
  className?: string;
}

function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-input bg-background transition-colors",
        "data-[checked]:border-primary",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Radio.Indicator
        className={cn(
          "size-2 rounded-full bg-primary opacity-0 transition-opacity",
          "data-[checked]:opacity-100",
        )}
      />
    </Radio.Root>
  );
}

export { RadioGroup, RadioGroupItem };
export type { RadioGroupItemProps };

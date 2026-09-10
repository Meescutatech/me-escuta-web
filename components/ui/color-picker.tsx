"use client";

import { useId, useState } from "react";
import { CheckIcon, PaletteIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Paleta padrão de cores de destaque (hex #rrggbb). Legível em tema claro e
 * escuro. A primeira cor é o default sugerido para novas etapas.
 */
const STAGE_COLOR_PALETTE = [
  "#64748b", // slate
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
] as const;

const DEFAULT_STAGE_COLOR = STAGE_COLOR_PALETTE[9]; // blue

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

type ColorPickerButtonProps = {
  value?: string;
  onChange: (color: string | undefined) => void;
  /** Permite limpar a cor (opção "Sem cor"). Default: true. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function ColorPickerButton({
  value,
  onChange,
  clearable = true,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Selecionar cor",
}: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const customInputId = useId();

  const hasColor = Boolean(value && HEX_RE.test(value));

  function pick(color: string | undefined) {
    onChange(color);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn("size-9 shrink-0", className)}
          />
        }
      >
        {hasColor ? (
          <span
            aria-hidden="true"
            className="size-4 rounded-full ring-1 ring-black/10 ring-inset"
            style={{ backgroundColor: value }}
          />
        ) : (
          <PaletteIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" sideOffset={8}>
        <div className="grid grid-cols-5 gap-1.5">
          {STAGE_COLOR_PALETTE.map((color) => {
            const selected = value?.toLowerCase() === color;
            return (
              <button
                key={color}
                type="button"
                onClick={() => pick(color)}
                aria-label={color}
                aria-pressed={selected}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full ring-1 ring-black/10 transition-transform ring-inset hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none",
                  selected &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
                style={{ backgroundColor: color }}
              >
                {selected ? (
                  <CheckIcon className="size-3.5 text-white drop-shadow" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <label
            htmlFor={customInputId}
            className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span
              className="size-5 rounded-full ring-1 ring-black/10 ring-inset"
              style={{
                backgroundColor:
                  value && HEX_RE.test(value) ? value : "transparent",
              }}
            />
            Personalizada
            <input
              id={customInputId}
              type="color"
              value={value && HEX_RE.test(value) ? value : DEFAULT_STAGE_COLOR}
              onChange={(event) => onChange(event.target.value)}
              className="sr-only"
            />
          </label>

          {clearable && hasColor ? (
            <button
              type="button"
              onClick={() => pick(undefined)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Sem cor
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ColorPickerButton, STAGE_COLOR_PALETTE, DEFAULT_STAGE_COLOR };
export type { ColorPickerButtonProps };

"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import type { EmojiClickData, Theme } from "emoji-picker-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * O catálogo de emoji são ~700 KB de fonte. Ele só aparece dentro do
 * `PopoverContent`, que o Base UI monta na abertura — então o `lazy` tira esse
 * peso do chunk da rota sem adiar nada que estivesse na tela.
 */
const EmojiPicker = lazy(() =>
  import("emoji-picker-react").then((m) => ({ default: m.default })),
);

/**
 * `Theme` é um enum — importá-lo como VALOR puxaria o módulo inteiro de volta
 * para este chunk e anularia o `lazy` acima. São duas strings; a asserção
 * mantém o tipo do prop honesto sem custar um import estático.
 */
const THEME = { light: "light", dark: "dark" } as unknown as Record<
  "light" | "dark",
  Theme
>;

type EmojiPickerButtonProps = {
  value: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function EmojiPickerButton({
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Selecionar emoji",
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(THEME.light);

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => {
      setTheme(root.classList.contains("dark") ? THEME.dark : THEME.light);
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  function handleEmojiClick(data: EmojiClickData) {
    onChange(data.emoji);
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
            className={cn("size-10 shrink-0 text-lg", className)}
          />
        }
      >
        <span aria-hidden="true">{value || "😀"}</span>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto border-0 p-0 shadow-lg ring-0"
        align="start"
        sideOffset={8}
      >
        {/* Placeholder com a caixa final (320×400): sem ele o popover nasceria
            com 0px e saltaria de tamanho quando o chunk chegasse. */}
        <Suspense
          fallback={
            <div
              aria-busy="true"
              aria-label="Carregando emojis"
              className="h-100 w-80 animate-pulse rounded-md bg-muted/40"
            />
          }
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={theme}
            width={320}
            height={400}
            searchPlaceholder="Buscar emoji..."
            previewConfig={{ showPreview: false }}
            lazyLoadEmojis
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}

export { EmojiPickerButton };
export type { EmojiPickerButtonProps };

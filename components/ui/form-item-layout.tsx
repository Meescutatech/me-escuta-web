"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FormItemLayoutProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  layout?: "vertical" | "horizontal" | "flex-row-reverse";
  htmlFor?: string;
  className?: string;
  /**
   * Objeto à direita do rótulo — o lugar da dica de campo (`HintTooltip`).
   *
   * Existe porque a alternativa era o campo carregar a explicação num cartão
   * abaixo do formulário: o texto ficava longe da pergunta que ele responde e
   * ocupava altura permanente para algo que se lê uma vez.
   */
  labelSuffix?: React.ReactNode;
  children: React.ReactNode;
}

function FormItemLayout({
  label,
  description,
  error,
  required,
  layout = "vertical",
  htmlFor,
  className,
  labelSuffix,
  children,
}: FormItemLayoutProps) {
  const labelText = (
    <label
      data-slot="form-label"
      htmlFor={htmlFor}
      className={cn(
        "text-sm leading-none font-medium text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        layout === "flex-row-reverse" && "cursor-pointer",
      )}
    >
      {label}
      {required && <span className="ml-1 text-destructive">*</span>}
    </label>
  );

  // Só embrulha quando há sufixo: um `flex` a mais em todo campo mudaria o
  // alinhamento de rótulo de dezenas de formulários por causa de um caso.
  const labelEl = labelSuffix ? (
    <span className="flex items-center gap-1.5">
      {labelText}
      {labelSuffix}
    </span>
  ) : (
    labelText
  );

  const descriptionEl = description ? (
    <p data-slot="form-description" className="text-xs text-muted-foreground">
      {description}
    </p>
  ) : null;

  const errorEl = error ? (
    <p data-slot="form-error" className="text-xs text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  if (layout === "vertical") {
    return (
      <div
        data-slot="form-item"
        data-layout="vertical"
        className={cn("flex flex-col gap-1.5", className)}
      >
        {labelEl}
        {children}
        {descriptionEl}
        {errorEl}
      </div>
    );
  }

  if (layout === "horizontal") {
    return (
      <div
        data-slot="form-item"
        data-layout="horizontal"
        className={cn(
          "grid grid-cols-[200px_1fr] items-start gap-x-6",
          className,
        )}
      >
        <div className="flex flex-col gap-0.5 pt-1.5">
          {labelEl}
          {descriptionEl}
        </div>
        <div className="flex flex-col gap-1.5">
          {children}
          {errorEl}
        </div>
      </div>
    );
  }

  // flex-row-reverse: control left, label+description right (for checkbox/switch)
  return (
    <div
      data-slot="form-item"
      data-layout="flex-row-reverse"
      className={cn(
        "flex w-full flex-row-reverse items-start justify-between gap-3",
        className,
      )}
    >
      {children}
      <div className="flex flex-1 flex-col gap-0.5">
        {labelEl}
        {descriptionEl}
        {errorEl}
      </div>
    </div>
  );
}

export { FormItemLayout };

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

interface EmptyStatePresentationalProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps["variant"];
    icon?: React.ReactNode;
  };
  className?: string;
}

function EmptyStatePresentational({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStatePresentationalProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-[280px] text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button
          variant={action.variant ?? "outline"}
          size="sm"
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface TableEmptyRowProps {
  colSpan: number;
  message?: string;
  icon?: React.ReactNode;
}

function TableEmptyRow({
  colSpan,
  message = "Nenhum resultado encontrado.",
  icon,
}: TableEmptyRowProps) {
  return (
    <tr data-slot="table-empty-row">
      <td colSpan={colSpan} className="px-3 py-8 text-center align-middle">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          {icon && (
            <div className="rounded-full bg-muted p-2 text-muted-foreground">
              {icon}
            </div>
          )}
          <p className="text-sm">{message}</p>
        </div>
      </td>
    </tr>
  );
}

export { EmptyStatePresentational, TableEmptyRow };

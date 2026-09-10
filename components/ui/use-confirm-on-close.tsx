"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface UseConfirmOnCloseOptions {
  isDirty: boolean;
  onDiscard: () => void;
  message?: string;
  title?: string;
  cancelLabel?: string;
  discardLabel?: string;
}

function useConfirmOnClose({
  isDirty,
  onDiscard,
  message = "Você tem alterações não salvas. Tem certeza que deseja descartar?",
  title = "Descartar alterações?",
  cancelLabel = "Continuar editando",
  discardLabel = "Descartar",
}: UseConfirmOnCloseOptions) {
  const [pendingClose, setPendingClose] = React.useState(false);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open && isDirty) {
        setPendingClose(true);
      } else if (!open) {
        onDiscard();
      }
    },
    [isDirty, onDiscard],
  );

  const handleDiscard = React.useCallback(() => {
    setPendingClose(false);
    onDiscard();
  }, [onDiscard]);

  const ConfirmDialog = React.useCallback(
    () => (
      <AlertDialog
        open={pendingClose}
        onOpenChange={(open: boolean) => {
          if (!open) setPendingClose(false);
        }}
      >
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingClose(false)}>
              {cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDiscard}>
              {discardLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [pendingClose, title, message, cancelLabel, discardLabel, handleDiscard],
  );

  return { handleOpenChange, ConfirmDialog };
}

export { useConfirmOnClose };

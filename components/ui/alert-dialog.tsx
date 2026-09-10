"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";
import {
  buttonVariants,
  Button,
  type ButtonProps,
} from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  asChild,
  render,
  children,
  ...props
}: AlertDialogPrimitive.Trigger.Props & { asChild?: boolean }) {
  const renderProp =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <AlertDialogPrimitive.Trigger
      data-slot="alert-dialog-trigger"
      render={renderProp}
      {...props}
    >
      {asChild ? undefined : children}
    </AlertDialogPrimitive.Trigger>
  );
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
        "data-[open]:animate-in data-[open]:fade-in-0",
        "data-[closed]:animate-out data-[closed]:fade-out-0",
        "duration-150",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] sm:max-w-md",
          "-translate-x-1/2 -translate-y-1/2",
          "grid gap-4 rounded-xl bg-popover p-6 shadow-xl ring-1 ring-foreground/[0.08]",
          "duration-150 outline-none",
          "data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
          "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base leading-none font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  ...props
}: AlertDialogPrimitive.Close.Props & { variant?: ButtonProps["variant"] }) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

// ── AlertDialogModal (high-level) ─────────────────────────────────────────────
// Opinionated confirmation modal — wraps Dialog, handles loading state.
// Use this instead of composing primitives for standard confirm flows.

interface AlertDialogModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: React.ReactNode;
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

function AlertDialogModal({
  open,
  onOpenChange,
  icon,
  title,
  description,
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  confirmVariant = "default",
  onConfirm,
  loading,
}: AlertDialogModalProps) {
  const [pending, setPending] = React.useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader className="items-center pr-0 text-center">
          {icon && (
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              {icon}
            </div>
          )}
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange?.(false)}
            disabled={pending || loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="flex-1"
            onClick={handleConfirm}
            loading={pending || loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── TextConfirmDialog ─────────────────────────────────────────────────────────
// Speed bump for destructive actions — user must type a phrase to confirm.

interface TextConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: React.ReactNode;
  title: string;
  description: string;
  confirmPhrase: string;
  inputLabel?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

function TextConfirmDialog({
  open,
  onOpenChange,
  icon,
  title,
  description,
  confirmPhrase,
  inputLabel,
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  confirmVariant = "destructive",
  onConfirm,
  loading,
}: TextConfirmDialogProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const isMatch = inputValue === confirmPhrase;

  React.useEffect(() => {
    if (!open) setInputValue("");
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        {icon && (
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            {icon}
          </div>
        )}
        <DialogHeader className={cn(icon && "text-center")}>
          <DialogTitle className={cn(icon && "text-center")}>
            {title}
          </DialogTitle>
          <DialogDescription className={cn(icon && "text-center")}>
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {inputLabel && (
            <label className="text-xs font-medium text-muted-foreground">
              {inputLabel}
            </label>
          )}
          <Input
            placeholder={confirmPhrase}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Digite{" "}
            <span className="font-mono font-semibold text-foreground">
              {confirmPhrase}
            </span>{" "}
            para confirmar.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange?.(false)}
            disabled={pending || loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="flex-1"
            onClick={handleConfirm}
            disabled={!isMatch}
            loading={pending || loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ConfirmationModal ─────────────────────────────────────────────────────────
// Flexible confirmation modal with customizable body content.

type ConfirmationModalSize = "sm" | "default" | "lg";

const sizeClasses: Record<ConfirmationModalSize, string> = {
  sm: "sm:max-w-sm",
  default: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

interface ConfirmationModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  size?: ConfirmationModalSize;
}

function ConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  confirmVariant = "default",
  onConfirm,
  loading,
  size = "default",
}: ConfirmationModalProps) {
  const [pending, setPending] = React.useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(sizeClasses[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="flex flex-col gap-3">{children}</div>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={pending || loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            loading={pending || loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  // Base UI primitives (compose these for custom layouts)
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  // High-level wrappers (use these for standard confirm flows)
  AlertDialogModal,
  TextConfirmDialog,
  ConfirmationModal,
};
export type {
  AlertDialogModalProps,
  TextConfirmDialogProps,
  ConfirmationModalProps,
};

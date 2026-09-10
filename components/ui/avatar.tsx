"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Size variants
// ---------------------------------------------------------------------------

const avatarVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold select-none",
  {
    variants: {
      size: {
        xs: "size-6 text-[8px]",
        sm: "size-8 text-[11px]",
        md: "size-9 text-xs",
        lg: "size-10 text-xs",
        xl: "size-12 text-sm",
      },
      variant: {
        subtle: "bg-primary/10 text-primary",
        solid: "bg-primary text-primary-foreground",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      size: "sm",
      variant: "subtle",
    },
  },
);

// ---------------------------------------------------------------------------
// Avatar — base-ui Root primitive
// ---------------------------------------------------------------------------

type AvatarProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> &
  VariantProps<typeof avatarVariants>;

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, size, variant, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    data-slot="avatar"
    className={cn(avatarVariants({ size, variant }), className)}
    {...props}
  />
));
Avatar.displayName = "Avatar";

// ---------------------------------------------------------------------------
// AvatarImage — base-ui Image primitive
// ---------------------------------------------------------------------------

type AvatarImageProps = React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Image
>;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  AvatarImageProps
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    data-slot="avatar-image"
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";

// ---------------------------------------------------------------------------
// AvatarFallback — base-ui Fallback primitive
// ---------------------------------------------------------------------------

type AvatarFallbackProps = React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Fallback
>;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  AvatarFallbackProps
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    data-slot="avatar-fallback"
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

// ---------------------------------------------------------------------------
// Status dot sizes
// ---------------------------------------------------------------------------

const statusDotSizes: Record<string, string> = {
  xs: "size-1.5 bottom-0 right-0",
  sm: "size-2 bottom-0 right-0",
  md: "size-2.5 -bottom-px -right-px",
  lg: "size-3 -bottom-px -right-px",
  xl: "size-3.5 -bottom-px -right-px",
};

const statusColors: Record<AvatarStatusValue, string> = {
  online: "bg-success",
  offline: "bg-muted-foreground/50",
  pending: "bg-warning",
  blocked: "bg-destructive",
};

// ---------------------------------------------------------------------------
// AvatarStatus — status dot overlaid on avatar
// ---------------------------------------------------------------------------

type AvatarStatusValue = "online" | "offline" | "pending" | "blocked";

interface AvatarStatusProps extends React.ComponentProps<"span"> {
  status: AvatarStatusValue;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  "aria-label"?: string;
}

function AvatarStatus({
  status,
  size = "sm",
  className,
  "aria-label": ariaLabel,
  ...props
}: AvatarStatusProps) {
  return (
    <span
      data-slot="avatar-status"
      role="img"
      aria-label={ariaLabel ?? `Status: ${status}`}
      className={cn(
        "absolute rounded-full border-2 border-background",
        statusDotSizes[size],
        statusColors[status],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// AvatarWithStatus — Avatar + AvatarStatus convenience wrapper
// ---------------------------------------------------------------------------

interface AvatarWithStatusProps extends AvatarProps {
  statusValue: AvatarStatusValue;
  statusLabel?: string;
}

function AvatarWithStatus({
  statusValue,
  statusLabel,
  size,
  children,
  ...avatarProps
}: AvatarWithStatusProps) {
  const sizeKey = (size ?? "sm") as NonNullable<AvatarProps["size"]>;

  return (
    <div className="relative inline-flex shrink-0">
      <Avatar size={size} {...avatarProps}>
        {children}
      </Avatar>
      <AvatarStatus
        status={statusValue}
        size={sizeKey}
        aria-label={statusLabel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AvatarGroup — stacked / overlapping avatars
// ---------------------------------------------------------------------------
// AvatarGroup — stacked / overlapping avatars (shadcn base-nova pattern)
// ---------------------------------------------------------------------------

type AvatarGroupProps = React.ComponentProps<"div">;

function AvatarGroup({ className, ...props }: AvatarGroupProps) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2",
        "*:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// AvatarGroupCount — overflow badge for AvatarGroup
// ---------------------------------------------------------------------------

interface AvatarGroupCountProps extends React.ComponentProps<"div"> {
  size?: AvatarProps["size"];
}

function AvatarGroupCount({
  size = "sm",
  className,
  ...props
}: AvatarGroupCountProps) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        avatarVariants({ size, variant: "muted" }),
        "ring-2 ring-background",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  Avatar,
  avatarVariants,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarStatus,
  AvatarWithStatus,
};

export type {
  AvatarProps,
  AvatarImageProps,
  AvatarFallbackProps,
  AvatarStatusProps,
  AvatarStatusValue,
  AvatarGroupProps,
  AvatarGroupCountProps,
  AvatarWithStatusProps,
};

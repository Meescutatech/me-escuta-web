"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Anúncio in-app — quatro superfícies, um peso cada
 * ─────────────────────────────────────────────────────────────────────────────
 * Desenho e regras vivem na página "Anúncios in-app" do arquivo
 * "CRM — Design System". A escada, resumida, é o que decide qual usar:
 *
 *   Grau 0 · `AnnouncementDot`      passivo, marca o controle e espera o clique
 *   Grau 1 · `AnnouncementBanner`   informa, não exige ação hoje
 *   Grau 2 · `AnnouncementCard`     convida, ao lado de onde o recurso vive
 *   Grau 3 · `AnnouncementDialog`   INTERROMPE — um por trimestre, por escritório
 *
 * O erro que estas peças existem para evitar é dar modal para tudo. O modal
 * gasta um crédito de atenção que não volta, e quem paga é o próximo anúncio.
 *
 * Duas regras que o componente NÃO consegue impor sozinho, e que quem chama
 * precisa respeitar:
 *
 *   1. **Um por vez.** Nunca faixa e modal na mesma sessão.
 *   2. **A dispensa é do servidor.** `onDismiss` some com a peça na tela; quem
 *      grava `dismissedAt` por usuário é quem chama. Guardar em `localStorage`
 *      ressuscita o aviso na próxima aba — e aba nova é o caso comum aqui,
 *      porque o escritório ativo já é por aba.
 *
 * O motion está em `styles/base.css`; só `opacity` e `transform`, e todo ele
 * cede a `prefers-reduced-motion` sem esconder informação.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Grau 1 · Faixa
   ══════════════════════════════════════════════════════════════════════════ */

const bannerVariants = cva(
  "announcement-banner-in flex w-full shrink-0 items-center gap-3 px-4 py-2.5 text-sm",
  {
    variants: {
      tone: {
        info: "bg-info-tint text-info-ink",
        warning: "bg-warning-tint text-warning-ink",
        neutral: "border-b border-border bg-muted text-foreground",
        // A ÚNICA superfície de anúncio que usa a marca. Dentro do app o
        // protagonista é o tenant — por isso o gradiente aparece aqui e não
        // na sidebar nem no header.
        brand: "bg-gradient-to-r from-brand-blue to-primary text-white",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

type AnnouncementBannerProps = React.ComponentProps<"div"> &
  VariantProps<typeof bannerVariants> & {
    /** Ação opcional à direita. Um botão, nunca dois. */
    action?: React.ReactNode;
    /**
     * Ausente = faixa sem X. Faixa de CONSEQUÊNCIA (trial vencendo, modo
     * somente leitura) não se dispensa: ela some quando a condição some.
     */
    onDismiss?: () => void;
  };

function AnnouncementBanner({
  className,
  tone,
  action,
  onDismiss,
  children,
  ...props
}: AnnouncementBannerProps) {
  return (
    <div
      data-slot="announcement-banner"
      data-tone={tone ?? "info"}
      role="status"
      className={cn(bannerVariants({ tone }), className)}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar aviso"
          className="-mr-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md opacity-70 transition-opacity duration-100 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Grau 0 · Ponto de novidade
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pulsa três vezes e para. Um ponto que pulsa para sempre deixa de ser aviso e
 * vira ruído — e o usuário não tem como desligá-lo sem sair da tela.
 */
function AnnouncementDot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="announcement-dot"
      aria-hidden="true"
      className={cn(
        "announcement-dot inline-block size-2 shrink-0 rounded-full bg-primary",
        className,
      )}
      {...props}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   O "vídeo" da funcionalidade
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Três quadros em loop de 6 s, sem áudio. No produto isto vira um `<video>`
 * mudo com `poster`, servido por CDN — nunca um MP4 no bundle. A cadência é a
 * mesma para o desenho poder ser revisado antes de existir arquivo.
 */
function AnnouncementReel({
  frames,
  className,
  ...props
}: React.ComponentProps<"div"> & { frames: React.ReactNode[] }) {
  return (
    <div
      data-slot="announcement-reel"
      aria-hidden="true"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <div className="announcement-reel h-full">
        {frames.map((frame, i) => (
          <div key={i} className="grid h-full w-full place-items-center">
            {frame}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Grau 2 · Card
   ══════════════════════════════════════════════════════════════════════════ */

type AnnouncementCardProps = React.ComponentProps<"div"> & {
  /** Arte decorativa no topo. Só o Grau 2 tem direito a ela. */
  art?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
};

function AnnouncementCard({
  className,
  art,
  title,
  description,
  action,
  onDismiss,
  ...props
}: AnnouncementCardProps) {
  return (
    <div
      data-slot="announcement-card"
      className={cn(
        "announcement-card-in relative overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
      {...props}
    >
      {art ? <div className="h-20 overflow-hidden">{art}</div> : null}
      <div className="flex flex-col gap-2 p-3">
        <p className="text-ui-13 font-medium text-foreground">{title}</p>
        <p className="text-ui-11 text-muted-foreground">{description}</p>
        {action}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar novidade"
          className="absolute top-2 right-2 grid size-6 cursor-pointer place-items-center rounded-md bg-card/80 text-muted-foreground opacity-80 transition-opacity duration-100 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Grau 2 · Coach mark
   ══════════════════════════════════════════════════════════════════════════ */

type AnnouncementCoachMarkProps = React.ComponentProps<"div"> & {
  title: string;
  description: string;
  /** "1 de 2". Máximo dois passos: o terceiro vira tour, e tour ninguém termina. */
  step?: string;
  onSkip?: () => void;
  onNext?: () => void;
  nextLabel?: string;
};

function AnnouncementCoachMark({
  className,
  title,
  description,
  step,
  onSkip,
  onNext,
  nextLabel = "Próximo",
  ...props
}: AnnouncementCoachMarkProps) {
  return (
    <div
      data-slot="announcement-coach-mark"
      role="dialog"
      aria-label={title}
      className={cn(
        "announcement-coach-in relative w-75 rounded-xl border border-border bg-popover p-4 shadow-lg",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute -top-[6px] left-8 size-3 rotate-45 rounded-[2px] border-t border-l border-border bg-popover"
      />
      <p className="text-ui-13 font-medium text-foreground">{title}</p>
      <p className="mt-1 text-ui-12 text-muted-foreground">{description}</p>
      <div className="mt-3 flex items-center gap-2">
        {step ? (
          <span className="text-ui-11 text-muted-foreground">{step}</span>
        ) : null}
        <div className="flex-1" />
        {onSkip ? (
          <Button variant="ghost" size="xs" onClick={onSkip}>
            Pular
          </Button>
        ) : null}
        {onNext ? (
          <Button size="xs" onClick={onNext}>
            {nextLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Grau 3 · Modal de lançamento
   ══════════════════════════════════════════════════════════════════════════ */

type AnnouncementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selo acima do título: "Agora disponível", "Novo". */
  badge?: string;
  title: string;
  description: string;
  /** O vídeo da funcionalidade, normalmente um `AnnouncementReel`. */
  media?: React.ReactNode;
  items?: { title: string; description: string }[];
  primaryLabel: string;
  onPrimary?: () => void;
  /**
   * A saída educada. Obrigatória por desenho: um modal sem "agora não" só
   * oferece o X, e o X lê como erro em vez de escolha.
   */
  secondaryLabel?: string;
};

function AnnouncementDialog({
  open,
  onOpenChange,
  badge,
  title,
  description,
  media,
  items,
  primaryLabel,
  onPrimary,
  secondaryLabel = "Agora não",
}: AnnouncementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="announcement-dialog"
        className="gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
      >
        {media ? (
          <div className="relative aspect-video w-full overflow-hidden">
            {media}
          </div>
        ) : null}

        <div className="flex flex-col gap-4 p-6">
          {badge ? (
            <span className="w-fit rounded-full bg-info-tint px-2 py-0.5 text-ui-10 font-medium tracking-wide text-info-ink uppercase">
              {badge}
            </span>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-h3">{title}</DialogTitle>
            <DialogDescription className="text-ui-13">
              {description}
            </DialogDescription>
          </div>

          {items?.length ? (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted"
                  >
                    <span className="size-2 rounded-full bg-primary" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ui-13 font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="block text-ui-12 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={onPrimary}>
              {primaryLabel}
            </Button>
            <DialogClose render={<Button variant="ghost" />}>
              {secondaryLabel}
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export {
  AnnouncementBanner,
  AnnouncementCard,
  AnnouncementCoachMark,
  AnnouncementDialog,
  AnnouncementDot,
  AnnouncementReel,
  bannerVariants,
};
export type {
  AnnouncementBannerProps,
  AnnouncementCardProps,
  AnnouncementCoachMarkProps,
  AnnouncementDialogProps,
};

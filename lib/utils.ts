/** Junta classes ignorando falsy — util mínima estilo shadcn (sem depender de clsx/tailwind-merge). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

import { Inter, Fraunces } from "next/font/google";

/**
 * Fontes da identidade (Fraunces display + Inter texto), self-hosted via next/font.
 * Evita o @import de CDN do front-clara-v1.html — nada de request externo (bom pro CSP/Vercel).
 * Exponho como CSS vars que o Tailwind (fontFamily) consome: var(--fonte-inter) / var(--fonte-fraunces).
 */
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fonte-inter",
  display: "swap",
});

export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fonte-fraunces",
  display: "swap",
});

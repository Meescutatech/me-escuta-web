import { Inter } from "next/font/google";

/**
 * R9: UMA família de UI — Inter variable via next/font (self-hosted no build, zero request
 * externo e zero flash). A Fraunces foi reprovada e morreu; dado de máquina usa o mono de
 * sistema (fontFamily.mono do Tailwind = --fonte-dados dos tokens).
 */
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fonte-inter",
  display: "swap",
});

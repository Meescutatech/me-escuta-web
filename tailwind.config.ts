import type { Config } from "tailwindcss";

/**
 * Identidade visual da Me Escuta (aprovada 16/07): light mode, laranja + navy, Fraunces + Inter.
 * Tokens portados VERBATIM de Product_Management/Design/front-clara-v1.html (§1.1 do INVENTARIO-FRONT-DEPLOY).
 * Nomes em PT-BR sem acento (convenção do projeto). Sem dark mode — o design é light-only.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        laranja: { DEFAULT: "#EC662E", esc: "#D4541F", cl: "#FDEEE4" },
        pessego: "#FCE7DB",
        navy: "#252F63",
        azul: { DEFAULT: "#143691", bg: "#EEF1FB", bd: "#D5DDF3" },
        creme: "#FBF9F6",
        fundo: "#F3EEE6",
        branco: "#FFFFFF",
        texto: "#3a3a3a",
        suave: "#6f6c76",
        mute: "#a3a0a8",
        borda: { DEFAULT: "#ECE3D6", forte: "#E3D9CA" },
        verde: { DEFAULT: "#2E8B62", bg: "#EAF6EF", bd: "#BFE4CF" },
        vermelho: { DEFAULT: "#C4482E", bg: "#FBEBE4", bd: "#F1CDBF" },
        amarelo: { DEFAULT: "#B8860B", bg: "#FBF3DF", bd: "#EAD9A6" },
        roxo: { DEFAULT: "#7A4CA0", bg: "#F3EDF9", bd: "#E0D0EE" },
        rosa: { DEFAULT: "#B23A6E", bg: "#FBEDF3" },
      },
      fontFamily: {
        sans: ["var(--fonte-inter)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        serif: ["var(--fonte-fraunces)", "Georgia", "serif"],
        mono: ["SF Mono", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        suave: "0 1px 3px rgba(37,47,99,.06)",
        forte: "0 6px 26px rgba(37,47,99,.09)",
        laranja: "0 3px 11px rgba(236,102,46,.26)",
      },
      borderRadius: {
        lg: "16px",
        md: "10px",
        sm: "7px",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(7px)" },
          to: { opacity: "1", transform: "none" },
        },
        evin: {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "pulse-live": {
          "0%": { boxShadow: "0 0 0 0 rgba(55,178,111,.4)" },
          "70%": { boxShadow: "0 0 0 7px rgba(55,178,111,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(55,178,111,0)" },
        },
      },
      animation: {
        rise: "rise .28s ease",
        evin: "evin .5s ease",
        "pulse-live": "pulse-live 1.8s infinite",
      },
    },
  },
  plugins: [],
};

export default config;

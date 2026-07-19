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
        laranja: { DEFAULT: "#EC662E", esc: "#D4541F", cl: "#FCEEE6" },
        pessego: "#FCE7DB",
        navy: { DEFAULT: "#252F63", esc: "#1C2450" }, // navy-esc = hover do enviar (conversa-v2)
        // ── Redesign "Notion-minimalista" (fase 1/2). Fonte da verdade: kanban-v2.html +
        // conversa-v2.html (spec blocks "TOKENS FINAIS", re-sync da revisão de acessibilidade 19/07).
        board: "#FAFAF9", // fundo do board
        tinta: "#2C2E33", // texto padrão do redesign · 13.6:1
        linha: { DEFAULT: "#ECEBE7", forte: "#E4E2DD" }, // bordas hairline (linha / linha-2)
        hover: "#F5F4F2", // fundo de hover de itens clicáveis
        "scroll-h": "#CFCDC7", // hover da scrollbar
        "timer-velho": "#9E5A38", // ESTADO lead parado · 4.5:1 (AA) — sempre com peso 700 + ícone
        "pt-ads": "#B4B7BD", // micro-ponto do sinal "Meta Ads" (decorativo)
        "foco-comp": "#D9C4B6", // borda do composer em foco (conversa-v2)
        bolha: { in: "#F1F0ED", out: "#FBFAF8" }, // bolhas neutras do thread (conversa-v2)
        azul: { DEFAULT: "#143691", bg: "#EEF1FB", bd: "#D5DDF3" },
        creme: "#FBF9F6",
        fundo: "#F3EEE6",
        branco: "#FFFFFF",
        texto: "#3a3a3a",
        suave: "#6f6c76",
        mute: "#6E727A", // re-sync 19/07: terciário AA (4.83:1) — carrega info real (timer/contagem/valor)
        borda: { DEFAULT: "#ECE3D6", forte: "#E3D9CA" },
        verde: { DEFAULT: "#2E8B62", bg: "#EAF6EF", bd: "#BFE4CF" },
        vermelho: { DEFAULT: "#C4482E", bg: "#FBEBE4", bd: "#F1CDBF" },
        amarelo: { DEFAULT: "#B8860B", bg: "#FBF3DF", bd: "#EAD9A6" },
        roxo: { DEFAULT: "#7A4CA0", bg: "#F3EDF9", bd: "#E0D0EE" },
        rosa: { DEFAULT: "#B23A6E", bg: "#FBEDF3" },
      },
      spacing: {
        // Constantes de layout do redesign (spec block "FORMA / ESPAÇO" do kanban-v2.html).
        coluna: "264px", // largura da coluna aberta
        trilho: "44px", // largura do trilho recolhido
        topbar: "50px",
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

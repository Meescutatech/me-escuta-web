import type { Config } from "tailwindcss";

/**
 * Tokens R9 (Product_Management/Design/r9-tokens.md, 22/07): UMA família de UI (Inter) + mono
 * utilitário pra dado de máquina; fundo neutro FRIO #F7F7F4; hairline única #E8E7E2 no lugar
 * de sombra; navy = identidade, laranja = ÚNICO acento de ação; verde/vermelho/âmbar só
 * semântica. Os NOMES antigos dos tokens foram preservados e REMAPEADOS pros valores R9 —
 * telas fora do redesign (/fila /jarvis /timeline) herdam a pele nova sem retoque.
 * A Fraunces morreu (reprovada 22/07): font-serif resolve pra própria Inter.
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
        laranja: { DEFAULT: "#EC662E", esc: "#D4541F", cl: "#FDEFE7" },
        pessego: "#FCE7DB",
        navy: { DEFAULT: "#252F63", esc: "#1C2450" }, // navy-esc = hover do enviar (conversa-v2)
        // ── Redesign "Notion-minimalista" (fase 1/2). Fonte da verdade: kanban-v2.html +
        // conversa-v2.html (spec blocks "TOKENS FINAIS", re-sync da revisão de acessibilidade 19/07).
        board: "#F7F7F4", // --fundo (página e board)
        tinta: "#1F2328", // --tinta
        linha: { DEFAULT: "#E8E7E2", forte: "#DCDAD4" }, // --linha: hairline universal
        hover: "#F3F2EF", // --hover
        "scroll-h": "#CFCDC7", // hover da scrollbar
        "timer-velho": "#9E5A38", // ESTADO lead parado · 4.5:1 (AA) — sempre com peso 700 + ícone
        "pt-ads": "#B4B7BD", // micro-ponto do sinal "Meta Ads" (decorativo)
        "foco-comp": "#D9C4B6", // borda do composer em foco (conversa-v2)
        bolha: { in: "#FFFFFF", out: "#EAECF5" }, // r9-conversa: entrada branca hairline · saída azulada
        azul: { DEFAULT: "#143691", bg: "#EEF1FB", bd: "#D5DDF3" },
        creme: "#F7F7F4", // morreu o creme quente — vira o fundo frio
        fundo: "#F7F7F4",
        branco: "#FFFFFF",
        texto: "#1F2328",
        suave: "#67707B", // --suave: secundário/labels da ficha
        mute: "#9AA1AA", // --pt: placeholder ("Selecione"), desabilitado, carimbos
        borda: { DEFAULT: "#E8E7E2", forte: "#DCDAD4" },
        verde: { DEFAULT: "#177A48", bg: "#EAF6EF", bd: "#BFE4CF" },
        vermelho: { DEFAULT: "#B3372B", bg: "#FBEBE4", bd: "#F1CDBF" },
        amarelo: { DEFAULT: "#B27A00", bg: "#FBF3DF", bd: "#EAD9A6" }, // --ambar
        roxo: { DEFAULT: "#7A4CA0", bg: "#F3EDF9", bd: "#E0D0EE" },
        rosa: { DEFAULT: "#B23A6E", bg: "#FBEDF3" },
      },
      spacing: {
        // Constantes de layout do redesign (spec block "FORMA / ESPAÇO" do kanban-v2.html).
        coluna: "236px", // largura da coluna (r9-funil)
        trilho: "44px", // largura do trilho recolhido
        topbar: "52px",
        painel: "368px", // painel do lead na conversa (anatomia Kommo, r9)
      },
      fontFamily: {
        sans: ["var(--fonte-inter)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        serif: ["var(--fonte-inter)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"], // Fraunces morta (r9) — resolve pra UI
        mono: ["ui-monospace", "SF Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"], // --fonte-dados
      },
      boxShadow: {
        // r9: superfície se separa por hairline, não por sombra — "suave"/"laranja" viram no-op
        suave: "none",
        forte: "0 4px 16px rgba(31,35,40,.10)", // exceção única: dropdown/menu aberto
        laranja: "none",
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

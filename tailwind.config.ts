import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * PRESET DE DESIGN (10/09/2026) — ponte Tailwind v3 <- tokens OKLCH do LiderHub.
 *
 * Os tokens em app/globals.css sao valores COMPLETOS (`oklch(l c h / a)`), nao canais — e o
 * Tailwind v3 so aplica `bg-primary/50` quando a cor e canal + <alpha-value>. A ponte e a forma
 * de FUNCAO que o v3 aceita: para `bg-primary` ele chama com `opacityValue = var(--tw-bg-opacity, 1)`,
 * para `bg-primary/50` chama com `0.5`; nos dois casos devolvemos um `color-mix()` — que aceita
 * qualquer cor CSS, inclusive as que ja carregam alpha (`--success-tint`). Suporte: Chrome 111+,
 * Safari 16.2+, Firefox 113+ (o app e interno e roda em Chrome).
 */
const token = (nome: string) => ({ opacityValue }: { opacityValue?: string | number }) => {
  // Sem modificador o v3 passa `var(--tw-bg-opacity, 1)`; o gradiente passa o NUMERO 0 (transparentTo).
  const alpha = opacityValue === undefined ? undefined : String(opacityValue);
  if (alpha === undefined || alpha === "1" || alpha.startsWith("var(")) return `var(--${nome})`;
  return `color-mix(in oklab, var(--${nome}) calc(${alpha} * 100%), transparent)`;
};

const TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "success", "warning", "info", "border", "input", "ring",
  "success-ink", "success-foreground", "success-tint", "success-line", "success-soft",
  "warning-ink", "warning-tint", "warning-line", "warning-soft",
  "danger-ink", "danger-tint", "danger-line", "danger-soft", "info-ink", "info-tint",
  "note", "note-foreground", "note-line", "note-kicker", "note-tab-active", "note-tab-active-foreground",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "chart-1-bg", "chart-2-bg", "chart-3-bg", "chart-4-bg", "chart-5-bg",
  "table-header", "table-row-hover", "read-tick", "rating-star", "rating-star-empty", "today-tint", "wave-bar",
  "call-bar", "call-bar-foreground", "call-bar-muted-foreground", "call-bar-control", "call-bar-control-hover",
  "glass-panel", "glass-surface", "glass-surface-strong", "glass-hairline", "glass-highlight",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground", "sidebar-accent",
  "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
  "brand-orange", "brand-orange-pressed", "brand-orange-soft", "brand-navy", "brand-navy-pressed", "brand-navy-soft",
  "brand-blue", "brand-blue-pressed", "brand-blue-soft", "brand-ink", "brand-canvas-dark",
  ...["blue", "violet", "sky", "emerald", "amber", "rose", "indigo", "teal", "orange"].flatMap((c) => [`avatar-${c}`, `avatar-${c}-foreground`]),
  ...["blue", "emerald", "amber", "rose", "violet", "sky", "orange", "slate"].flatMap((c) => [`tag-${c}`, `tag-${c}-dot`, `tag-${c}-foreground`]),
  ...["meeting", "call", "email", "note", "task"].flatMap((c) => [`event-${c}`, `event-${c}-foreground`, `event-${c}-accent`]),
  "event-avatar", "channel-whatsapp", "channel-instagram", "channel-messenger", "channel-telegram",
] as const;

const coresDoPreset = Object.fromEntries(TOKENS.map((t) => [t, token(t)]));


/**
 * Tokens R9 (Product_Management/Design/r9-tokens.md, 22/07): UMA família de UI (Inter) + mono
 * utilitário pra dado de máquina; fundo neutro FRIO #F7F7F4; hairline única #E8E7E2 no lugar
 * de sombra; navy = identidade, laranja = ÚNICO acento de ação; verde/vermelho/âmbar só
 * semântica. Os NOMES antigos dos tokens foram preservados e REMAPEADOS pros valores R9 —
 * telas fora do redesign (/fila /jarvis /timeline) herdam a pele nova sem retoque.
 * A Fraunces morreu (reprovada 22/07): font-serif resolve pra própria Inter.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── PRESET (10/09): tokens semanticos do LiderHub via ponte color-mix (ver `token` acima).
        ...coresDoPreset,
        laranja: { DEFAULT: "#EC662E", esc: "#D4541F", cl: "#FDEFE7" },
        pessego: "#FCE7DB",
        navy: { DEFAULT: "#252F63", esc: "#1C2450" }, // navy-esc = hover do enviar (conversa-v2)
        // ── Redesign "Notion-minimalista" (fase 1/2). Fonte da verdade: kanban-v2.html +
        // conversa-v2.html (spec blocks "TOKENS FINAIS", re-sync da revisão de acessibilidade 19/07).
        board: "#F7F7F4", // --fundo (página e board)
        tinta: "#1F2328", // --tinta
        linha: { DEFAULT: "#E8E7E2", forte: "#DCDAD4" }, // --linha: hairline universal
        // W4 (22/08) — o hover ANTIGO (#F3F2EF) era um no-op: 1,04:1 contra o board #F7F7F4
        // (luminancia 0,8879 vs 0,9283 — delta 0,0404). Ninguem via linha nenhuma reagir ao mouse.
        // #EAE9E3 leva o delta pra 0,1151 (2,85x) => 1,13:1 no board e 1,22:1 no branco. Continua
        // no idioma "Notion-minimalista" (mudanca de superficie, nao de borda), mas agora existe.
        hover: "#EAE9E3", // --hover
        "scroll-h": "#CFCDC7", // hover da scrollbar
        // W4 (22/08): #B27A00 media 3,45:1 no board e 3,34:1 sobre a propria pastilha amarelo.bg
        // — reprovava AA carregando o sinal "lead parado", que e informacao de gestao, nao enfeite.
        // Ja era BLOQUEADOR aberto no REVIEW-KANBAN-V2 (item B). #8A5E00: 5,31 board / 5,70 branco
        // / 5,16 sobre amarelo.bg. Mesmo hue ambar, so escurecido.
        // W5: so TEXTO. Como `bg-` este hex media 1,05:1 contra o `vermelho` da faixa AGORA —
        // barra/pastilha usam `amarelo.barra` (#BE8200). Ver o bloco de `amarelo` abaixo.
        "timer-velho": "#8A5E00", // --ambar (r9): lead parado — peso 700 + ícone
        "pt-ads": "#B4B7BD", // micro-ponto do sinal "Meta Ads" (decorativo)
        "foco-comp": "#D9C4B6", // borda do composer em foco (conversa-v2)
        bolha: { in: "#FFFFFF", out: "#EAECF5" }, // r9-conversa: entrada branca hairline · saída azulada
        // ── R13 / Bloco C: as duas peles do modo interno do composer, cravadas nos mockups
        // composer-comandos-v3.html e tarefas-lead-v3.html. Nota = ÂMBAR, tarefa = NAVY;
        // laranja NÃO entra aqui — segue reservado a ação primária e foco.
        nota: { fundo: "#FDF8EC", linha: "#E4D2A6", faixa: "#F9EFD8" },
        // 31/08 · o modo TAREFA sai do navy e vira o IRMÃO MAIS ESCURO do âmbar da nota (pedido do
        // Diogo): as duas superfícies internas passam a ser a mesma família — quente, "isto fica
        // entre nós" — e o que as separa é o DEGRAU, não o hue. Nota é o tom claro, tarefa é o
        // âmbar tostado. Medido (W4/AA): rótulo `tarefa.tinta` 6,27:1 na faixa e 7,04:1 no fundo;
        // `tarefa.suave` 4,88:1 na faixa; tinta padrão 14,38:1 no fundo.
        // O navy NÃO some do produto — ele continua sendo identidade; só deixa de ser a pele de
        // um modo de escrita, onde competia com o laranja da ação primária.
        tarefa: { fundo: "#F7EFDD", linha: "#D9C08C", faixa: "#EFE2C4", tinta: "#6B4A05", suave: "#6A5F4B" },
        // azul.graf (R19): degrau de GRÁFICO do azul — par categórico com o laranja no painel
        // (validado CVD/contraste pela bateria da skill dataviz; o DEFAULT reprova banda de
        // luminância como cor de barra). Só pra marca de dado; texto segue nos tons de tinta.
        azul: { DEFAULT: "#143691", bg: "#EEF1FB", bd: "#D5DDF3", graf: "#3D53B8" },
        creme: "#F7F7F4", // morreu o creme quente — vira o fundo frio
        fundo: "#F7F7F4",
        branco: "#FFFFFF",
        texto: "#1F2328",
        // ── W4 (22/08) · A ESCADA DE CINZA FOI REFEITA PORQUE O DEGRAU DE BAIXO REPROVAVA.
        //
        // `mute` #9AA1AA media 2,61:1 no branco / 2,43:1 no board / 2,33:1 no hover. Reprovava ate
        // o piso de 3:1 de objeto grafico, em 262 usos por 48 arquivos — e nao pinta enfeite: pinta
        // timer, contagem de coluna, valor agregado e placeholder. Ja era BLOQUEADOR desde 19/07
        // (REVIEW-KANBAN-V2 item B1) e a rodada seguinte deixou PIOR (o antecessor dava 2,68:1).
        //
        // `suave` teve que descer JUNTO, e isto nao e gosto: com `mute` obrigado a >= 4,5:1, a
        // janela entre "passar AA" (4,50) e o `suave` antigo (4,68 no board) era de 0,18 de razao —
        // invisivel. Manter `suave` colapsaria terciario e secundario na mesma cor. Alem disso o
        // `suave` antigo tambem reprovava sobre superficie de hover (4,49:1).
        //
        // Medido (script WCAG 2.x, relative luminance):
        //   suave #67707B -> #4E5763 : branco 5,02->7,32 · board 4,68->6,82 · hover 4,49->6,02
        //   mute  #9AA1AA -> #5F6873 : branco 2,61->5,65 · board 2,43->5,27 · hover 2,33->4,65
        // As tres superficies reais do app (branco, board #F7F7F4, hover #EAE9E3) passam AA.
        suave: "#4E5763", // --suave: secundário/labels da ficha
        mute: "#5F6873", // --pt: placeholder ("Selecione"), desabilitado, carimbos
        borda: { DEFAULT: "#E8E7E2", forte: "#DCDAD4" },
        verde: { DEFAULT: "#177A48", bg: "#EAF6EF", bd: "#BFE4CF" },
        vermelho: { DEFAULT: "#B3372B", bg: "#FBEBE4", bd: "#F1CDBF" },
        // ── W5 (22/08) · AS DUAS FAIXAS MAIS URGENTES DO CARD TINHAM COLAPSADO UMA NA OUTRA.
        //
        // A correcao AA da W4 puxou o ambar de #B27A00 para #8A5E00 — certo para TEXTO, e e por
        // isso que `DEFAULT` fica onde esta. Mas o MESMO hex pintava a BARRA de prioridade do card
        // (TRILHO_FAIXA.hoje) e a pastilha da legenda, ao lado do `vermelho` #B3372B da faixa
        // AGORA. Medido (WCAG 2.x, luminancia relativa):
        //
        //   #B3372B x #8A5E00 = 1,05:1   <<< a MESMA claridade. Nao e "parecido", e igual.
        //   sob deuteranopia (Vienot): #6F6F21 x #6D6D00 = 1,03:1 — o mesmo pixel.
        //
        // As duas faixas que a Sarah mais precisa separar em 3 segundos — "estourou" e "vence
        // hoje" — sairam do board indistinguiveis por cor. So o rotulo escrito segurava, e o
        // rotulo e o canal PRINCIPAL, nao o unico (o board se le varrendo).
        //
        // `barra` separa por LUMINANCIA, nao so por hue, e e o valor MAIS CLARO que ainda passa o
        // piso de 3:1 do SC 1.4.11 nas DUAS superficies reais onde a barra aparece:
        //
        //   #BE8200 : branco 3,29:1 · board #F7F7F4 3,07:1 · contra o vermelho #B3372B 1,82:1
        //             (era 1,05) · deuteranopia 1,70:1 (era 1,03) · protanopia 2,20:1 (era 1,29)
        //
        // O que muda de verdade sob CVD nao e so a razao, e o HUE: antes o par virava #6F6F21 x
        // #6D6D00 sob deuteranopia — mesma cor, ponto. Agora vira #6F6F21 x #979700, dois tons de
        // oliva com claridades diferentes. Nenhum par das quatro faixas colapsa mais nos DOIS
        // eixos (claridade E hue) ao mesmo tempo.
        //
        // Por que 1,82 e nao 3,00 contra o vermelho: com quatro faixas sobre fundo CLARO a escada
        // de 3:1 entre pares e impossivel — exigiria 27x de razao em (L+0,05), de 0,05 a 1,35, e o
        // proprio piso AA prende todas abaixo de L=0,30. Por isso o rotulo escrito continua sendo
        // o canal principal (WCAG 1.4.1), e a cor e o reforco.
        //
        // ⚠️ `barra` NAO serve para texto: 3,29:1 reprova o piso de 4,5:1. Texto ambar = `DEFAULT`.
        amarelo: { DEFAULT: "#8A5E00", barra: "#BE8200", bg: "#FBF3DF", bd: "#EAD9A6" }, // --ambar (W4: era #B27A00 / 3,45:1)
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
        heading: ["var(--fonte-inter)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"], // --fonte-dados
      },
      boxShadow: {
        // r9: superfície se separa por hairline, não por sombra — "suave"/"laranja" viram no-op
        suave: "none",
        forte: "0 4px 16px rgba(31,35,40,.10)", // exceção única: dropdown/menu aberto
        laranja: "none",
      },
      borderRadius: {
        // PRESET (10/09): escala do LiderHub (Figma Radius) via app/globals.css `--radius-*`.
        // Era sm 7 · md 10 · lg 16 — cravado aqui. Reverter = trocar estas 7 linhas.
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
        "4xl": "var(--radius-4xl)",
      },
      fontSize: {
        // PRESET (10/09): escala de UI do LiderHub (tokens/typography.css) — tamanho + entrelinha +
        // tracking juntos. `text-ui-13` no lugar de `text-[13px] leading-[18px]`.
        "ui-10": ["0.625rem", { lineHeight: "0.875rem" }],
        "ui-11": ["0.6875rem", { lineHeight: "0.9375rem" }],
        "ui-12": ["0.75rem", { lineHeight: "1rem" }],
        "ui-13": ["0.8125rem", { lineHeight: "1.125rem" }],
        "ui-14": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "-0.01em" }],
        h3: ["1.1875rem", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        h2: ["1.5rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        h1: ["2rem", { lineHeight: "1.08", letterSpacing: "-0.03em" }],
        display: ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
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
  plugins: [animate],
};

export default config;

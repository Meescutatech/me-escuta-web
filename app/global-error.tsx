"use client";

/**
 * ULTIMO ANTEPARO — erro no proprio root layout.
 *
 * Este boundary substitui o <html>/<body> inteiros, entao ele roda no exato cenario em que o resto
 * do app pode nao ter subido. POR ISSO ELE E ESCRITO EM ESTILO INLINE, sem Tailwind e sem nenhum
 * componente nosso: se o que quebrou foi o layout, a fonte ou o CSS global, uma tela pintada por
 * classe do Tailwind cai de volta no mesmo problema que estava tentando reportar. Aqui, feio e
 * garantido vale mais que bonito e condicional. Nao "melhore" trocando por classes.
 *
 * TEMA: o default do Next escurece com `prefers-color-scheme: dark` e o resto do sistema e claro —
 * era exatamente essa a queixa (tela preta em ingles). As cores aqui sao FIXAS e o `colorScheme:
 * "light"` impede o navegador de repintar widgets e barra de rolagem no escuro. A tela sai igual em
 * tema claro e escuro, de proposito.
 *
 * O SHA vem de NEXT_PUBLIC_SHA (next.config.mjs) inline, sem import, pela mesma razao acima.
 */

const CARIMBO = `${process.env.NEXT_PUBLIC_SHA ?? "local"} · ${process.env.NEXT_PUBLIC_AMBIENTE ?? "local"}`;

export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "40px 16px",
          background: "#F7F7F4",
          color: "#1F2328",
          colorScheme: "light",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div
            style={{
              border: "1px solid #E8E7E2",
              borderRadius: 10,
              background: "#FFFFFF",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <svg
                viewBox="0 0 96 100"
                fill="none"
                stroke="#EC662E"
                strokeWidth="9"
                strokeLinecap="round"
                aria-hidden="true"
                style={{ height: 34, width: 32, flexShrink: 0 }}
              >
                <path d="M12 62 C4 48 6 28 20 16 C34 5 56 5 67 17 C76 26 78 40 71 50 C66 58 58 61 54 68 C50 75 50 82 44 87 C37 93 27 90 24 83" />
                <path d="M34 48 C31 38 37 28 47 28 C56 28 61 36 58 43 C56 49 49 50 45 46" />
                <path d="M84 14 C92 23 92 37 85 46" />
              </svg>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  fontWeight: 800,
                  lineHeight: 0.9,
                  letterSpacing: "-0.02em",
                  color: "#252F63",
                }}
              >
                <span>me</span>
                <span>escuta</span>
              </span>
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 650,
                letterSpacing: "-0.01em",
                color: "#1F2328",
              }}
            >
              O sistema não conseguiu abrir
            </h1>
            {/* #4E5763 sobre #FFFFFF = 7,32:1 (token `suave` depois da correcao de contraste W4). */}
            <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "#4E5763" }}>
              A falha foi registrada. Recarregue a página; se continuar, mande o código abaixo para
              quem cuida do sistema.
            </p>

            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24,
                display: "inline-flex",
                alignItems: "center",
                border: 0,
                borderRadius: 10,
                background: "#EC662E",
                color: "#FFFFFF",
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Recarregar
            </button>

            <div
              style={{
                marginTop: 24,
                borderTop: "1px solid #E8E7E2",
                paddingTop: 16,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 11,
                color: "#5F6873",
              }}
            >
              <div>código: {error.digest ?? "sem código"}</div>
              <div>build: {CARIMBO}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

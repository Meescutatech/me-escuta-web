/**
 * ÍCONE DO JARVIS — uma faísca de quatro pontas com uma menor ao lado. É UM desenho só, usado na
 * sidebar (destino `/jarvis`) e no header (ato sobre a tela atual), para os dois pontos de entrada
 * se lerem como a mesma coisa. Mesma grade 24×24, stroke 1.8, cantos redondos dos ICONES do r9.
 */
export function IconeJarvis({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M10 4.5c.6 3.6 2.1 5.1 5.7 5.7-3.6.6-5.1 2.1-5.7 5.7-.6-3.6-2.1-5.1-5.7-5.7 3.6-.6 5.1-2.1 5.7-5.7z" />
      <path d="M18 14.5c.3 1.7 1 2.4 2.7 2.7-1.7.3-2.4 1-2.7 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.7z" />
    </svg>
  );
}

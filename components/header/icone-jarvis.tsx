import { MarcaJarvis } from "@/components/jarvis/marca";

/**
 * ÍCONE DO JARVIS = a MARCA escolhida pelo Diogo (22:40): o glifo `arco` de
 * `components/jarvis/marca.tsx` — um ponto e um arco fino por cima, escuta/atenção. Um desenho só
 * no header, na nav, na seção Agentes e no Mapa; o sparkles de "IA genérica" saiu do app.
 * Este arquivo fica só para os call sites antigos (`sidebar.tsx`, `jarvis-gatilho.tsx`,
 * `dashboard/jarvis-diz.tsx`) não mudarem de import.
 */
export function IconeJarvis({ className }: { className?: string }) {
  return <MarcaJarvis className={className} />;
}

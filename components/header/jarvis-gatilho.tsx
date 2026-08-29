"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconeJarvis } from "@/components/header/icone-jarvis";
import { hrefJarvis } from "@/lib/header/navegacao";

/**
 * O JARVIS SOBRE ESTA TELA — o gatilho que o slot `data-slot="jarvis"` do header esperava.
 *
 * Contrato com a F9: navega para `/jarvis?contexto=<pathname+search>` (`hrefJarvis`). É link, e
 * não overlay, porque a superfície do Jarvis é a página `/jarvis` — o que este botão acrescenta é
 * o CONTEXTO de onde a pessoa estava, que o item da sidebar não carrega.
 */
export function JarvisGatilho() {
  const pathname = usePathname();
  const search = useSearchParams();
  const href = hrefJarvis(pathname, search.toString());
  return (
    <Link
      href={href}
      aria-label="Abrir o Jarvis sobre esta tela"
      title="Jarvis sobre esta tela"
      className="flex h-8 w-8 items-center justify-center rounded-[6px] text-suave hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
    >
      <IconeJarvis className="h-[19px] w-[19px]" />
    </Link>
  );
}

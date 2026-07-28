"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sub-nav de Configurações — casca R10 (mockups `*-r10.html`, Croqui, 27/07).
 *
 * O que mudou em relação à R9, e o porquê de cada um:
 *  · os itens passam a ser AGRUPADOS. Lista plana de dez itens obriga a ler todos para achar um;
 *    quatro grupos curtos deixam o olho pular direto para a família certa.
 *  · o grupo OPERAÇÃO nasce só com o que alguém vai mexer nesta fase — grupo com item morto
 *    ensina que a tela tem coisas que não funcionam.
 *  · CONTADOR só quando significa DÉBITO (relatos abertos, em Suporte). O "10" de "Todas as
 *    configurações" é inventário, não pendência, e vive no cabeçalho da própria tela.
 *  · "Área de trabalho" e "Notificações", que eram `aria-disabled` com title="Em breve", SAÍRAM.
 *    Item morto na navegação é promessa que ninguém cobrou.
 *
 * O contador de Suporte do mockup NÃO está aqui, e é ausência declarada: este layout é `"use
 * client"` e não tem como ler o banco; buscá-lo pelo cliente custaria uma consulta por navegação em
 * Configurações para exibir um número. Ele vive no cabeçalho da própria tela de Suporte, onde o
 * servidor já leu a lista. Número na navegação é dívida — e dívida chutada é pior que nenhuma.
 */

const ATIVO =
  "mb-px flex items-center gap-2 rounded-md bg-[#EAECF5] px-2 py-1.5 text-[13.5px] font-semibold text-navy";
const INERTE =
  "mb-px flex items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] font-medium text-suave hover:bg-hover hover:text-tinta";

interface ItemNav {
  href: string;
  rotulo: string;
  /** ponto verde/cinza: estado do agente — só onde o estado É o dado principal do item. */
  ponto?: "on" | "off";
}

const GRUPOS: { rotulo: string; itens: ItemNav[] }[] = [
  { rotulo: "Configurações", itens: [{ href: "/configuracoes/membros", rotulo: "Membros" }] },
  { rotulo: "Agentes", itens: [{ href: "/configuracoes/clara", rotulo: "Clara", ponto: "on" }] },
  {
    rotulo: "Operação",
    itens: [
      { href: "/configuracoes/canais", rotulo: "Números de WhatsApp" },
      { href: "/configuracoes/funil", rotulo: "Funil de vendas" },
      { href: "/configuracoes/templates", rotulo: "Templates" },
    ],
  },
  {
    rotulo: "Avançado",
    itens: [
      { href: "/configuracoes/avancado", rotulo: "Todas as configurações" },
      { href: "/configuracoes/suporte", rotulo: "Suporte" },
    ],
  },
];

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const rota = usePathname();
  const ativo = (href: string) => rota === href || rota.startsWith(href + "/");

  return (
    <div className="flex min-h-[calc(100vh-var(--altura-topo))] bg-branco">
      <nav
        aria-label="Configurações"
        className="w-[224px] flex-none border-r border-linha bg-board px-3 pb-8 pt-6"
      >
        {GRUPOS.map((g) => (
          <div key={g.rotulo} className="mb-6 last:mb-0">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-suave">
              {g.rotulo}
            </div>
            {g.itens.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={ativo(i.href) ? "page" : undefined}
                className={ativo(i.href) ? ATIVO : INERTE}
              >
                {i.rotulo}
                {i.ponto ? (
                  <span
                    aria-hidden="true"
                    title={i.ponto === "on" ? "ativa" : "inativa"}
                    className={`ml-auto h-[7px] w-[7px] flex-none rounded-full ${
                      i.ponto === "on" ? "bg-verde" : "bg-mute"
                    }`}
                  />
                ) : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {/* A COLUNA de 720px é do layout, não de cada tela: Membros, Clara e Templates já contavam
          com ela, e a decisão do Orquestrador sobre o r10 manteve os 720px também no F9 — lá o
          que resolve a largura não é esticar a coluna, é a coluna de valor único sumir. */}
      {/* pb-[120px]: o respiro que o Croqui MEDIU para a barra de publicacao (sticky) pousar no
          fim da rolagem sem cobrir o campo "O que mudou" que fica logo acima dela. E a mesma
          familia do E-029 — camada de cima esconde produto —, so que aqui a camada e do produto. */}
      <main className="min-w-0 flex-1 px-12 pb-[120px] pt-11 max-md:px-5 max-md:pt-8">
        <div className="max-w-[720px]">{children}</div>
      </main>
    </div>
  );
}

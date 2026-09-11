/**
 * NAVEGAÇÃO — o que a sidebar lista, o que o menu do avatar oferece e para onde o Jarvis leva.
 *
 * F4 (27/08). Fica em `lib/` e não dentro dos componentes porque é a parte que se PROVA por teste
 * sem montar React: a lista de itens, a ordem, o que saiu do menu e o contrato do parâmetro
 * `contexto`. O componente só desenha o que sai daqui.
 *
 * O que MUDOU em relação ao menu de 22/08, e cada linha é decisão do plano da rodada:
 *  · `Jarvis` entra ACIMA de `Dashboard` — é o item nº 1 porque é o que o sistema faz que o Kommo
 *    não fazia; `Visão geral` vira `Dashboard` (mesmo nome aqui e em `titulos.ts`).
 *  · `Fila de validação`, `Configurações` e `Relatar problema` SAEM do menu. A rota `/fila` continua
 *    existindo (quem tem a URL chega); Configurações passa a viver no menu do avatar; Relatar
 *    problema fica só no header, que é onde o relato nasce sabendo a tela.
 *  · O rodapé "admin · Sair" sai da sidebar: identidade é header (regra do §4.1), e Sair mora no
 *    menu do avatar.
 */

export type ItemSidebar = {
  href: string;
  rotulo: string;
  icone: "jarvis" | "dashboard" | "funil" | "conversas" | "tarefas" | "marketing";
  ativa: boolean;
  /** contador já formatado em pt-BR; null = sem chip */
  cont: string | null;
  /** cor do chip/ponto: chip laranja = não-lidas; vermelho = tarefa vencida; neutro = total */
  tom: "neutro" | "laranja" | "vermelho";
  /** ponto no canto do ícone quando a sidebar está colapsada */
  ponto: boolean;
};

export function itensSidebar({
  pathname,
  contFunil,
  contNaoLidas,
  contVencidas,
  verMarketing = false,
}: {
  pathname: string;
  contFunil: number | null;
  contNaoLidas: number | null;
  contVencidas: number | null;
  verMarketing?: boolean;
}): ItemSidebar[] {
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const itens: ItemSidebar[] = [
    // 11/09 · A ABA JARVIS SAIU. Ele deixou de ser um lugar para onde se vai: mora no centro do
    // header, em toda tela, e responde ali mesmo (`ArcoHeader` + `⌘K`). A ROTA `/jarvis` continua
    // existindo — quem tem o link chega, e a tela de melhoria de prompt da Clara vive lá — mas
    // navegação que oferece um destino para quem já está com ele na tela é ruído.
    { href: "/", rotulo: "Dashboard", icone: "dashboard", ativa: pathname === "/", cont: null, tom: "neutro", ponto: false },
    {
      href: "/funil",
      rotulo: "Funil",
      icone: "funil",
      ativa: pathname.startsWith("/funil"),
      cont: contFunil != null ? fmt(contFunil) : null,
      tom: "neutro",
      ponto: false,
    },
    {
      href: "/conversas",
      rotulo: "Conversas",
      icone: "conversas",
      ativa: pathname.startsWith("/conversas"),
      cont: contNaoLidas != null && contNaoLidas > 0 ? fmt(contNaoLidas) : null,
      tom: "laranja",
      ponto: contNaoLidas != null && contNaoLidas > 0,
    },
    {
      // contador SÓ de vencidas: no Kommo a fila vermelha tinha 755 itens e ninguém olhava;
      // aqui o número só aparece quando existe débito — e zero é silêncio, não "0".
      href: "/tarefas",
      rotulo: "Tarefas",
      icone: "tarefas",
      ativa: pathname.startsWith("/tarefas"),
      cont: contVencidas != null && contVencidas > 0 ? fmt(contVencidas) : null,
      tom: "vermelho",
      ponto: contVencidas != null && contVencidas > 0,
    },
  ];
  // W-D2 (10/09, 23:00 — pedido do Diogo, item B): "Marketing" SAIU da sidebar. O conteúdo virou a
  // aba Marketing do dashboard (`/?aba=marketing`, W-D4) e `/marketing` só redireciona para lá. O
  // parâmetro `verMarketing` fica na assinatura por compatibilidade com os call sites e os testes:
  // quem pode ver marketing continua chegando pelo dashboard, que já sabe filtrar por papel.
  void verMarketing;
  return itens;
}

/**
 * CONTRATO COM A F9: o botão do Jarvis no header navega para `/jarvis?contexto=<rota atual>`, e o
 * parâmetro chama-se `contexto` — é a rota (pathname + query) da tela de onde a pessoa veio, para
 * o Jarvis abrir já sabendo sobre o que ela estava olhando.
 */
export const PARAM_CONTEXTO_JARVIS = "contexto";

export function hrefJarvis(pathname: string, search: string = ""): string {
  const q = search && !search.startsWith("?") ? `?${search}` : search;
  const contexto = `${pathname || "/"}${q}`;
  return `/jarvis?${PARAM_CONTEXTO_JARVIS}=${encodeURIComponent(contexto)}`;
}

/** Relatar problema: o `?de=` leva a rota REAL (contrato do M5, mantido). */
export function hrefRelatarProblema(pathname: string): string {
  return `/suporte?de=${encodeURIComponent(pathname || "/")}`;
}

/** Menu do avatar, na ordem em que aparece. `Sair` é form POST na rota de signout existente. */
export const ROTA_SIGNOUT = "/auth/signout";
export const ITENS_MENU_CONTA = [
  { id: "configuracoes", rotulo: "Configurações", href: "/configuracoes" },
  { id: "sair", rotulo: "Sair", href: ROTA_SIGNOUT },
] as const;

/** Linha secundária de departamentos do menu do avatar. */
export function linhaDepartamentos(rotulos: string[]): string {
  return rotulos.length === 0
    ? "Sem vínculo — vendo todos, menos o clínico"
    : rotulos.join(" · ");
}

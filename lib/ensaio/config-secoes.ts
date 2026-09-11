/**
 * AS SEÇÕES DE CONFIGURAÇÕES — fonte única da navegação lateral.
 *
 * Refeita em 11/09 (baia W-C). O Diogo, 22:50: a estrutura anterior "está sem sentido, está ruim;
 * muda, troca tudo". O que mudou, e por quê:
 *
 *  · **Morreu a página-índice.** `/configuracoes` redireciona para Membros. Não existe hub: a nav
 *    É a navegação. Medido: nem o Twenty (`SettingsRoutes.tsx` sem rota-índice; `/settings` cai em
 *    Perfil) nem o LiderHub (`lib/settings-nav.ts`) têm índice. O que o hub mostrava — o estado de
 *    cada seção — passou para a própria nav (`EstadoSecao`).
 *  · **"Departamentos e cargos" virou "Cargos".** O departamento é como o BANCO guarda escopo
 *    (D91); o cargo é como uma pessoa fala. A árvore continua na tela, como sub-seção discreta.
 *  · **Meta/WhatsApp saiu de Canais e virou "Conexões", dentro de Inteligência.** Canais fica só
 *    com os números; conexão é o encanamento que alimenta os agentes.
 *
 * ⚠️ 11/09/2026, 16:00 — O DIOGO CORTOU A NAV PARA CINCO ITENS. Saíram Cargos, Mapa, Claude,
 * Conexões, Regras e SLAs, Eventos e o grupo Sistema inteiro (Geral, Identidades, Suporte,
 * Auditoria). Motivo: todas redirecionavam ou mostravam fixture fora do ensaio — item de menu que
 * não leva a lugar nenhum é pior que item ausente, porque ensina a não confiar no menu.
 * As ROTAS continuam existindo: quem tem o link chega. O que saiu foi a promessa na navegação.
 * Quando cada uma ganhar leitura real, volta para cá — e as que sobreviveram absorveram as
 * vizinhas em `tambem`, para o item certo acender se alguém chegar pela rota antiga.
 *
 * Detalhe do benchmark que NÃO copiamos: Twenty e LiderHub marcam o item ativo só com fundo. Numa
 * lista de 14 itens isso não se acha de relance — por isso a barra `primary` de 2px à esquerda.
 */
export type IconeSecao =
  | "membros" | "cargos"
  | "numeros"
  | "mapa" | "agentes" | "claude" | "conexoes"
  | "funil" | "templates" | "regras" | "eventos"
  | "geral" | "identidades" | "suporte" | "auditoria";

export interface SecaoConfig {
  href: string;
  rotulo: string;
  /** O que a tela DECIDE — não o que ela lista. Vira a descrição no cabeçalho da tela. */
  descricao: string;
  icone: IconeSecao;
  /** outras rotas que acendem esta seção na navegação */
  tambem?: string[];
  /** ainda não existe — aparece apagado, com "em breve" */
  emBreve?: boolean;
}

export const GRUPOS_CONFIG: { rotulo: string; secoes: SecaoConfig[] }[] = [
  {
    rotulo: "Pessoas",
    secoes: [
      {
        href: "/configuracoes/membros",
        rotulo: "Membros",
        descricao: "Quem entra no sistema e com que cargo. O convite é um link: a pessoa abre, escolhe a senha e já cai no lugar certo.",
        icone: "membros",
        tambem: ["/configuracoes/cargos", "/configuracoes/departamentos"],
      },
    ],
  },
  {
    rotulo: "Canais",
    secoes: [
      {
        href: "/configuracoes/canais",
        rotulo: "Números conectados",
        descricao: "Os WhatsApps por onde a empresa fala: o oficial e os celulares que a equipe pareia. Quem é dona de cada um e quem responde por ele.",
        icone: "numeros",
      },
    ],
  },
  {
    rotulo: "Inteligência",
    secoes: [
      {
        href: "/configuracoes/agentes",
        rotulo: "Agentes",
        descricao: "Clara, Jarvis, Levindo e Priscila: o que cada um faz sozinho, o que propõe e o que a Constituição não deixa automatizar.",
        icone: "agentes",
        tambem: ["/configuracoes/clara", "/configuracoes/inteligencia", "/configuracoes/claude"],
      },
    ],
  },
  {
    rotulo: "Operação",
    secoes: [
      {
        href: "/configuracoes/funil",
        rotulo: "Funil e etapas",
        descricao: "As etapas, a ordem, o prazo de cada uma e os motivos de perda.",
        icone: "funil",
        tambem: ["/configuracoes/regras"],
      },
      {
        href: "/configuracoes/templates",
        rotulo: "Mensagens prontas",
        descricao: "O que o composer oferece com barra — e quais dessas mensagens a Meta já aprovou.",
        icone: "templates",
      },
    ],
  },
];

export const TODAS_SECOES: SecaoConfig[] = GRUPOS_CONFIG.flatMap((g) => g.secoes);

export function secaoPorRota(rota: string): SecaoConfig | null {
  return (
    TODAS_SECOES.find((s) => rota === s.href || rota.startsWith(s.href + "/")) ??
    TODAS_SECOES.find((s) => (s.tambem ?? []).some((t) => rota === t || rota.startsWith(t + "/"))) ??
    null
  );
}

/**
 * O ESTADO de cada seção, que aparece em muted à direita do item da nav.
 *
 * É o que o índice do hub mostrava — e é por tê-lo aqui que o hub deixou de ser necessário. Vale a
 * regra do Twenty (`NavigationDrawerItem.tsx:414`): à direita cabe UMA coisa curta. `atencao` pinta
 * o texto de âmbar; não existe badge vermelho de contagem, que foi o vício do Kommo (755 tarefas
 * em vermelho que ninguém olhava).
 */
export interface EstadoSecao {
  texto: string;
  atencao?: boolean;
}

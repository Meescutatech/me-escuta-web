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
      },
      {
        href: "/configuracoes/cargos",
        rotulo: "Cargos",
        descricao: "Cada cargo amarra papel, departamento e telas. Quem convida escolhe um cargo — nunca dois campos soltos.",
        icone: "cargos",
        tambem: ["/configuracoes/departamentos"],
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
        href: "/configuracoes/inteligencia",
        rotulo: "Mapa",
        descricao: "Quem propõe para quem: números, agentes, quem valida e o que sai — num desenho só.",
        icone: "mapa",
      },
      {
        href: "/configuracoes/agentes",
        rotulo: "Agentes",
        descricao: "Clara, Jarvis, Levindo e Priscila: o que cada um faz sozinho, o que propõe e o que a Constituição não deixa automatizar.",
        icone: "agentes",
        tambem: ["/configuracoes/clara", "/configuracoes/agentes/jarvis"],
      },
      {
        href: "/configuracoes/claude",
        rotulo: "Claude",
        descricao: "Conectar o Claude à Me Escuta com o seu login — e o que o seu cargo consegue fazer por lá.",
        icone: "claude",
      },
      {
        href: "/configuracoes/conexoes",
        rotulo: "Conexões",
        descricao: "O encanamento que alimenta os agentes: Meta, WhatsApp Lite, Kommo, Resend e o MCP. O que está de pé e o que não está.",
        icone: "conexoes",
        tambem: ["/configuracoes/meta", "/configuracoes/integracoes"],
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
      },
      {
        href: "/configuracoes/templates",
        rotulo: "Mensagens prontas",
        descricao: "O que o composer oferece com barra — e quais dessas mensagens a Meta já aprovou.",
        icone: "templates",
      },
      {
        href: "/configuracoes/regras",
        rotulo: "Regras e SLAs",
        descricao: "Prazo por etapa, janela de 24 h, horário de atendimento e a régua de cobrança.",
        icone: "regras",
      },
      {
        href: "/configuracoes/eventos",
        rotulo: "Eventos",
        descricao: "O vocabulário do ledger e quem pode registrar cada tipo.",
        icone: "eventos",
        emBreve: true,
      },
    ],
  },
  {
    rotulo: "Sistema",
    secoes: [
      {
        href: "/configuracoes/geral",
        rotulo: "Geral",
        descricao: "Nome, marca, cidade e fuso horário da empresa.",
        icone: "geral",
      },
      {
        href: "/configuracoes/identidades",
        rotulo: "Identidades",
        descricao: "O de-para entre as pessoas daqui e as contas do Kommo. Enquanto sobrar conta sem decisão, o backfill não roda.",
        icone: "identidades",
      },
      {
        href: "/configuracoes/suporte",
        rotulo: "Suporte",
        descricao: "Os relatos de quem usa o sistema, com a tela de onde vieram.",
        icone: "suporte",
      },
      {
        href: "/configuracoes/auditoria",
        rotulo: "Auditoria e histórico",
        descricao: "Toda configuração publicada, com quem publicou, quando e o que mudou — e o caminho de voltar uma versão.",
        icone: "auditoria",
        tambem: ["/configuracoes/avancado"],
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

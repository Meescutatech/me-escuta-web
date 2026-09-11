/**
 * As seções do hub de Configurações — fonte única para a navegação lateral (layout, client) e o
 * índice em linhas (page, server). Estrutura fechada pelo Diogo em 10/09 (22:00), pensada para
 * CRESCER: cada grupo tem nome claro e aceita item novo sem virar balde ("Eventos" já está lá
 * como placeholder de propósito).
 */
export type IconeSecao =
  | "membros" | "departamentos"
  | "numeros" | "meta"
  | "mapa" | "agentes" | "claude"
  | "funil" | "templates" | "regras" | "eventos"
  | "geral" | "identidades" | "suporte" | "auditoria";

export interface SecaoConfig {
  href: string;
  rotulo: string;
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
      { href: "/configuracoes/membros", rotulo: "Membros", descricao: "Quem entra, o papel de cada pessoa e o que ela fez no sistema.", icone: "membros" },
      { href: "/configuracoes/departamentos", rotulo: "Departamentos e cargos", descricao: "A árvore de departamentos, quem está lotado em cada um e quem é gestor.", icone: "departamentos" },
    ],
  },
  {
    rotulo: "Canais",
    secoes: [
      { href: "/configuracoes/canais", rotulo: "Números conectados", descricao: "Os WhatsApps pelos quais a empresa fala — o oficial e os celulares pareados.", icone: "numeros" },
      { href: "/configuracoes/meta", rotulo: "Meta / WhatsApp", descricao: "O app da Meta: conta comercial, webhook, qualidade do número e o servidor do Lite.", icone: "meta", tambem: ["/configuracoes/integracoes"] },
    ],
  },
  {
    rotulo: "Inteligência",
    secoes: [
      { href: "/configuracoes/inteligencia", rotulo: "Mapa", descricao: "Quem propõe para quem: números, agentes, quem valida e o que sai — num desenho só.", icone: "mapa" },
      { href: "/configuracoes/agentes", rotulo: "Agentes", descricao: "Clara, Jarvis, Levindo e Priscila: estado, prompt e a régua de autonomia por tipo de ação.", icone: "agentes", tambem: ["/configuracoes/clara", "/configuracoes/agentes/jarvis"] },
      { href: "/configuracoes/claude", rotulo: "Claude (MCP)", descricao: "Conectar o Claude à Me Escuta com o seu login — o que cada cargo consegue fazer por lá.", icone: "claude" },
    ],
  },
  {
    rotulo: "Operação",
    secoes: [
      { href: "/configuracoes/funil", rotulo: "Funil e etapas", descricao: "As etapas do funil, a ordem e os motivos de perda.", icone: "funil" },
      { href: "/configuracoes/templates", rotulo: "Templates e respostas rápidas", descricao: "As mensagens prontas que o composer oferece com /.", icone: "templates" },
      { href: "/configuracoes/regras", rotulo: "Regras e SLAs", descricao: "Prazo por etapa, janela de 24 h, horário de atendimento e a régua de cobrança.", icone: "regras" },
      { href: "/configuracoes/eventos", rotulo: "Eventos", descricao: "O vocabulário do ledger e quem pode registrar cada tipo — em breve.", icone: "eventos", emBreve: true },
    ],
  },
  {
    rotulo: "Sistema",
    secoes: [
      { href: "/configuracoes/geral", rotulo: "Geral", descricao: "Nome, marca e fuso horário da empresa.", icone: "geral" },
      { href: "/configuracoes/identidades", rotulo: "Identidades", descricao: "O de-para entre as pessoas daqui e as contas do Kommo e do WhatsApp.", icone: "identidades" },
      { href: "/configuracoes/suporte", rotulo: "Suporte", descricao: "Relatos abertos por quem usa, com a tela de onde vieram.", icone: "suporte" },
      { href: "/configuracoes/avancado", rotulo: "Auditoria e histórico", descricao: "Toda configuração publicada, com quem publicou, quando e o diff.", icone: "auditoria" },
    ],
  },
];

export const TODAS_SECOES: SecaoConfig[] = GRUPOS_CONFIG.flatMap((g) => g.secoes);

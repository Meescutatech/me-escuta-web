/**
 * FONTE ÚNICA ROTA → TÍTULO. Nenhuma página escreve o seu.
 *
 * Hoje o nome da tela existe **15 vezes, em 3 tipografias** (SPEC-M6 §2.8), uma delas a Fraunces
 * que o `r9-tokens.md` §7.1 mandou apagar do app inteiro e que sobreviveu exatamente nas 3 rotas
 * fora do menu. O header não acrescenta um elemento novo: consolida os 15 num só.
 *
 * Não é tabela e não é `core.config`: é configuração de INTERFACE, e criar linha de banco para 10
 * strings seria cerimônia sem ganho. Mas é UM lugar, que é o que a Constituição §4 quer dizer aqui.
 *
 * O título é contexto INTERNO — qual recorte do escopo estou vendo. O contexto EXTERNO é o
 * departamento, e por isso ele vem à esquerda dele: lido da esquerda para a direita, "Comercial →
 * Funil de vendas" é a frase verdadeira. O inverso sugeriria que o departamento é atributo do
 * funil, e ele não é: é o escopo.
 */

/**
 * Rota fora do mapa devolve VAZIO, nunca a rota crua na cara do usuário.
 *
 * E "vazio" não é buraco: é o caso de telas cujo título é o NOME DE UMA ENTIDADE, não o nome de um
 * lugar — `/lead/<id>` mostra o nome do lead, e esse `h1` é da página por direito. O header ficar
 * calado ali é o que mantém a invariante de **um `h1` por documento** (C4) sem o header ter de
 * conhecer o dado de ninguém.
 */
const MAPA: Record<string, string> = {
  "/": "Dashboard",
  "/funil": "Funil de vendas",
  "/conversas": "Conversas",
  "/tarefas": "Tarefas",
  "/notificacoes": "Notificações",
  "/fila": "Fila de sugestões",
  "/timeline": "Timeline do ledger",
  "/jarvis": "Jarvis",
  // D12 — `/agentes` vira destino de primeiro nível, e a rota é entregável do M2. A entrada aqui é
  // INERTE enquanto a rota não existir: um mapa que já sabe o nome não obriga ninguém a voltar
  // aqui, e um nome errado é o tipo de coisa que nasce quando dois itens batizam a mesma tela.
  // O que NÃO entra junto é a contagem de 405: ARB-R17-33 — número só entra no header se uma
  // pessoa conseguir zerá-lo numa sessão, e 405 com 9 dias de idade é mutirão, não sino.
  "/agentes": "Agentes",
  // Um nome por tela, e é o MESMO da nav lateral (`lib/ensaio/config-secoes.ts`): o item da nav, o
  // H1 e o título do header não podem divergir — é o mesmo lugar visto de três ângulos.
  "/configuracoes": "Configurações",
  "/configuracoes/membros": "Membros",
  "/configuracoes/cargos": "Cargos",
  "/configuracoes/departamentos": "Cargos",
  "/configuracoes/canais": "Números conectados",
  "/configuracoes/inteligencia": "Mapa",
  "/configuracoes/agentes": "Agentes",
  "/configuracoes/clara": "Agentes",
  "/configuracoes/agentes/jarvis": "Agentes",
  "/configuracoes/claude": "Claude",
  "/configuracoes/conexoes": "Conexões",
  "/configuracoes/meta": "Conexões",
  "/configuracoes/funil": "Funil e etapas",
  "/configuracoes/templates": "Mensagens prontas",
  "/configuracoes/regras": "Regras e SLAs",
  "/configuracoes/geral": "Geral",
  "/configuracoes/identidades": "Identidades",
  "/configuracoes/auditoria": "Auditoria e histórico",
  "/configuracoes/avancado": "Auditoria e histórico",
  "/configuracoes/suporte": "Suporte",
};

/** Casa a rota mais ESPECÍFICA primeiro — `/configuracoes/membros` antes de `/configuracoes`. */
export function lerTituloDaRota(pathname: string): string {
  const rota = (pathname || "/").replace(/\/+$/, "") || "/";
  if (MAPA[rota]) return MAPA[rota];
  const candidatas = Object.keys(MAPA)
    .filter((k) => k !== "/" && (rota === k || rota.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length);
  return candidatas.length ? MAPA[candidatas[0]] : "";
}

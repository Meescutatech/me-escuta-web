import type { MembroEnsaio, PapelNoDepartamento, PapelWorkspace, VinculoDepartamento } from "./membros";

/**
 * CARGOS — o conceito que o Diogo fechou em 10/09 às 22:50.
 *
 * Ninguém escolhe departamento. A pessoa escolhe o CARGO, e papel do workspace + departamento +
 * telas visíveis vêm junto, amarrados. "Papel: Membro · Departamentos: Pré-venda (gestora)" é
 * como o BANCO guarda; "SDR" é como uma pessoa fala.
 *
 * Não existe (nem deve existir) tabela `core.cargo`: o cargo é a LEITURA de `core.usuario.papel`
 * + `core.usuario_departamento`, que é o que a D91 travou. Por isso `cargoDe()` deriva, e o
 * catálogo abaixo é config — crescer a lista não muda schema nenhum.
 *
 * Os nove perfis do PRD (§14.1, PRD:2867) estão todos aqui: quatro ATIVOS porque são os quatro
 * que existem na operação hoje, e o resto DISPONÍVEL — aparece na tela em cinza, para o PRD ser
 * visível sem virar promessa. O `Marketing` é o único que não vem do PRD: nasceu do papel
 * `marketing` da migration 0250.
 *
 * Cada cargo é descrito pela CONSEQUÊNCIA, não por matriz de checkbox — é o desenho do LiderHub
 * (`lib/team-format.ts:8-9`: "Vê e responde apenas às conversas às quais está associado"), que
 * foi o melhor achado do benchmark.
 */

export interface Cargo {
  chave: string;
  /** Como a pessoa chama: "SDR", "Fono". */
  nome: string;
  /** Uma frase: o que essa pessoa faz na operação. */
  resumo: string;
  /** O que o banco grava — `core.usuario.papel`. Mais de um quando o cargo cobre dois. */
  papeis: PapelWorkspace[];
  /** `core.usuario_departamento` — null quando o cargo não lota em lugar nenhum. */
  departamento: string | null;
  papel_no_departamento: PapelNoDepartamento | null;
  /** O que ela VÊ, em frases — a "permissão efetiva". */
  ve: string[];
  /** O que fica ESCONDIDO dela (Diogo 22:50: dashboard, configurações e "todos os números"). */
  esconde: string[];
  /** Telas da sidebar que o cargo alcança. */
  telas: string[];
  /** O que o Jarvis faz por quem tem este cargo. */
  jarvis: string;
  /** Ativo = tem gente hoje. Disponível = está no PRD e espera a primeira pessoa. */
  ativo: boolean;
  /** O nome no PRD §14.1, quando houver. */
  prd: string | null;
  /** Quando outro cargo cobre este hoje. */
  cobertoPor?: string;
}

export const CARGOS: Cargo[] = [
  {
    chave: "dono",
    nome: "Dono",
    resumo: "Responde pela empresa inteira: vê tudo, publica configuração e convida gente.",
    papeis: ["owner", "admin"],
    departamento: null,
    papel_no_departamento: null,
    ve: [
      "Todos os departamentos, inclusive o Clínico",
      "Todos os números e todas as conversas",
      "Os números da empresa — funil, marketing, cobrança",
    ],
    esconde: [],
    telas: ["Jarvis", "Dashboard", "Funil", "Conversas", "Tarefas", "Configurações"],
    jarvis: "Recebe o que não tem dono nem gestora — é o último degrau da cadeia de destino.",
    ativo: true,
    prd: "Admin master · COO/diretoria",
  },
  {
    chave: "sdr",
    nome: "SDR",
    resumo: "Qualifica quem chega: atende a primeira conversa, agenda a audiometria e move o funil.",
    papeis: ["membro"],
    departamento: "pre_venda",
    papel_no_departamento: "gestor",
    ve: [
      "Os leads e conversas de Pré-venda e dos departamentos abaixo dela",
      "O próprio número e o número oficial da empresa",
      "O funil inteiro de Pré-venda, com valor e etapa",
    ],
    esconde: ["Clínico — laudo, anamnese e evolução", "Configurações", "Os números das outras áreas"],
    telas: ["Jarvis", "Dashboard", "Funil", "Conversas", "Tarefas"],
    jarvis: "Cria tarefa dos leads de que ela é dona e, por ser gestora, das que chegam sem dono em Pré-venda.",
    ativo: true,
    prd: "Comercial / SDR",
  },
  {
    chave: "fono",
    nome: "Fono",
    resumo: "Atende os próprios pacientes pelo próprio número: consulta, adaptação e retorno.",
    papeis: ["membro"],
    departamento: "clinico",
    papel_no_departamento: "membro",
    ve: [
      "Os pacientes dela — histórico clínico e conversas",
      "O número dela, que ela mesma pareia e liga",
      "As tarefas dos pacientes dela",
    ],
    esconde: ["Dashboard da empresa", "Configurações", "Os números das outras pessoas", "Cobrança e crédito"],
    telas: ["Conversas", "Tarefas", "Meu número"],
    jarvis: "Cria tarefa de retorno e de adaptação dos pacientes dela — nunca de cobrança.",
    ativo: true,
    prd: "Fonoaudióloga",
  },
  {
    chave: "marketing",
    nome: "Marketing",
    resumo: "Cuida de onde o lead vem: campanha, custo por lead e a origem de cada conversa.",
    papeis: ["marketing"],
    departamento: null,
    papel_no_departamento: null,
    ve: ["Captação, origem e custo de mídia", "Os relatórios do funil, sem nome de paciente"],
    esconde: ["Conversas", "Pacientes e dado clínico", "Configurações"],
    telas: ["Dashboard · Marketing"],
    jarvis: "Não cria tarefa para marketing — responde pergunta sobre mídia e origem.",
    ativo: true,
    prd: null,
  },
  {
    chave: "pos_venda",
    nome: "Pós-venda",
    resumo: "Acompanha quem já comprou: adesão, uso do aparelho e assistência.",
    papeis: ["membro"],
    departamento: "pos_venda",
    papel_no_departamento: "membro",
    ve: ["O clínico do próprio paciente", "A venda, sem poder editar", "Do financeiro, só o status de inadimplência"],
    esconde: ["O detalhe da cobrança", "Crédito e bureau", "Configurações"],
    telas: ["Conversas", "Tarefas", "Funil de pós-venda"],
    jarvis: "Cria tarefa de retorno e de risco de abandono.",
    ativo: false,
    prd: "Pós-venda",
  },
  {
    chave: "administrativo",
    nome: "Administrativo",
    resumo: "Nota fiscal, logística e conciliação — o que faz o aparelho sair e a venda fechar no papel.",
    papeis: ["membro"],
    departamento: "pos_venda",
    papel_no_departamento: "membro",
    ve: ["NF, conciliação, Asaas e Omie", "Endereço de entrega e rastreio"],
    esconde: ["Laudo, anamnese e evolução", "Conversas de pré-venda"],
    telas: ["Tarefas", "Logística"],
    jarvis: "Cria tarefa de emissão e de rastreio parado.",
    ativo: false,
    prd: "Administrativo",
  },
  {
    chave: "financeiro",
    nome: "Financeiro",
    resumo: "Cobrança, régua e inadimplência.",
    papeis: ["membro"],
    departamento: "cobranca",
    papel_no_departamento: "membro",
    ve: ["A operação financeira inteira", "As condições comerciais da venda"],
    esconde: ["Clínico", "Conversas fora de Cobrança"],
    telas: ["Tarefas", "Cobrança"],
    jarvis: "Cria tarefa da régua de cobrança — nunca renegocia sozinho (Constituição §1.2).",
    ativo: false,
    prd: "Financeiro",
  },
  {
    chave: "dev",
    nome: "Dev / suporte",
    resumo: "Constrói e conserta o sistema. Enxerga o dado mascarado por padrão.",
    papeis: ["admin"],
    departamento: null,
    papel_no_departamento: null,
    ve: ["A operação inteira, com PII mascarada por padrão", "Auditoria, eventos e configuração publicada"],
    esconde: [],
    telas: ["tudo, mais Configurações › Sistema"],
    jarvis: "Não recebe tarefa de operação.",
    ativo: false,
    prd: "Dev / suporte",
    cobertoPor: "dono",
  },
  {
    chave: "auditor",
    nome: "Auditor",
    resumo: "Lê e registra. Não edita nada, em lugar nenhum.",
    papeis: ["membro"],
    departamento: null,
    papel_no_departamento: null,
    ve: ["Tudo, em leitura", "O log de acesso e de edição"],
    esconde: ["Toda escrita — não existe botão de salvar para este cargo"],
    telas: ["Dashboard", "Funil", "Auditoria"],
    jarvis: "Não recebe tarefa.",
    ativo: false,
    prd: "Auditor",
  },
  {
    chave: "head_fono",
    nome: "Head de fonoaudiologia",
    resumo: "Lidera as fonos parceiras: vê o clínico de todos os pacientes, não só dos dela.",
    papeis: ["membro"],
    departamento: "clinico",
    papel_no_departamento: "gestor",
    ve: ["O clínico de TODOS os pacientes e a jornada deles", "As fonos e a carga de cada uma"],
    esconde: ["Dunning e bureau de terceiros"],
    telas: ["Conversas", "Tarefas", "Clínico"],
    jarvis: "Recebe as tarefas clínicas sem dono e valida a Irani.",
    ativo: false,
    prd: "Fonoaudióloga com escopo ampliado (PRD:2936)",
  },
];

export const CARGOS_ATIVOS = CARGOS.filter((c) => c.ativo);
export const CARGOS_DISPONIVEIS = CARGOS.filter((c) => !c.ativo);

export function cargoPorChave(chave: string | null | undefined): Cargo | null {
  return CARGOS.find((c) => c.chave === chave) ?? null;
}

/**
 * O cargo de uma pessoa, DERIVADO de papel + lotação — nunca lido de uma coluna.
 *
 * A ordem importa: procura primeiro o cargo ativo cujo papel E departamento batem; depois só
 * pelo papel (quem não tem lotação). Casa `papel_no_departamento` quando o cargo exige gestor.
 * Sem casamento devolve `null`, e a tela mostra o papel cru — mentir o cargo é pior que não ter.
 */
export function cargoDe(pessoa: { papel: PapelWorkspace; departamentos: VinculoDepartamento[] }): Cargo | null {
  const comDepto = CARGOS_ATIVOS.find(
    (c) =>
      c.papeis.includes(pessoa.papel) &&
      c.departamento !== null &&
      pessoa.departamentos.some((v) => v.departamento === c.departamento),
  );
  if (comDepto) return comDepto;
  return (
    CARGOS_ATIVOS.find((c) => c.papeis.includes(pessoa.papel) && c.departamento === null && pessoa.departamentos.length === 0) ??
    null
  );
}

/** Quantas pessoas ativas têm este cargo hoje. */
export function pessoasNoCargo(cargo: Cargo, membros: MembroEnsaio[]): MembroEnsaio[] {
  return membros.filter((m) => m.ativo && cargoDe(m)?.chave === cargo.chave);
}

/**
 * O que o convite grava quando alguém escolhe um cargo — é isto que a D91 R5 manda no payload
 * (`porta.criar_convite(..., departamentos: [{departamento, papel_no_departamento}])`).
 */
export function conviteDoCargo(cargo: Cargo): { papel: Exclude<PapelWorkspace, "owner">; departamentos: VinculoDepartamento[] } {
  // `owner` não nasce de convite — o cargo Dono entra como `admin`, que é o que a porta aceita
  // (`PAPEIS_CONVIDAVEIS` em `lib/membros.ts`). Sem este degrau a tela ofereceria uma escolha que o
  // banco recusa.
  const primeiro = cargo.papeis[0];
  const papel = primeiro === "owner" ? ("admin" as const) : primeiro;
  return {
    papel,
    departamentos:
      cargo.departamento && cargo.papel_no_departamento
        ? [{ departamento: cargo.departamento, papel_no_departamento: cargo.papel_no_departamento }]
        : [],
  };
}

export interface PermissoesEfetivas {
  ve: string[];
  faz: string[];
  jarvis: string;
  naoAlcanca: string[];
}

/**
 * AS PERMISSÕES EFETIVAS de uma pessoa, em português — não em matriz de checkbox.
 *
 * O benchmark tentou os dois caminhos e nenhum serve aqui: o Intercom dá checkbox por recurso
 * colapsado (intercom.com/help/articles/280) e o Twenty dá matriz campo × See/Update
 * (`...ObjectFieldPermissionTableRow.tsx`). Os dois respondem "qual bit está ligado"; quem abre
 * este painel quer responder outra pergunta — "o que essa pessoa consegue fazer amanhã de manhã".
 * O molde é o do LiderHub, que descreve o papel pela consequência (`lib/team-format.ts:8-9`).
 *
 * É derivado do cargo MAIS o que é específico da pessoa (ser gestora, ter número próprio), porque
 * duas pessoas no mesmo cargo não têm o mesmo alcance.
 */
export function permissoesEfetivas(
  pessoa: { papel: PapelWorkspace; departamentos: VinculoDepartamento[] },
  opcoes: { rotuloDepartamento?: (c: string) => string; numeros?: number } = {},
): PermissoesEfetivas {
  const rotulo = opcoes.rotuloDepartamento ?? ((c: string) => c);
  const cargo = cargoDe(pessoa);
  const gestora = pessoa.departamentos.filter((v) => v.papel_no_departamento === "gestor");
  const gestao = pessoa.papel === "owner" || pessoa.papel === "admin";
  const numeros = opcoes.numeros ?? 0;

  const ve = cargo ? [...cargo.ve] : ["Depende do papel — esta pessoa não casa com nenhum cargo ativo"];
  if (!gestao && pessoa.departamentos.length === 0 && pessoa.papel === "membro") {
    ve.push("Como não está lotada em lugar nenhum, vê tudo menos o Clínico (regra de transição da D91)");
  }

  const faz: string[] = [];
  if (numeros > 0) faz.push(numeros === 1 ? "Responde pelo número de que é dona, e pode ligá-lo e desligá-lo" : `Responde pelos ${numeros} números de que é dona`);
  if (pessoa.papel === "marketing") faz.push("Lê relatório e origem; não envia mensagem");
  else faz.push("Responde conversa, move o funil e cria tarefa");
  if (gestao) {
    faz.push("Convida gente, muda cargo e revoga acesso");
    faz.push("Publica configuração e liga ou desliga agente");
  } else {
    faz.push("Não publica configuração nem liga agente");
  }
  for (const g of gestora) faz.push(`É gestora de ${rotulo(g.departamento)}: vê o departamento inteiro e os que estão abaixo dele`);

  const jarvis = gestora.length
    ? `Recebe as tarefas dos leads de que é dona e as que chegam sem dono em ${gestora.map((g) => rotulo(g.departamento)).join(" e ")}.`
    : (cargo?.jarvis ?? "Recebe as tarefas dos leads de que é dona.");

  return { ve, faz, jarvis, naoAlcanca: cargo?.esconde ?? [] };
}

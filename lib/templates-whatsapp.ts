import type { Papel } from "@/lib/membros";

/**
 * TEMPLATE HSM DA META — lógica pura (SPEC-B-TEMPLATE-HSM, R22 · desenho aprovado 07/08 em
 * Design/templates-hsm-r22.html).
 *
 * ⚠ NÃO CONFUNDIR COM `lib/templates.ts`. A regra de nome é permanente (SPEC-B §0):
 *   · `template_mensagem` = resposta rápida, texto com {{nome}} no menu `/`, vale DENTRO da
 *     janela de 24h, sai como `type:"text"`. Já está em produção. É o outro arquivo.
 *   · `template_whatsapp` = modelo submetido e APROVADO PELA META, único caminho FORA da
 *     janela, sai como `type:"template"`. É este arquivo. Rota irmã e separada, de propósito.
 *
 * O que faz esta lógica diferente de um CRUD: **metade do ciclo de vida não é nossa.** Quem
 * aprova, pausa e recategoriza é a Meta, o veredito leva até 24 horas e chega por webhook.
 * Três consequências moram aqui e em nenhum outro lugar:
 *
 *  L1 — o contador é `usado/limite`, NUNCA "restam N" (`contarCampo`). O limite da Meta é duro
 *       e a punição é assíncrona: quem estoura descobre até 24h depois, por uma recusa que não
 *       diz qual campo foi. Contador que só aparece quando dói chega tarde por definição.
 *
 *  L2 — a régua tem uma DIVISÓRIA DE POSSE (`reguaDoTemplate`). À esquerda o atraso é nosso;
 *       à direita é da Meta e não é negociável. É o que responde "por que isso não saiu ainda?"
 *       sem ninguém abrir um chamado.
 *
 *  L3 — escrever e submeter são DOIS atos (SPEC-B §3). Nome de template não se edita e nome
 *       apagado fica bloqueado para reuso; o rascunho revisável é a diferença entre corrigir e
 *       queimar o nome. Por isso `problemasDoRascunho` recusa ANTES do envio para análise.
 *
 * Permissão é ergonomia (§8.6): a UI só esconde botão que a porta recusaria. A defesa real é
 * o banco.
 */

// ═══════════════════════════ Os limites da Meta ═══════════════════════════
//
// Todos [B] — lidos na documentação oficial em 07/08/2026, fontes em rodada22/LIMITES-META-HSM.md
// §6. NÃO escrever limite de memória: a Meta mudou preço duas vezes em 2026, e estes números
// envelhecem. Estourar qualquer um deles é recusa, e a recusa chega até 24h depois.

export const LIMITE_NOME = 512;
export const LIMITE_CABECALHO = 60;
export const LIMITE_CORPO_HSM = 1024;
export const LIMITE_RODAPE = 60;
export const LIMITE_TEXTO_BOTAO = 25;
export const LIMITE_BOTOES = 10;
export const LIMITE_BOTOES_URL = 2;
export const LIMITE_BOTOES_TELEFONE = 1;
export const LIMITE_BOTOES_CODIGO = 1;
/** 1 variável no cabeçalho; o corpo aceita várias; o rodapé, nenhuma. */
export const LIMITE_VARIAVEIS_CABECALHO = 1;

/**
 * Teto de templates por WABA. **Somos portfólio NÃO verificado**, então vale 250 — o outro
 * número só entra quando o negócio for verificado na Meta, e a tela diz isso em vez de exibir
 * um teto que não é o nosso.
 */
export const TETO_TEMPLATES_NAO_VERIFICADO = 250;
export const TETO_TEMPLATES_VERIFICADO = 6000;

/** Acima disto o contador acende âmbar: o aviso chega antes do estouro, não junto com ele. */
export const FRACAO_ALERTA = 0.9;

// ═══════════════════════════ O vocabulário ═══════════════════════════

/**
 * Status em PT-BR, mapeado do da Meta na borda (SPEC-B §4). `enviando` **não existe na Meta**:
 * é o nosso "submetido e ainda sem resposta", e existe porque sem ele um template submetido é
 * indistinguível de um rascunho esquecido.
 */
export type StatusTemplate =
  | "rascunho"
  | "enviando"
  | "pendente"
  | "aprovado"
  | "recusado"
  | "pausado"
  | "desativado";

export type CategoriaTemplate = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type TipoBotao = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";

/** Os tipos de cabeçalho da Meta, em PT-BR. Só `texto` passa pela VA6 na criação. */
export type TipoCabecalho = "texto" | "imagem" | "video" | "documento" | "localizacao";

export const TIPOS_CABECALHO: TipoCabecalho[] = [
  "texto",
  "imagem",
  "video",
  "documento",
  "localizacao",
];

/**
 * O formato como a META o nomeia → o nosso vocabulário. A chave `cabecalho_midia.formato` guarda o
 * termo da Meta de propósito (ida e volta sem perder byte); quem traduz é esta tabela, e ela é a
 * única — traduzir em dois lugares é como `cabecalho_midia` passou a existir em um repo só.
 */
export const FORMATO_META_PARA_TIPO: Record<string, TipoCabecalho> = {
  TEXT: "texto",
  IMAGE: "imagem",
  VIDEO: "video",
  DOCUMENT: "documento",
  LOCATION: "localizacao",
};

export const ROTULO_CABECALHO: Record<TipoCabecalho, string> = {
  texto: "texto",
  imagem: "imagem",
  video: "vídeo",
  documento: "documento",
  localizacao: "localização",
};

export interface BotaoTemplate {
  tipo: TipoBotao;
  texto: string;
  /** só em `URL`; só em `PHONE_NUMBER` o telefone. Campos separados de propósito. */
  url?: string | null;
  telefone?: string | null;
}

/**
 * O vocabulário DA TELA. Plano de propósito: o construtor edita campos, não árvore.
 *
 * ⚠ **Não é a forma que o banco guarda.** A forma do banco é `DefinicaoPorta`, publicada pela
 * migration `0117`, e a tradução entre as duas mora em `paraDefinicaoDaPorta` /
 * `daDefinicaoDaPorta` — um lugar só, nos dois sentidos. Ver o bloco RF-8 no fim do arquivo.
 */
export interface DefinicaoTemplate {
  /** `null` = template sem cabeçalho. Vazio e ausente são a mesma coisa aqui. */
  cabecalho: string | null;
  /**
   * Tipo do cabeçalho. O construtor só produz `texto` — a porta (VA6) recusa o resto na criação.
   * Os outros existem porque **28 dos 323 templates da WABA de produção têm cabeçalho de mídia**,
   * e a tela precisa dizer isso em vez de mostrar um cabeçalho de texto vazio.
   */
  cabecalho_tipo?: TipoCabecalho;
  corpo: string;
  rodape: string | null;
  botoes: BotaoTemplate[];
  /** variável → valor de amostra. A Meta **recusa** a criação sem isto (§9). */
  exemplos: Record<string, string>;
}

/** Uma linha de `core.template_whatsapp` (SPEC-B §4), do lado do web. */
export interface TemplateWhatsapp {
  id: string;
  canal_id: string;
  /** o nome NA META: `[a-z0-9_]`, e não se edita depois. */
  nome: string;
  idioma: string;
  categoria: CategoriaTemplate;
  definicao: DefinicaoTemplate;
  status: StatusTemplate;
  meta_template_id: string | null;
  /** razão da recusa/pausa, **como a Meta mandou** — cru, sem tradução nossa. */
  motivo_status: string | null;
  /**
   * A categoria com que NÓS submetemos, quando a Meta recategorizou por conta própria (§8.4).
   * `null` = não houve recategorização **ou** a projeção não guarda esse dado neste ambiente —
   * e os dois degradam igual: o chip mostra só a categoria atual. Seta errada é pior que
   * nenhuma seta, e "a Meta mudou" é afirmação que precisa de prova.
   */
  categoria_submetida: CategoriaTemplate | null;
  autor_id: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
  arquivado_em: string | null;
  /** rótulo do canal (apelido do número), quando legível. Nunca o `phone_number_id` cru. */
  canal_rotulo: string | null;
}

// ═══════════════════════════ Categoria e consequência ═══════════════════════════

/**
 * §8.4: categoria escolhida **com a consequência escrita ao lado**, não só o nome. Quem escolhe
 * "Marketing" sem saber que ele é sempre cobrado e tem limite de frequência escolheu no escuro.
 */
export const CATEGORIAS: {
  chave: CategoriaTemplate;
  rotulo: string;
  consequencia: string;
}[] = [
  {
    chave: "UTILITY",
    rotulo: "Utilidade",
    consequencia:
      "Segue algo que a pessoa começou — uma avaliação, uma consulta, uma parcela. Aprova mais fácil e custa menos.",
  },
  {
    chave: "MARKETING",
    rotulo: "Marketing",
    consequencia:
      "Oferta, promoção, reengajamento. Sempre cobrado, tem limite de frequência por pessoa e permite descadastro.",
  },
  {
    chave: "AUTHENTICATION",
    rotulo: "Autenticação",
    consequencia: "Código de verificação. A Me Escuta não usa hoje.",
  },
];

export function rotuloCategoria(c: CategoriaTemplate): string {
  return CATEGORIAS.find((x) => x.chave === c)?.rotulo ?? c;
}

/**
 * A Meta recategoriza sozinha, e **o custo muda sem ninguém do nosso lado aprovar** (§8.4).
 * Devolve o texto do chip: `"Marketing ← Utilidade"` quando houve troca, o rótulo simples
 * quando não houve — ou quando não dá para provar que houve.
 */
export function rotuloRecategorizacao(t: {
  categoria: CategoriaTemplate;
  categoria_submetida: CategoriaTemplate | null;
}): { texto: string; recategorizado: boolean } {
  const atual = rotuloCategoria(t.categoria);
  if (!t.categoria_submetida || t.categoria_submetida === t.categoria) {
    return { texto: atual, recategorizado: false };
  }
  return { texto: `${atual} ← ${rotuloCategoria(t.categoria_submetida)}`, recategorizado: true };
}

// ═══════════════════════════ L2 · A RÉGUA DO TEMPLATE ═══════════════════════════

export type SegmentoTemplate = "feito" | "agora" | "falhou" | "pausa" | "futuro";

/** Quem é dono do tempo neste momento. `null` = ninguém está esperando nada. */
export type DonoDoAtraso = "nos" | "meta" | null;

export interface ReguaTemplate {
  /** Sempre 4, sempre nesta ordem. A divisória entra DEPOIS do índice 1 (`POSICAO_DIVISORIA`). */
  segmentos: SegmentoTemplate[];
  rotulo: string;
  /** Texto curto à direita da régua: data, idade, ou o porquê. `null` = nada a dizer. */
  detalhe: string | null;
  dono: DonoDoAtraso;
  /** `true` quando o estado exige alarme fora da linha — hoje só `pausado` (ver `exigeFaixa`). */
  grave: boolean;
}

/**
 * Onde a divisória de posse entra: depois do 2º segmento. Os dois primeiros são nossos
 * (escrever · enviar); os dois últimos são da Meta (analisar · decidir).
 */
export const POSICAO_DIVISORIA = 2;

/**
 * L2 — a assinatura. Mesma gramática da régua do funil (r9-tokens §4: 3px, raio 2, gap 2), com
 * UMA adição: a divisória vertical que marca onde o controle passa para a Meta.
 *
 * O funil é todo nosso e não precisa dela. O template não é — e sem a marca a régua viraria
 * enfeite. Com ela, ela responde a pergunta que a operação faz todo dia: *por que isso ainda
 * não saiu?* À esquerda da divisória, o atraso é nosso; à direita, até 24h é o combinado.
 */
export function reguaDoTemplate(t: {
  status: StatusTemplate;
  motivo_status?: string | null;
}): ReguaTemplate {
  switch (t.status) {
    case "rascunho":
      return {
        segmentos: ["agora", "futuro", "futuro", "futuro"],
        rotulo: "Rascunho",
        detalhe: "não submetido",
        dono: "nos",
        grave: false,
      };
    case "enviando":
      return {
        segmentos: ["feito", "agora", "futuro", "futuro"],
        rotulo: "Enviando",
        detalhe: "a caminho da Meta",
        dono: "nos",
        grave: false,
      };
    case "pendente":
      return {
        segmentos: ["feito", "feito", "agora", "futuro"],
        rotulo: "Em análise na Meta",
        detalhe: "até 24h",
        dono: "meta",
        grave: false,
      };
    case "aprovado":
      return {
        segmentos: ["feito", "feito", "feito", "feito"],
        rotulo: "Aprovado",
        detalhe: "pronto para usar",
        dono: null,
        grave: false,
      };
    case "recusado":
      return {
        segmentos: ["feito", "feito", "feito", "falhou"],
        rotulo: "Recusado",
        // o motivo vem da Meta e vai CRU (§8.5): traduzir motivo de recusa é inventar diagnóstico.
        detalhe: t.motivo_status?.trim() || "a Meta não aprovou",
        dono: null,
        grave: false,
      };
    case "pausado":
      return {
        segmentos: ["feito", "feito", "feito", "pausa"],
        rotulo: "Pausado pela Meta",
        detalhe: "envios estão falhando agora",
        dono: null,
        grave: true,
      };
    case "desativado":
      return {
        segmentos: ["feito", "feito", "feito", "futuro"],
        rotulo: "Desativado",
        detalhe: "não pode ser usado",
        dono: null,
        grave: false,
      };
    default: {
      // Status novo NÃO compila sem uma decisão explícita de onde ele fica na régua — pela mesma
      // razão do never-check do `efeitoDoComando`: régua muda é régua que informa errado.
      const nunca: never = t.status;
      throw new Error(`status de template desconhecido: ${JSON.stringify(nunca)}`);
    }
  }
}

/**
 * §8.5 — **o estado é do tamanho da consequência.** `pausado` ganha faixa no topo da tela porque
 * mensagens **estão falhando agora**, sem que ninguém do nosso lado tenha mudado nada.
 * `recusado` e `rascunho` não param a operação: ficam na linha.
 */
export function exigeFaixa(t: { status: StatusTemplate }): boolean {
  return t.status === "pausado";
}

/** Só template aprovado e não arquivado pode ser enviado (VE1, §6). É o coração da spec. */
export function podeEnviar(t: { status: StatusTemplate; arquivado_em: string | null }): boolean {
  return t.status === "aprovado" && !t.arquivado_em;
}

// ═══════════════════════════ L1 · Contadores ═══════════════════════════

export type EstadoContador = "ok" | "perto" | "estourou";

export interface Contagem {
  usado: number;
  limite: number;
  estado: EstadoContador;
  /** O texto exibido. Sempre `usado/limite` — nunca "restam N". Ver L1. */
  texto: string;
}

/**
 * L1 — o contador de um campo. Âmbar a partir de 90% do limite, vermelho ao estourar.
 *
 * Ele mostra `947/1024` e não "restam 77" porque os dois números importam: o teto é da Meta e
 * é duro, e ver o teto é o que ensina quanto ainda cabe da próxima vez. "Restam 77" esconde o
 * teto justamente de quem precisa aprender onde ele fica.
 */
export function contarCampo(texto: string, limite: number): Contagem {
  const usado = texto.length;
  const estado: EstadoContador =
    usado > limite ? "estourou" : usado >= Math.ceil(limite * FRACAO_ALERTA) ? "perto" : "ok";
  return { usado, limite, estado, texto: `${usado}/${limite}` };
}

/** Mesma forma para contagem de itens (botões), onde não há texto para medir. */
export function contarItens(usado: number, limite: number): Contagem {
  const estado: EstadoContador =
    usado > limite ? "estourou" : usado >= Math.ceil(limite * FRACAO_ALERTA) ? "perto" : "ok";
  return { usado, limite, estado, texto: `${usado}/${limite}` };
}

// ═══════════════════════════ Nome e variáveis ═══════════════════════════

const RE_NOME = /^[a-z0-9_]+$/;
/** Variável nomeada da Meta: `[a-z_]`, única no template. */
const RE_VARIAVEL_NOMEADA = /\{\{\s*([a-z][a-z_]*)\s*\}\}/g;
/** Variável posicional: `{{1}}`. Não se mistura com nomeada — a Meta recusa. */
const RE_VARIAVEL_POSICIONAL = /\{\{\s*(\d+)\s*\}\}/g;
/** Qualquer coisa com cara de variável, para achar as MAL escritas ({{Nome}}, {{x y}}). */
const RE_QUALQUER = /\{\{([^{}]*)\}\}/g;

export function nomeValido(nome: string): boolean {
  return nome.length > 0 && nome.length <= LIMITE_NOME && RE_NOME.test(nome);
}

/**
 * "retomar_avaliacao" → "Retomar avaliacao". O caminho de volta, para a tela.
 *
 * `core.template_whatsapp.nome` guarda o nome DA META — um identificador, não um rótulo. Enquanto
 * a projeção não tiver um título próprio, é este o texto que a pessoa lê, e ele mora aqui em vez
 * de em cada componente pelo motivo de sempre: a lista e o popover mostrando o MESMO template com
 * duas grafias é como se descobre, tarde, que eram duas funções. O identificador cru continua
 * visível ao lado, em mono — é ele que a Meta conhece.
 */
export function tituloLegivel(nome: string): string {
  const legivel = nome.replace(/_/g, " ").trim();
  return legivel ? legivel.charAt(0).toUpperCase() + legivel.slice(1) : nome;
}

/** "Retomar avaliação" → "retomar_avaliacao" (sugestão editável; o nome final é do humano). */
export function nomeDeTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, LIMITE_NOME);
}

/** Variáveis nomeadas de um texto, únicas, na ordem em que aparecem. */
export function variaveisDe(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of texto.matchAll(RE_VARIAVEL_NOMEADA)) {
    const v = m[1];
    if (!vistas.includes(v)) vistas.push(v);
  }
  return vistas;
}

/** Variáveis posicionais (`{{1}}`) de um texto, únicas, na ordem. */
export function posicionaisDe(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of texto.matchAll(RE_VARIAVEL_POSICIONAL)) {
    if (!vistas.includes(m[1])) vistas.push(m[1]);
  }
  return vistas;
}

/**
 * Chaves `{{...}}` que não são variável válida da Meta — `{{Nome}}`, `{{primeiro nome}}`,
 * `{{}}`. Vão literais para o cliente e a Meta pode recusar por isso; acusar na edição é o
 * único momento barato de consertar.
 */
export function variaveisMalFormadas(texto: string): string[] {
  const ruins: string[] = [];
  for (const m of texto.matchAll(RE_QUALQUER)) {
    const cru = m[1].trim();
    if (/^[a-z][a-z_]*$/.test(cru) || /^\d+$/.test(cru)) continue;
    const marca = `{{${cru}}}`;
    if (!ruins.includes(marca)) ruins.push(marca);
  }
  return ruins;
}

/**
 * TODO placeholder de um texto — nomeado (`{{nome}}`) OU posicional (`{{1}}`) —, distinto, na
 * ordem em que aparece.
 *
 * ⚠ Esta função ESPELHA `core.template_whatsapp_variaveis` (migration `0116`), que é quem a porta
 * usa para contar exemplo por variável na VA6. A classe de caracteres é a MESMA (`[A-Za-z0-9_]+`)
 * de propósito: contar diferente do banco produziria a recusa *"corpo tem 2 variavel(is) e 1
 * exemplo(s)"* já com o evento montado, e o motivo apontaria para o campo errado.
 *
 * A única divergência é a ORDEM, e ela é deliberada: o banco ordena por texto (`order by m[1]`,
 * para ser determinístico), e aqui vale a ordem de LEITURA — que é a ordem posicional que a Meta
 * espera no array de exemplos. O banco só compara CARDINALIDADE, então a ordem não o afeta.
 *
 * `variaveisDe` (só nomeadas) continua existindo e não muda: é ela que o construtor usa para a
 * regra "cabeçalho aceita 1 variável" e para a recusa de mistura.
 */
const RE_PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function placeholdersDe(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of (texto ?? "").matchAll(RE_PLACEHOLDER)) {
    if (!vistas.includes(m[1])) vistas.push(m[1]);
  }
  return vistas;
}

/**
 * Todas as variáveis do template inteiro (cabeçalho + corpo + endereço dos botões de link), na
 * ordem de leitura, sem repetir.
 *
 * ⚠ Inclui POSICIONAIS. Medido em 14/09: `parameter_format` é POSITIONAL em **323 de 323**
 * templates da WABA de produção, e variável nomeada não existe em nenhum. Uma versão que só
 * enxergasse `{{nome}}` pediria zero exemplo para eles e a porta recusaria a criação.
 */
export function variaveisDaDefinicao(d: DefinicaoTemplate): string[] {
  const todas = [
    ...placeholdersDe(d.cabecalho ?? ""),
    ...placeholdersDe(d.corpo),
    ...d.botoes.flatMap((b) => (b.tipo === "URL" ? placeholdersDe(b.url ?? "") : [])),
  ];
  return todas.filter((v, i) => todas.indexOf(v) === i);
}

// ═══════════════════════════ L3 · O rascunho e o que impede submeter ═══════════════════════════

/** O que o construtor edita. Vira `DefinicaoTemplate` + metadados na hora de gravar. */
export interface RascunhoTemplate {
  nome: string;
  idioma: string;
  categoria: CategoriaTemplate;
  canal_id: string;
  cabecalho: string;
  corpo: string;
  rodape: string;
  botoes: BotaoTemplate[];
  exemplos: Record<string, string>;
}

export interface ProblemaTemplate {
  /** Onde acender o campo. Casa com o `name` do controle no construtor. */
  campo: "nome" | "cabecalho" | "corpo" | "rodape" | "botoes" | "exemplos" | "canal";
  mensagem: string;
}

export function rascunhoVazio(canalId: string): RascunhoTemplate {
  return {
    nome: "",
    idioma: "pt_BR",
    categoria: "UTILITY",
    canal_id: canalId,
    cabecalho: "",
    corpo: "",
    rodape: "",
    botoes: [],
    exemplos: {},
  };
}

/**
 * L3 — tudo o que a Meta recusaria, dito ANTES de submeter. Devolve a lista inteira, não o
 * primeiro problema: a tela diz "duas coisas impedem o envio" e mostra as duas, porque corrigir
 * uma de cada vez com 24h de espera entre elas é o custo que esta tela existe para eliminar.
 *
 * A ordem é a ordem de leitura do formulário — quem corrige de cima para baixo não pula nada.
 */
export function problemasDoRascunho(r: RascunhoTemplate): ProblemaTemplate[] {
  const p: ProblemaTemplate[] = [];

  if (!r.canal_id.trim()) {
    p.push({ campo: "canal", mensagem: "escolha por qual número este template vai sair" });
  }

  if (!r.nome.trim()) {
    p.push({ campo: "nome", mensagem: "dê um nome ao template" });
  } else if (!nomeValido(r.nome)) {
    p.push({
      campo: "nome",
      mensagem:
        r.nome.length > LIMITE_NOME
          ? `o nome passou de ${LIMITE_NOME} caracteres`
          : "o nome aceita só minúsculas, números e _ — a Meta recusa o resto",
    });
  }

  if (!r.corpo.trim()) {
    p.push({ campo: "corpo", mensagem: "escreva a mensagem" });
  }

  const excesso: [string, number, ProblemaTemplate["campo"], string][] = [
    [r.cabecalho, LIMITE_CABECALHO, "cabecalho", "o cabeçalho"],
    [r.corpo, LIMITE_CORPO_HSM, "corpo", "a mensagem"],
    [r.rodape, LIMITE_RODAPE, "rodape", "o rodapé"],
  ];
  for (const [texto, limite, campo, quem] of excesso) {
    if (texto.length > limite) {
      p.push({
        campo,
        mensagem: `${quem} passou ${texto.length - limite} ${
          texto.length - limite === 1 ? "caractere" : "caracteres"
        } do limite da Meta (${limite})`,
      });
    }
  }

  if (variaveisDe(r.cabecalho).length > LIMITE_VARIAVEIS_CABECALHO) {
    p.push({ campo: "cabecalho", mensagem: "o cabeçalho aceita no máximo 1 variável" });
  }
  if (variaveisDe(r.rodape).length > 0 || posicionaisDe(r.rodape).length > 0) {
    p.push({ campo: "rodape", mensagem: "o rodapé não aceita variável" });
  }

  // Posicional e nomeada não se misturam — a Meta recusa (LIMITES §1).
  const temNomeada = variaveisDe(r.cabecalho).length + variaveisDe(r.corpo).length > 0;
  const temPosicional = posicionaisDe(r.cabecalho).length + posicionaisDe(r.corpo).length > 0;
  if (temNomeada && temPosicional) {
    p.push({
      campo: "corpo",
      mensagem: "não misture {{1}} com {{nome}} — a Meta aceita um estilo de variável por template",
    });
  }

  for (const [texto, campo] of [
    [r.cabecalho, "cabecalho"],
    [r.corpo, "corpo"],
  ] as const) {
    const ruins = variaveisMalFormadas(texto);
    if (ruins.length > 0) {
      p.push({
        campo,
        mensagem: `${ruins.join(", ")} não ${
          ruins.length === 1 ? "é uma variável" : "são variáveis"
        } válida${ruins.length === 1 ? "" : "s"} — use minúsculas e _`,
      });
    }
  }

  p.push(...problemasDosBotoes(r.botoes));

  // §9: a Meta EXIGE valor de amostra por variável na criação, e recusa sem ele. Campo
  // obrigatório aqui, não descoberto na recusa 24h depois.
  const semExemplo = variaveisDaDefinicao(definicaoDoRascunho(r)).filter(
    (v) => !(r.exemplos[v] ?? "").trim(),
  );
  if (semExemplo.length > 0) {
    p.push({
      campo: "exemplos",
      mensagem: `falta o exemplo de ${semExemplo.map((v) => `{{${v}}}`).join(", ")} — a Meta recusa sem isso`,
    });
  }

  return p;
}

function problemasDosBotoes(botoes: BotaoTemplate[]): ProblemaTemplate[] {
  const p: ProblemaTemplate[] = [];
  if (botoes.length > LIMITE_BOTOES) {
    p.push({ campo: "botoes", mensagem: `no máximo ${LIMITE_BOTOES} botões` });
  }
  const conta = (t: TipoBotao) => botoes.filter((b) => b.tipo === t).length;
  const tetos: [TipoBotao, number, string][] = [
    ["URL", LIMITE_BOTOES_URL, "botões de link"],
    ["PHONE_NUMBER", LIMITE_BOTOES_TELEFONE, "botão de telefone"],
    ["COPY_CODE", LIMITE_BOTOES_CODIGO, "botão de copiar código"],
  ];
  for (const [tipo, teto, quem] of tetos) {
    if (conta(tipo) > teto) {
      p.push({ campo: "botoes", mensagem: `no máximo ${teto} ${quem}` });
    }
  }
  for (const b of botoes) {
    if (!b.texto.trim()) {
      p.push({ campo: "botoes", mensagem: "botão sem texto — escreva ou remova" });
      break;
    }
  }
  const longo = botoes.find((b) => b.texto.length > LIMITE_TEXTO_BOTAO);
  if (longo) {
    p.push({
      campo: "botoes",
      mensagem: `"${longo.texto.slice(0, 20)}…" passou de ${LIMITE_TEXTO_BOTAO} caracteres`,
    });
  }
  const semUrl = botoes.find((b) => b.tipo === "URL" && !(b.url ?? "").trim());
  if (semUrl) p.push({ campo: "botoes", mensagem: "botão de link sem endereço" });
  const semTel = botoes.find((b) => b.tipo === "PHONE_NUMBER" && !(b.telefone ?? "").trim());
  if (semTel) p.push({ campo: "botoes", mensagem: "botão de telefone sem número" });
  return p;
}

export function definicaoDoRascunho(r: RascunhoTemplate): DefinicaoTemplate {
  return {
    cabecalho: r.cabecalho.trim() ? r.cabecalho : null,
    corpo: r.corpo,
    rodape: r.rodape.trim() ? r.rodape : null,
    botoes: r.botoes,
    exemplos: r.exemplos,
  };
}

/** Salvar rascunho pede menos que submeter: nome válido e corpo escrito, e nada mais. */
export function problemasParaSalvar(r: RascunhoTemplate): ProblemaTemplate[] {
  return problemasDoRascunho(r).filter((x) => x.campo === "nome" || x.campo === "canal" || (x.campo === "corpo" && !r.corpo.trim()));
}

// ═══════════════════════════ Prévia ═══════════════════════════

/**
 * §8.1 — **a Meta aprova o que a pessoa lê, não o JSON.** A prévia troca cada variável pelo
 * valor que for conhecido (o exemplo, na autoria; o dado real, no envio) e deixa literal o que
 * não tiver valor — nunca inventa, pela mesma razão do `substituirVariaveis` da resposta rápida.
 */
export function preencher(texto: string, valores: Record<string, string>): string {
  // RE_PLACEHOLDER, não RE_VARIAVEL_NOMEADA: a prévia tem de valer para `{{1}}` também, senão os
  // 323 templates posicionais da produção apareceriam na tela com a chave crua no lugar do nome.
  return texto.replace(RE_PLACEHOLDER, (original, v: string) => {
    const valor = valores[v];
    return valor && valor.trim() ? valor : original;
  });
}

// ═══════════════════════════ Envio: o espelho de VE3 e VE4 ═══════════════════════════

/**
 * As mesmas VE3 e VE4 que a porta aplica (SPEC-B §6), repetidas aqui **só para recusar antes**,
 * com o campo apontado. A recusa que vale é a do banco; esta troca uma falha de entrega que
 * chega depois do custo por um motivo legível na hora.
 *
 * VE4 não é preciosismo: a Meta recusa NO ENVIO parâmetro com quebra de linha, TAB ou 4+ espaços
 * seguidos, e o erro volta como falha de entrega sem dizer qual parâmetro foi.
 */
export function motivoParametroInvalido(valor: string): string | null {
  if (!valor.trim()) return "está em branco";
  if (/[\n\r\t]/.test(valor)) return "tem quebra de linha ou tabulação — a Meta recusa";
  if (/ {4,}/.test(valor)) return "tem 4 ou mais espaços seguidos — a Meta recusa";
  return null;
}

export interface RecusaEnvio {
  pode: boolean;
  /** Preenchido só quando `pode = false`. Nomeia o limite, nunca "erro ao enviar". */
  motivo: string | null;
}

/**
 * O portão do envio de template, do lado do web. VE1 primeiro e sempre: template não-aprovado
 * que chega ao sender vira erro da Graph, e erro da Graph fora da janela é indistinguível de
 * "a janela fechou" (§6). Meses de diagnóstico errado nasceram de menos que isso.
 */
export function vereditoEnvioTemplate(
  t: TemplateWhatsapp | null,
  valores: Record<string, string>,
): RecusaEnvio {
  if (!t) return { pode: false, motivo: "escolha um template" };
  if (!podeEnviar(t)) {
    return {
      pode: false,
      motivo: `este template está ${reguaDoTemplate(t).rotulo.toLowerCase()} — só template aprovado sai fora da janela`,
    };
  }
  for (const v of variaveisDaDefinicao(t.definicao)) {
    const motivo = motivoParametroInvalido(valores[v] ?? "");
    if (motivo) return { pode: false, motivo: `o valor de {{${v}}} ${motivo}` };
  }
  return { pode: true, motivo: null };
}

// ═══════════════════════════ Papel ═══════════════════════════

/**
 * §8.6 — criar/submeter/arquivar é voz institucional: admin ou owner. Membro **vê e usa**, e
 * usar não passa por aqui. A UI só esconde botão que a porta recusaria; a defesa real é o banco.
 */
export function podeGerirTemplatesWhatsapp(meuPapel: Papel | null): boolean {
  return meuPapel === "admin" || meuPapel === "owner";
}

// ═══════════════════════════ Ordenação da lista ═══════════════════════════

/**
 * Ordem da lista: primeiro o que exige ação de alguém, depois o resto. Pausado no topo porque
 * está falhando agora; aprovado no fim porque não pede nada de ninguém.
 */
const PESO_STATUS: Record<StatusTemplate, number> = {
  pausado: 0,
  recusado: 1,
  rascunho: 2,
  enviando: 3,
  pendente: 4,
  aprovado: 5,
  desativado: 6,
};

export function ordenarTemplates(ts: TemplateWhatsapp[]): TemplateWhatsapp[] {
  return [...ts].sort(
    (a, b) => PESO_STATUS[a.status] - PESO_STATUS[b.status] || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

// ═══════════════════════ RF-8 · A TRADUÇÃO — sem ela, nada grava ═══════════════════════
//
// São TRÊS vocabulários para a mesma coisa, e eles não se parecem:
//
//   META   `components: [{type:"BODY", text, example:{body_text:[[...]]}}, ...]`  (borda, runtime)
//   BANCO  `{"corpo":{"texto":…,"exemplos":[…]}, "cabecalho":{"tipo":"texto",…}, …}`  (`0117`)
//   TELA   `{cabecalho: string|null, corpo: string, …, exemplos: {var → valor}}`     (aqui)
//
// O tradutor mora em UM lugar só, nos dois sentidos. `if` espalhado por componente é como as duas
// formas divergiram sem ninguém ver: a branch de 07/08 mandava a forma da TELA para a porta, e a
// porta recusaria toda criação com *"a definicao exige corpo.texto"*.
//
// A diferença que mais custa: **`exemplos` é um MAPA aqui e um ARRAY POR COMPONENTE lá.** O banco
// (VA6) compara o tamanho do array com a contagem de variáveis DAQUELE componente — um mapa global
// com 2 chaves não diz nada sobre quantas variáveis o cabeçalho tem.

/** Um componente de texto na forma do banco. `exemplos` é posicional, um por variável. */
export interface ComponentePorta {
  texto: string;
  exemplos?: string[];
}

export interface CabecalhoPorta extends ComponentePorta {
  tipo: TipoCabecalho;
}

export interface BotaoPorta {
  tipo: TipoBotao;
  texto: string;
  url?: string;
  telefone?: string;
  exemplos?: string[];
}

/** A `definicao` como a migration `0117` a publica. É ESTA a forma que vai no payload. */
export interface DefinicaoPorta {
  cabecalho?: CabecalhoPorta;
  corpo: ComponentePorta;
  rodape?: { texto: string };
  botoes?: BotaoPorta[];
}

/** Os exemplos de UM texto, na ordem das variáveis dele. Sem valor ⇒ string vazia, nunca buraco:
 *  a VA6 compara TAMANHO, e um array curto viraria a recusa "N variavel(is) e M exemplo(s)". */
function exemplosDoTexto(texto: string, mapa: Record<string, string>): string[] {
  return placeholdersDe(texto).map((v) => mapa[v] ?? "");
}

/** TELA → BANCO. O que a action manda no payload de `template_whatsapp_criado`. */
export function paraDefinicaoDaPorta(d: DefinicaoTemplate): DefinicaoPorta {
  const saida: DefinicaoPorta = {
    corpo: { texto: d.corpo, exemplos: exemplosDoTexto(d.corpo, d.exemplos) },
  };

  // Chave AUSENTE, não `null`: a VA6 testa `v_def ? 'cabecalho'`, e um `null` presente entraria no
  // ramo e cobraria `tipo`/`texto` de um cabeçalho que não existe.
  if (d.cabecalho) {
    saida.cabecalho = {
      tipo: d.cabecalho_tipo ?? "texto",
      texto: d.cabecalho,
      exemplos: exemplosDoTexto(d.cabecalho, d.exemplos),
    };
  }
  if (d.rodape) saida.rodape = { texto: d.rodape };

  if (d.botoes.length > 0) {
    saida.botoes = d.botoes.map((b) => {
      const botao: BotaoPorta = { tipo: b.tipo, texto: b.texto };
      if (b.tipo === "URL" && b.url) {
        botao.url = b.url;
        botao.exemplos = exemplosDoTexto(b.url, d.exemplos);
      }
      if (b.tipo === "PHONE_NUMBER" && b.telefone) botao.telefone = b.telefone;
      return botao;
    });
  }
  return saida;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function listaDeExemplos(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (x == null ? "" : String(x))) : [];
}

function comoTipoCabecalho(v: unknown): TipoCabecalho {
  const t = String(v ?? "").toLowerCase();
  return (TIPOS_CABECALHO as string[]).includes(t) ? (t as TipoCabecalho) : "texto";
}

function comoTipoBotao(v: unknown): TipoBotao {
  const t = String(v ?? "").toUpperCase();
  return (["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"] as string[]).includes(t)
    ? (t as TipoBotao)
    : "QUICK_REPLY";
}

/**
 * BANCO → TELA. Reconstrói o mapa de exemplos casando cada array posicional com as variáveis do
 * seu próprio texto — é a operação inversa exata de `exemplosDoTexto`.
 *
 * Tolerante de propósito: o jsonb pode vir torto de um replay ou de um worker que ainda vai
 * existir, e a tela NUNCA quebra por causa disso. O que ela não faz é inventar: campo ilegível
 * vira vazio, e vazio é honesto.
 */
export function daDefinicaoDaPorta(v: unknown): DefinicaoTemplate {
  const d = (v ?? {}) as Record<string, unknown>;
  const exemplos: Record<string, string> = {};

  const absorver = (t: string, brutos: unknown) => {
    const valores = listaDeExemplos(brutos);
    placeholdersDe(t).forEach((nome, i) => {
      const valor = valores[i];
      if (valor && !exemplos[nome]) exemplos[nome] = valor;
    });
  };

  const corpoObj = (d.corpo ?? {}) as Record<string, unknown>;
  const corpo = texto(corpoObj.texto);
  absorver(corpo, corpoObj.exemplos);

  const cabObj = (d.cabecalho ?? null) as Record<string, unknown> | null;
  const cabecalhoTexto = cabObj ? texto(cabObj.texto) : "";
  if (cabObj) absorver(cabecalhoTexto, cabObj.exemplos);

  /*
   * ── `cabecalho_midia`: a chave que o web não lia, e os 28 templates que sumiam por causa dela ──
   *
   * 14/09 · medido entre os dois repos antes de consertar: `cabecalho_midia` aparece 10× no runtime
   * e **0× aqui**. Cabeçalho de TEXTO e cabeçalho de MÍDIA moram em chaves DIFERENTES da mesma
   * `definicao` — são mutuamente exclusivos porque a Meta aceita um cabeçalho só, e o runtime os
   * separou para que a validação da porta (VA6) não precise inspecionar o de mídia.
   *
   * Consequência de ler só `d.cabecalho`: nos **28 dos 323 templates da WABA de produção** que têm
   * cabeçalho IMAGE/VIDEO, `cabObj` vinha `null`, o tipo caía no default `texto`, e a tela dizia
   * "sem cabeçalho". A fono escolheria um desses, mandaria, e a primeira notícia de que faltava a
   * mídia seria a RECUSA do sender.
   *
   * O formato vem em vocabulário da Meta (`IMAGE`/`VIDEO`/`DOCUMENT`/`LOCATION`) porque é o que a
   * ida e volta preserva byte a byte; a tradução para PT-BR é aqui, no mesmo lugar que traduz o
   * resto.
   */
  const midiaObj = (d.cabecalho_midia ?? null) as Record<string, unknown> | null;
  const cabecalhoTipo: TipoCabecalho = midiaObj
    ? (FORMATO_META_PARA_TIPO[String(midiaObj.formato ?? "").toUpperCase()] ?? "imagem")
    : comoTipoCabecalho(cabObj?.tipo);

  const rodapeObj = (d.rodape ?? null) as Record<string, unknown> | null;
  const rodape = rodapeObj ? texto(rodapeObj.texto) : "";

  const botoes = (Array.isArray(d.botoes) ? d.botoes : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => {
      const url = b.url ? String(b.url) : null;
      if (url) absorver(url, b.exemplos);
      return {
        tipo: comoTipoBotao(b.tipo),
        texto: texto(b.texto),
        url,
        telefone: b.telefone ? String(b.telefone) : null,
      };
    });

  return {
    // Cabeçalho de MÍDIA não tem texto: guardar `null` é o que faz a tela mostrar o selo do tipo
    // em vez de uma linha em branco onde deveria haver título.
    cabecalho: cabecalhoTipo === "texto" ? cabecalhoTexto || null : null,
    // `undefined` = template SEM cabeçalho nenhum, e é diferente de "cabeçalho de texto vazio".
    // Antes o tipo só saía quando havia cabeçalho de TEXTO — era este `?:` que apagava os 28 de
    // mídia depois de já os ter traduzido corretamente logo acima.
    cabecalho_tipo: cabObj || midiaObj ? cabecalhoTipo : undefined,
    corpo,
    rodape: rodape || null,
    botoes,
    exemplos,
  };
}

// ═══════════════════════ RF-9.1 · De onde o template veio ═══════════════════════

/**
 * A origem é DERIVADA, sem coluna nova (RF-2.1): o projetor tira `autor_id` do ATOR, então quem
 * nasceu aqui tem autor e quem veio da sincronização não tem.
 *
 * O terceiro caso é o que torna o filtro necessário: **229 dos 323** templates da produção têm o
 * sufixo aleatório de 6 caracteres que o Kommo gera por paciente (`rui_ts4qd9`). Sem separá-los,
 * eles afogam os ~94 reutilizáveis e a lista vira inútil no dia em que a sincronização ligar.
 */
export type OrigemTemplate = "aqui" | "meta" | "paciente";

const RE_SUFIXO_KOMMO = /_[a-z0-9]{6}$/;

export function origemDoTemplate(t: { autor_id: string | null; nome: string }): OrigemTemplate {
  if (t.autor_id) return "aqui";
  return RE_SUFIXO_KOMMO.test(t.nome) ? "paciente" : "meta";
}

export const ORIGENS: { chave: OrigemTemplate | "todos"; rotulo: string; dica: string }[] = [
  { chave: "todos", rotulo: "Todos", dica: "tudo o que existe neste portfólio" },
  { chave: "aqui", rotulo: "Criados aqui", dica: "escritos por alguém do time, neste sistema" },
  { chave: "meta", rotulo: "Vindos da Meta", dica: "já existiam na conta — importados pela sincronização" },
  {
    chave: "paciente",
    rotulo: "Por paciente (Kommo)",
    dica: "nome com sufixo aleatório: o Kommo criava um template por pessoa",
  },
];

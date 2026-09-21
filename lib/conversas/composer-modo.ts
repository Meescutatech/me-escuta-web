// Relativo com extensão de propósito: este módulo é importado pelos testes sob
// `node --experimental-strip-types`, onde o alias `@/` não resolve (padrão do repo).
import {
  placeholdersPendentes,
  substituirVariaveis,
  filtrarTemplates,
  type TemplateMensagem,
  type VariaveisTemplate,
} from "../templates.ts";
import { armarTemplate, filtrarHsm, type SabidoDaConversa, type TemplateHsmNoChat } from "./template-hsm.ts";

/**
 * MODO DO COMPOSER — comandos `/` e a TRAVA DE ENVIO (Rodada 13 / Bloco C + templates).
 * Spec: SPEC-NOTAS-TAREFAS-MENCOES §6.1/§6.2 e SPEC-TEMPLATES-MENSAGENS §5.3/§6.
 *
 * Três regras, todas puras e testadas (tests/composer-modo.test.ts, tests/templates.test.ts):
 *
 *  C1 — `/` só abre o menu como PRIMEIRO caractere do campo. No meio de uma frase é barra
 *       literal: em PT-BR se digita data com barra o tempo todo (23/07), e o menu não pode
 *       aparecer nisso. Um espaço depois da barra também fecha o menu — virou texto.
 *
 *  C3 — enquanto o modo for `nota` ou `tarefa` é IMPOSSÍVEL mandar mensagem ao cliente.
 *       A trava mora AQUI, no caminho de envio: `despacharAoCliente` é o único portão que a
 *       UI usa para falar com o cliente, e ele não chama o `enviar` em modo interno. Botão
 *       desabilitado por CSS é conforto visual, não garantia — CSS não impede Enter, não
 *       impede submit programático e some num refactor.
 *
 *  T1 — NENHUM comando do menu chama a função de envio (reescrita do invariante C3 para o
 *       menu com templates, exigência (a) do GO). Comando de MODO entra em modo interno;
 *       comando de TEMPLATE só escreve no rascunho — o envio continua passando exclusivamente
 *       por `despacharAoCliente`. `efeitoDoComando` é uma união EXAUSTIVA com never-check:
 *       uma variante nova de comando não compila sem decidir explicitamente o que ela faz.
 *       E placeholder `{{...}}` que sobrar no texto trava o envio aqui no portão (§5.3).
 */

export type ModoComposer = "mensagem" | "nota" | "tarefa";
export type ModoInterno = Exclude<ModoComposer, "mensagem">;

export interface ComandoModo {
  acao: "modo";
  modo: ModoInterno;
  comando: string;
  explicacao: string;
}

export interface ComandoTemplate {
  acao: "template";
  template: TemplateMensagem;
  comando: string;
  explicacao: string;
}

/**
 * T2 (14/09) · o template HSM da META. Variante PRÓPRIA, e não um campo a mais em `ComandoTemplate`:
 * a mensagem pronta é texto nosso e vai pelo envio de sempre; o HSM sai por `enviar_template_humano`
 * com `template_id` + parâmetros posicionais, custa dinheiro e abre janela de 24h. Um tipo só faria
 * o compilador calar exatamente onde ele deve falar.
 */
export interface ComandoTemplateHsm {
  acao: "template_hsm";
  template: TemplateHsmNoChat;
  comando: string;
  explicacao: string;
}

export type ComandoComposer = ComandoModo | ComandoTemplate | ComandoTemplateHsm;

/** Os dois comandos fixos. Ordem = ordem do menu (mockup composer-comandos-v3, estado b). */
export const COMANDOS: ComandoModo[] = [
  { acao: "modo", modo: "nota", comando: "/nota", explicacao: "Nota interna, só para a equipe" },
  { acao: "modo", modo: "tarefa", comando: "/tarefa", explicacao: "Tarefa com responsável e prazo" },
];

/**
 * Termo digitado depois da barra, ou null quando não há menu.
 * `""` (barra sozinha) é um termo válido — abre o menu inteiro.
 */
export function termoComando(texto: string): string | null {
  if (!texto.startsWith("/")) return null;
  const termo = texto.slice(1);
  if (/\s/.test(termo)) return null; // "/ola mundo" já é frase, não comando
  return termo;
}

/**
 * `/template` PEDE A LISTA INTEIRA — reportado em produção, 21/09/2026.
 *
 * O menu nunca teve um comando com esse nome: tinha `/nota`, `/tarefa` e um comando por template,
 * cada um pelo próprio nome. Quem digitou a palavra que nomeia a coisa não achou a coisa, e
 * reportou a tela como quebrada. Aqui `template` (e seus prefixos) passa a ser um ALIAS: em vez de
 * casar por nome, devolve os HSM do canal.
 *
 * O corte em 3 letras é a colisão com `/tarefa`: `t` e `te` também são prefixo de "template", e
 * disparar ali jogaria a lista de HSM na cara de quem está indo abrir uma tarefa. De `tem` em
 * diante nenhum comando fixo passa, e a intenção deixa de ser ambígua.
 */
const ALIAS_TEMPLATE = "template";
const MIN_ALIAS = 3;

export function ehComandoTemplate(texto: string): boolean {
  const termo = termoComando(texto);
  if (termo === null) return false;
  const alvo = normalizar(termo);
  return alvo.length >= MIN_ALIAS && ALIAS_TEMPLATE.startsWith(alvo);
}

/**
 * Comandos que casam com o termo (prefixo, sem acento/caixa). `[]` = menu fechado.
 * Templates entram como seção própria depois dos comandos fixos: casam por prefixo do
 * atalho OU substring do título (SPEC-TEMPLATES §6.1).
 */
export function menuComandos(
  texto: string,
  templates: TemplateMensagem[] = [],
  hsm: TemplateHsmNoChat[] = [],
): ComandoComposer[] {
  const termo = termoComando(texto);
  if (termo === null) return [];
  const alvo = normalizar(termo);
  // o alias pede a lista do canal; `filtrarHsm("")` é exatamente "sem termo, traga os primeiros".
  const termoHsm = ehComandoTemplate(texto) ? "" : termo;
  const fixos = COMANDOS.filter((c) => normalizar(c.comando.slice(1)).startsWith(alvo));
  const deTemplate: ComandoTemplate[] = filtrarTemplates(templates, termo).map((t) => ({
    acao: "template",
    template: t,
    comando: `/${t.atalho}`,
    explicacao: t.titulo,
  }));
  // Os HSM vêm POR ÚLTIMO, e o motivo é de custo: nota e tarefa são internas, a mensagem pronta é
  // de graça, e o template é a única opção do menu que gasta dinheiro e abre uma janela de 24h.
  // A ordem do menu é a ordem do risco.
  const deHsm: ComandoTemplateHsm[] = filtrarHsm(hsm, termoHsm).map((t) => ({
    acao: "template_hsm",
    template: t,
    comando: `/${t.nome}`,
    explicacao: primeiraLinha(t.corpo),
  }));
  return [...fixos, ...deTemplate, ...deHsm];
}

/** A primeira linha do corpo, cortada — é o que identifica o template para quem não decora nome. */
function primeiraLinha(corpo: string, max = 64): string {
  const l = (corpo ?? "").split("\n")[0]?.trim() ?? "";
  return l.length > max ? `${l.slice(0, max - 1)}…` : l;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ehModoInterno(modo: ModoComposer): modo is ModoInterno {
  return modo === "nota" || modo === "tarefa";
}

export function rotuloModo(modo: ModoInterno): string {
  return modo === "nota" ? "Nota interna" : "Tarefa";
}

/**
 * O que um comando FAZ — decidido aqui, puro e exaustivo. Nenhuma variante envia nada:
 * o efeito é entrar em modo interno OU escrever no rascunho. O `default` com never-check
 * é a exigência (a) do GO: variante nova não compila sem uma decisão explícita aqui.
 */
export type EfeitoComando =
  | { tipo: "entrar_modo"; modo: ModoInterno }
  | { tipo: "inserir_rascunho"; texto: string; templateId: string; pendentes: string[] }
  /**
   * ARMAR, não inserir. O texto é só o que a atendente LÊ: o que vai para a Meta é
   * `templateId` + `parametros`, e o corpo é montado pelo sender a partir da definição aprovada.
   * Editar o texto aqui não mudaria a mensagem — mudaria só a prévia, que é a pior mentira
   * possível numa tela de envio. Por isso o efeito é separado de `inserir_rascunho`.
   */
  | {
      tipo: "armar_template_hsm";
      templateId: string;
      nome: string;
      texto: string;
      parametros: string[];
      faltando: number[];
    };

export function efeitoDoComando(
  c: ComandoComposer,
  variaveis: VariaveisTemplate,
  sabido: SabidoDaConversa = {},
): EfeitoComando {
  switch (c.acao) {
    case "modo":
      return { tipo: "entrar_modo", modo: c.modo };
    case "template": {
      // substituição NA ESCOLHA (§5.2); o que não resolve fica literal e trava o envio (§5.3)
      const texto = substituirVariaveis(c.template.corpo, variaveis);
      return {
        tipo: "inserir_rascunho",
        texto,
        templateId: c.template.id,
        pendentes: placeholdersPendentes(texto),
      };
    }
    case "template_hsm": {
      // T1 continua valendo: ARMAR não é ENVIAR. Nenhum comando do menu chama o envio — quem manda
      // template é `enviarTemplateHumano`, depois de a pessoa confirmar a prévia.
      const a = armarTemplate(c.template, sabido);
      return {
        tipo: "armar_template_hsm",
        templateId: c.template.id,
        nome: c.template.nome,
        texto: a.texto,
        parametros: a.parametros,
        faltando: a.faltando,
      };
    }
    default: {
      const nunca: never = c; // variante nova de comando NÃO compila sem decidir o efeito
      throw new Error(`comando desconhecido no menu: ${JSON.stringify(nunca)}`);
    }
  }
}

/** Motivo único da recusa — o mesmo texto no aviso da UI e no retorno da trava. */
export const MOTIVO_TRAVA =
  "o campo está em modo interno — nada daqui vai para o cliente";

export const MOTIVO_VAZIA = "mensagem vazia";

/** §5.3 (GO 10.5): "erro visível > mensagem torta no cliente". */
export function motivoPlaceholder(pendentes: string[]): string {
  return `há variável sem valor no texto — complete ${pendentes.join(", ")} antes de enviar`;
}

/** A pergunta que o caminho de envio faz antes de qualquer coisa. */
export function podeEnviarAoCliente(modo: ModoComposer): boolean {
  return modo === "mensagem";
}

export interface ResultadoDespacho {
  enviado: boolean;
  motivo?: string;
}

/**
 * ÚNICO portão de saída para o cliente. Em modo interno devolve `enviado:false` e — o que
 * importa — NÃO invoca `enviar`. O teste da trava (C3) prova exatamente isso: o espião de
 * envio fica com zero chamadas em modo nota e em modo tarefa.
 * Placeholder `{{...}}` pendente também não passa (§5.3): melhor recusar com aviso do que o
 * cliente receber "Oi {{nome}}".
 */
export function despacharAoCliente(
  modo: ModoComposer,
  texto: string,
  enviar: (texto: string) => void,
): ResultadoDespacho {
  if (!podeEnviarAoCliente(modo)) return { enviado: false, motivo: MOTIVO_TRAVA };
  const corpo = texto.trim();
  if (!corpo) return { enviado: false, motivo: MOTIVO_VAZIA };
  const pendentes = placeholdersPendentes(corpo);
  if (pendentes.length > 0) return { enviado: false, motivo: motivoPlaceholder(pendentes) };
  enviar(corpo);
  return { enviado: true };
}

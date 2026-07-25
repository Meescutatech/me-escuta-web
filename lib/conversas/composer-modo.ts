// Relativo com extensão de propósito: este módulo é importado pelos testes sob
// `node --experimental-strip-types`, onde o alias `@/` não resolve (padrão do repo).
import {
  placeholdersPendentes,
  substituirVariaveis,
  filtrarTemplates,
  type TemplateMensagem,
  type VariaveisTemplate,
} from "../templates.ts";

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

export type ComandoComposer = ComandoModo | ComandoTemplate;

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
 * Comandos que casam com o termo (prefixo, sem acento/caixa). `[]` = menu fechado.
 * Templates entram como seção própria depois dos comandos fixos: casam por prefixo do
 * atalho OU substring do título (SPEC-TEMPLATES §6.1).
 */
export function menuComandos(texto: string, templates: TemplateMensagem[] = []): ComandoComposer[] {
  const termo = termoComando(texto);
  if (termo === null) return [];
  const alvo = normalizar(termo);
  const fixos = COMANDOS.filter((c) => normalizar(c.comando.slice(1)).startsWith(alvo));
  const deTemplate: ComandoTemplate[] = filtrarTemplates(templates, termo).map((t) => ({
    acao: "template",
    template: t,
    comando: `/${t.atalho}`,
    explicacao: t.titulo,
  }));
  return [...fixos, ...deTemplate];
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
  | { tipo: "inserir_rascunho"; texto: string; templateId: string; pendentes: string[] };

export function efeitoDoComando(c: ComandoComposer, variaveis: VariaveisTemplate): EfeitoComando {
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

// Relativo com extensão de propósito: este módulo é importado pelos testes sob
// `node --experimental-strip-types`, onde o alias `@/` não resolve (padrão do repo).

/**
 * TEMPLATE HSM NO CHAT — achar, preencher, e saber o que ainda falta.
 *
 * Tudo aqui é PURO. O envio mora em `conversas/actions` e passa por `enviar_template_humano`, que
 * é evento com guarda na porta; o que este arquivo decide é o que a atendente VÊ antes de mandar.
 *
 * ── Por que HSM não é "mais um template" ──────────────────────────────────────────────────────
 * A mensagem pronta (`lib/templates.ts`) é texto nosso: escolher escreve no rascunho e o envio é o
 * de sempre. O HSM é um objeto APROVADO PELA META: sai por outro caminho (`template_id` +
 * parâmetros posicionais), custa dinheiro, abre uma janela de 24h, e não se edita antes de mandar
 * — mudar uma vírgula o invalida. Por isso os dois não compartilham o tipo: o compilador tem de
 * recusar quem tratar um como o outro.
 *
 * ── O preenchimento automático, e por que ele é medição e não chute ───────────────────────────
 * Medido em produção, 14/09, nos 318 aprovados:
 *
 *     sem variável ......... 197   (62%)  — saem sem ninguém digitar nada
 *     uma variável .......... 96   (30%)
 *     duas ou mais .......... 25    (8%)
 *
 * E o `exemplos` que a Meta guarda diz o que a variável É. Dos 96 de uma variável:
 *     72 são nome próprio simples ...... Maria · Luis · Sara · Zuleica
 *      7 "mãe" · 6 "pai" · 1 "avó" · 1 "tia" · 1 "esposo"  → parentesco de quem cuida
 *      5 cidade ......................... Belo Horizonte · Juiz de Fora
 *      3 nome completo
 *
 * Então a regra não é "o {{1}} é o nome". É: **o exemplo parece um primeiro nome ⇒ preenche com o
 * primeiro nome do lead**. Parentesco e cidade não passam nesse teste e ficam em branco, que é o
 * certo — "Oi, Maria!" no lugar de "Oi, mãe!" seria o sistema inventando um vínculo.
 */

export interface TemplateHsmNoChat {
  id: string;
  /** o nome NA META (`[a-z0-9_]`), que é o que a atendente digita depois da barra. */
  nome: string;
  corpo: string;
  /** os exemplos que a Meta guarda, por posição. É deles que sai o que cada variável significa. */
  exemplos: string[];
  categoria: string;
}

/** O que a conversa já sabe sobre quem vai receber. Vazio é estado normal, não erro. */
export interface SabidoDaConversa {
  primeiroNome?: string | undefined;
}

/** `{{1}}`, `{{2}}`… na ordem em que aparecem, sem repetir. */
export function posicoesDe(corpo: string): number[] {
  const achadas: number[] = [];
  for (const m of corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0 && !achadas.includes(n)) achadas.push(n);
  }
  return achadas.sort((a, b) => a - b);
}

/**
 * O exemplo parece um PRIMEIRO NOME?
 *
 * Uma palavra, inicial maiúscula, resto minúsculo. "Maria" passa; "mãe", "Belo Horizonte" e
 * "Diogo Vidigal da Fonseca" não — e é assim que tem de ser: no nome completo a Meta espera o nome
 * completo, e nós só sabemos o que o lead escreveu.
 *
 * ⚠️ Fail-closed de propósito. Um exemplo que não reconhecemos deixa a lacuna VISÍVEL para a
 * atendente preencher. O oposto — preencher no escuro — manda uma mensagem torta para paciente
 * real, e mensagem enviada não volta.
 */
export function exemploEhPrimeiroNome(exemplo: string | undefined): boolean {
  const e = (exemplo ?? "").trim();
  if (!e) return false;
  return /^[A-ZÀ-Ý][a-zà-ÿ'’-]{1,}$/.test(e);
}

export interface TemplateArmado {
  /** o texto como a paciente vai ler, com o que sabemos já dentro. */
  texto: string;
  /** os valores por posição, na ordem que a Meta espera. `""` = ainda falta. */
  parametros: string[];
  /** as posições que continuam vazias. Enviar fica travado enquanto houver alguma. */
  faltando: number[];
}

/**
 * Monta o template com o que a conversa já sabe.
 *
 * Devolve SEMPRE os três: o texto para ler, os parâmetros para mandar, e o que falta. Quem chama
 * não recalcula nada — dois lugares calculando "o que falta" é como a tela libera um envio que a
 * porta recusa.
 */
export function armarTemplate(t: TemplateHsmNoChat, sabido: SabidoDaConversa): TemplateArmado {
  const posicoes = posicoesDe(t.corpo);
  const valores = new Map<number, string>();

  for (const n of posicoes) {
    const exemplo = t.exemplos[n - 1];
    const nome = (sabido.primeiroNome ?? "").trim();
    if (nome && exemploEhPrimeiroNome(exemplo)) valores.set(n, nome);
  }

  let texto = t.corpo;
  for (const n of posicoes) {
    const v = valores.get(n);
    if (v) texto = texto.replaceAll(new RegExp(`\\{\\{\\s*${n}\\s*\\}\\}`, "g"), v);
  }

  return {
    texto,
    // a Meta espera POSICIONAL e contíguo: o índice do array é a posição menos um. Um buraco aqui
    // desloca todos os seguintes, e a mensagem sai com o nome no lugar da data.
    parametros: posicoes.length === 0 ? [] : Array.from({ length: Math.max(...posicoes) }, (_, i) => valores.get(i + 1) ?? ""),
    faltando: posicoes.filter((n) => !valores.get(n)),
  };
}

/**
 * Os que casam com o termo digitado depois da barra.
 *
 * Casa por PREFIXO do nome e por SUBSTRING do corpo — a atendente às vezes lembra a frase e não o
 * nome do template. Sem acento e sem caixa nos dois lados.
 *
 * O limite existe porque são 317 aprovados num canal só (medido): uma lista que não cabe na tela é
 * uma lista que não se usa, e rolar 317 no meio de uma conversa é pior que não ter o recurso.
 */
export function filtrarHsm(lista: TemplateHsmNoChat[], termo: string, limite = 6): TemplateHsmNoChat[] {
  const alvo = normalizar(termo);
  if (!alvo) return lista.slice(0, limite);
  const porNome = lista.filter((t) => normalizar(t.nome).startsWith(alvo));
  const porCorpo = lista.filter((t) => !porNome.includes(t) && normalizar(t.corpo).includes(alvo));
  return [...porNome, ...porCorpo].slice(0, limite);
}

function normalizar(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** O motivo da trava, na mesma frase que a UI mostra e que o envio devolve. */
export function motivoFaltando(faltando: number[]): string {
  if (faltando.length === 0) return "";
  const quais = faltando.map((n) => `{{${n}}}`).join(", ");
  return `complete ${quais} antes de mandar — o template sai como está escrito`;
}

/**
 * M4 · REGRAS PURAS do histórico do lead. Sem I/O, sem React — é aqui que a lógica mora, e é por
 * isso que ela é testável sem banco.
 *
 * O M4 é o único item da R18 que **só lê**: zero migration, zero evento, zero escrita. A defesa
 * dele não está numa guarda de porta — está na LISTA FECHADA de tipos e no fato de que nada aqui
 * inventa dado que o ledger não tem.
 */

/**
 * A LISTA FECHADA, e ela é a guarda do item.
 *
 * Se um dia alguém carimbar `lead_id` em `mensagem_status` — 3.623 dos 5.598 eventos, hoje sempre
 * nulo —, a aba **não cresce**, porque o tipo não está aqui. Sem a lista, um lead passaria de 3
 * linhas para dezenas sem ninguém ter tocado no M4.
 */
export const TIPOS_HISTORICO = ["lead_criado", "etapa_alterada", "dono_atribuido"] as const;
export type TipoHistorico = (typeof TIPOS_HISTORICO)[number];

export function tipoDoHistorico(v: unknown): v is TipoHistorico {
  return typeof v === "string" && (TIPOS_HISTORICO as readonly string[]).includes(v);
}

/** Uma linha do histórico, já projetada — nunca o `payload` inteiro (45× mais byte). */
export interface EventoHistorico {
  id: string;
  posicao_global: number;
  tipo: TipoHistorico;
  ator: string;
  origem: string;
  criado_em: string;
  etapa_de: string | null;
  etapa_para: string | null;
  /** `payload.etapa` do `lead_criado` — a etapa em que o lead nasceu. */
  etapa_inicial: string | null;
  /** `null` em `dono_atribuido` é REMOÇÃO EXPLÍCITA, não dado faltando. */
  dono_id: string | null;
  motivo: string | null;
}

// ───────────────────────────────── resolvedor de ator ─────────────────────────────────

export type EspecieAtor = "pessoa" | "pessoa_removida" | "agente" | "sistema" | "desconhecido";

export interface AtorResolvido {
  especie: EspecieAtor;
  /** o que a tela mostra. NUNCA vazio. */
  rotulo: string;
}

const RE_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * As SEIS formas de `ator` que existem no ledger, medidas — não previstas.
 *
 * A resolução é feita no CLIENTE, com a lista de pessoas que a página já carrega (`mencionaveis`).
 * A variante com `join` no banco foi medida e custa `Seq Scan on usuario` + `Hash Right Join` sobre
 * expressão funcional dos DOIS lados — que nenhum índice pode servir — e resolveria só 4 das 13
 * identidades. Zero consulta é mais barato E resolve mais.
 *
 * A regra que não se negocia: **nunca renderiza vazio**. Ator não resolvido é 9 das 13 identidades
 * humanas hoje; se a tela mostrasse branco, a linha inteira viraria ruído.
 */
export function resolverAtor(
  ator: string | null | undefined,
  pessoas: ReadonlyMap<string, string>,
  agentes: ReadonlyMap<string, string> = new Map(),
): AtorResolvido {
  const bruto = (ator ?? "").trim();
  if (!bruto) return { especie: "desconhecido", rotulo: "origem desconhecida" };

  const sep = bruto.indexOf(":");
  const prefixo = sep === -1 ? "" : bruto.slice(0, sep);
  const resto = sep === -1 ? bruto : bruto.slice(sep + 1);

  if (prefixo === "agente") {
    return { especie: "agente", rotulo: `${agentes.get(resto) ?? resto} (agente)` };
  }
  if (prefixo === "sistema") {
    // separado de gente DE PROPÓSITO: "o sistema mudou a etapa" e "a Sara mudou a etapa" são
    // afirmações diferentes, e confundi-las faz alguém procurar um responsável que não existe.
    return { especie: "sistema", rotulo: `sistema · ${resto}` };
  }
  if (prefixo === "humano") {
    const nome = pessoas.get(resto);
    if (nome) return { especie: "pessoa", rotulo: nome };
    if (RE_UUID.test(resto)) {
      // uuid sem nome = pessoa que saiu do workspace. Mostrar o uuid inteiro é ruído; mostrar
      // nada é mentira. Os 8 primeiros caracteres bastam para duas linhas serem distinguidas.
      return { especie: "pessoa_removida", rotulo: `Usuário removido (${resto.slice(0, 8)})` };
    }
    // `humano:<email>` e `humano:<texto livre>` — o legado do import. O texto é o melhor que há.
    return { especie: "pessoa", rotulo: resto };
  }
  return { especie: "desconhecido", rotulo: bruto };
}

// ─────────────────────────────── tradutor de etapa ───────────────────────────────

export interface EtapaTraduzida {
  rotulo: string;
  /** true = o slug não está na config `funil_vendas` vigente. A tela marca, nunca esconde. */
  foraDaConfig: boolean;
}

/**
 * Slug → nome, **pela config** (Constituição §4: vocabulário é dado, não código). Um mapa hardcode
 * aqui é reprovação declarada (C3 da SPEC-M4).
 *
 * Etapa fora da config ACONTECE HOJE — medido: `novo` 1× e `qualificando` 1×. A tela renderiza o
 * slug **mais** a marca "fora da configuração atual". Nunca linha em branco: um histórico com uma
 * seta apontando para o nada é pior que um slug feio.
 */
export function traduzirEtapa(
  slug: string | null | undefined,
  etapas: ReadonlyMap<string, string>,
): EtapaTraduzida | null {
  const s = (slug ?? "").trim();
  if (!s) return null;
  const nome = etapas.get(s);
  return nome ? { rotulo: nome, foraDaConfig: false } : { rotulo: s, foraDaConfig: true };
}

// ─────────────────────── colapsador de duplicata IDÊNTICA ───────────────────────

export interface LinhaHistorico {
  evento: EventoHistorico;
  /** quantos eventos idênticos e consecutivos esta linha representa. 1 = linha normal. */
  repeticoes: number;
}

/**
 * Colapsa eventos **consecutivos** que são idênticos em tipo, ator, instante E valor.
 *
 * DELIBERADAMENTE ESTREITO, e cada exclusão tem motivo:
 *  · não agrupa por JANELA de tempo — janela esconderia duas trocas reais no mesmo minuto, e duas
 *    trocas em um minuto é exatamente a informação que alguém foi procurar;
 *  · não agrupa atores diferentes — "quem" é metade do que a linha responde;
 *  · não agrupa valores diferentes — colapsar `A→B` com `B→C` inventaria um salto que não houve.
 *
 * O que ele existe para resolver é o backfill em lote, que grava o mesmo evento repetido no mesmo
 * carimbo. Fora disso, ele não deve fazer nada — e não faz.
 */
export function colapsarDuplicatas(eventos: readonly EventoHistorico[]): LinhaHistorico[] {
  const linhas: LinhaHistorico[] = [];
  for (const e of eventos) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && mesmaCoisa(ultima.evento, e)) {
      ultima.repeticoes += 1;
      continue;
    }
    linhas.push({ evento: e, repeticoes: 1 });
  }
  return linhas;
}

function mesmaCoisa(a: EventoHistorico, b: EventoHistorico): boolean {
  return (
    a.tipo === b.tipo &&
    a.ator === b.ator &&
    a.criado_em === b.criado_em &&
    a.etapa_de === b.etapa_de &&
    a.etapa_para === b.etapa_para &&
    a.etapa_inicial === b.etapa_inicial &&
    a.dono_id === b.dono_id
  );
}

// ─────────────────── os três estados do responsável (E1/E2/E3) ───────────────────

export type EstadoResponsavel = "E1" | "E2" | "E3";

export interface LeituraResponsavel {
  estado: EstadoResponsavel;
  /** a frase que a aba mostra. `null` em E3 — lá a frase DESAPARECE e os itens falam. */
  frase: string | null;
}

/**
 * Os três estados se sucedem **pelo DADO**, nunca por flag.
 *
 * Isto não é preferência de estilo. O M4 é o 8º da fila: escrito como `if (M3_ENTREGOU)`, os dois
 * primeiros estados viram código morto no dia do deploy. Escritos como consequência do dado, eles
 * **se aposentam sozinhos** — e, o que pesa mais, **E1 e E2 não são estados de transição da rodada,
 * são permanentes do acervo**: 574 leads têm responsável que nunca passou pelo ledger, e nenhuma
 * atribuição futura cria histórico retroativo.
 *
 * REGRA QUE ATRAVESSA OS TRÊS: **nunca inventar linha de histórico a partir de `core.lead.dono`.**
 * Em E1 e E2 o estado atual NÃO é evento; renderizá-lo como item datado seria afirmar um registro
 * que não existe. Resolver o nome não transforma estado em evento — por isso esta função devolve
 * uma FRASE, e nunca um item de lista.
 */
export function lerResponsavel(
  qtdDonoAtribuido: number,
  donoLegado: string | null,
  /** nome resolvido do `donoLegado` pelo de-para do M3. `null` = ainda não há de-para. */
  nomeResolvido: string | null,
): LeituraResponsavel {
  if (qtdDonoAtribuido > 0) return { estado: "E3", frase: null };

  const legado = (donoLegado ?? "").trim();
  if (!legado) {
    return {
      estado: "E1",
      frase: "Este lead não tem responsável, e nunca teve troca registrada no histórico.",
    };
  }
  if (nomeResolvido) {
    // E2 mostra OS DOIS: o valor bruto do Kommo nunca aparece disfarçado de nome de pessoa, e
    // nunca é escondido. `core.lead.dono` é origem histórica; `dono_id` é identidade.
    return {
      estado: "E2",
      frase:
        `Responsável atual: ${nomeResolvido} — vindo do cadastro legado (${legado}), ` +
        `não de uma troca registrada. O histórico de responsável começa na primeira atribuição feita aqui.`,
    };
  }
  return {
    estado: "E1",
    frase:
      `Responsável atual: ${legado} — valor do sistema antigo, ainda sem vínculo com uma pessoa ` +
      `do workspace. Nenhuma troca de responsável foi registrada no histórico.`,
  };
}

// ────────────────────────────── corte declarado ──────────────────────────────

// ─────────────── construtores de mapa (os dois lugares montam IGUAL) ───────────────

/**
 * Os dois lugares onde a aba aparece — o painel do inbox e o drawer do funil — já têm em mão as
 * mesmas duas listas (`mencionaveis` e `etapas`). Montar os mapas aqui, e não em cada tela, é o
 * que impede as duas de divergirem em silêncio: uma resolvendo agente e a outra não, uma tratando
 * etapa fora da config e a outra mostrando branco.
 *
 * Separa PESSOA de AGENTE de propósito: `humano:<uuid>` e `agente:<slug>` são espaços de nome
 * distintos, e um mapa único faria um slug de agente resolver como pessoa se os valores colidissem.
 */
export function mapaDePessoas(
  mencionaveis: readonly { id: string; nome: string; tipo: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of mencionaveis) if (p.tipo !== "agente") m.set(p.id, p.nome);
  return m;
}

export function mapaDeAgentes(
  mencionaveis: readonly { id: string; nome: string; tipo: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of mencionaveis) if (a.tipo === "agente") m.set(a.id, a.nome);
  return m;
}

/** Slug → nome, a partir da config `funil_vendas` que as duas telas já carregam. */
export function mapaDeEtapas(
  etapas: readonly { chave: string; nome: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of etapas) m.set(e.chave, e.nome);
  return m;
}

// ────────────────────────────── corte declarado ──────────────────────────────

/** O teto medido hoje é 3 eventos por lead. O corte não ocorre — e mesmo assim é declarado. */
export const LIMITE_HISTORICO = 200;

/**
 * Corte SILENCIOSO é a diferença entre "este lead tem 200 eventos" e "este lead tem pelo menos
 * 200". A segunda é verdade; a primeira é o que a tela diria sem isto.
 */
export function houveCorte(quantidade: number): boolean {
  return quantidade >= LIMITE_HISTORICO;
}

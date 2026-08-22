/**
 * ESCOPO DE DEPARTAMENTO — o núcleo puro, sem rede e sem React.
 *
 * Departamento é ESCOPO, não filtro (SPEC-M6 §5.7.1): trocar não estreita um resultado, descarta e
 * refaz o mundo. Aqui mora só a álgebra do escopo; a hierarquia NÃO mora aqui.
 *
 * ONDE A HIERARQUIA MORA, e por que não é neste arquivo: quem sabe quem descende de quem é
 * `core.v_departamento_arvore` (fechamento transitivo, entregável do M8 — `PLANO-TECNICO-M8.md:159`,
 * "evita recursão no gate e no escopo"). Se eu reimplementasse a travessia em TypeScript, a
 * hierarquia passaria a morar em dois lugares e o header viraria mais uma fonte do mesmo conceito —
 * que é exatamente a doença que o C12 e o C13 existem para impedir. Estas funções RECEBEM a árvore
 * já resolvida pelo banco e só fazem a álgebra em cima dela.
 *
 * Vocabulário: nenhum literal de departamento neste arquivo, exceto `CLINICO` — e ele está aqui
 * porque a fronteira do clínico é CONSTITUCIONAL, não organizacional (ARB-R17-07 + Constituição §7:
 * "clínico ≠ comercial"). Um valor cuja regra é constitucional não pode depender de a config estar
 * escrita certa: se `clinico` sumisse da config, o fail-closed sumiria junto, em silêncio.
 */

/** Uma linha de `core.v_departamento`. */
export interface Departamento {
  chave: string;
  rotulo: string;
  pai: string | null;
  nivel: number;
  ativo: boolean;
  entrada: boolean;
  ordem: number;
}

/** Uma linha de `core.v_departamento_arvore` — fechamento transitivo, INCLUI a si mesma. */
export interface ParAncestral {
  chave: string;
  ancestral: string;
}

/** Uma linha de `core.v_departamento_sinonimo`. */
export interface Sinonimo {
  chave: string;
  sinonimo: string;
}

/**
 * O conjunto de valores de `core.conversa.area` que o escopo ativo cobre.
 *
 * `incluiSemDepartamento` é SEMPRE true e não é opção: é o D6-g. Sem "Todos os departamentos"
 * (morto pelo D6-f), escopo estrito sobre cobertura de 10,6% esconderia 608 de 680 leads — e isso
 * apareceria como bug do M6 no dia da entrega, sem ser bug. O que não tem classificação aparece
 * numa faixa nomeada: incomoda em vez de desaparecer.
 */
export interface Escopo {
  chave: string;
  areas: string[];
  incluiSemDepartamento: true;
}

/**
 * A fronteira constitucional. `clinico` é FAIL-CLOSED desde o dia 1 (ARB-R17-07): quem não tem
 * vínculo explícito não o vê — e "não vê" é não ver o DADO, não só não ver o nome num dropdown.
 */
export const CLINICO = "clinico";

/** Folha = nó sem filhos ATIVOS (SPEC-M8 §4.1, decisão de desenho nº 3). Computado da árvore. */
export function ehFolha(chave: string, deps: Departamento[]): boolean {
  return !deps.some((d) => d.ativo && d.pai === chave);
}

export function folhas(deps: Departamento[]): Departamento[] {
  return deps.filter((d) => d.ativo && ehFolha(d.chave, deps));
}

/**
 * Descendentes de `chave` (inclusive ela mesma), lidos do fechamento transitivo do banco.
 *
 * A hierarquia é ASSIMÉTRICA de propósito (SPEC-M6 §5.7.3, fechado com o Estaleiro): **pai cobre
 * filho, filho não cobre pai, irmão não cobre irmão.** É o que faz "Comercial" ser escolha com
 * sentido em vez de cabeçalho decorativo — e é o que mantém as 73 conversas congeladas em
 * `comercial` (chave de nível 1) visíveis sob Comercial e invisíveis sob Pré-venda.
 */
export function descendentesDe(chave: string, arvore: ParAncestral[]): string[] {
  return arvore.filter((p) => p.ancestral === chave).map((p) => p.chave);
}

/**
 * O escopo ativo, em valores de `area`.
 *
 * Três coisas entram no conjunto, e cada uma tem motivo medido:
 *  1. a própria chave e os descendentes dela — a hierarquia assimétrica acima;
 *  2. os SINÔNIMOS de cada uma — os valores congelados que o D6-c transformou em identidade
 *     deixaram dois sinônimos vivos (`financeiro`→`cobranca`, `clinica`→`clinico`, SPEC-M8 §4.1).
 *     Sem eles, uma linha gravada como `financeiro` sumiria de Cobrança sem ninguém notar;
 *  3. NADA MAIS. Em particular, um descendente que a pessoa não pode ver é SUBTRAÍDO — ver
 *     `visiveis` abaixo.
 *
 * O parâmetro `visiveis`, e ele é o conserto de um buraco real do desenho: a spec põe o
 * fail-closed do `clinico` em `lerDepartamentosVisiveis` (a LISTA), e ao mesmo tempo diz que
 * selecionar o pai significa a UNIÃO dos filhos. As duas regras juntas produzem o vazamento:
 * `clinico` sai do dropdown, mas quem selecionasse `pos_venda` levaria `clinico` junto no escopo,
 * e o fail-closed viraria decoração. Asserção que fica do lado de dentro não alcança a fronteira
 * (MÉTODO §21). Por isso a subtração é aqui, na resolução, e não só na lista.
 */
export function resolverEscopo(
  chaveAtiva: string,
  arvore: ParAncestral[],
  sinonimos: Sinonimo[],
  visiveis: string[],
): Escopo {
  const podeVer = new Set(visiveis);
  const chaves = [chaveAtiva, ...descendentesDe(chaveAtiva, arvore)].filter((c) => podeVer.has(c));
  const conjunto = new Set(chaves);
  for (const s of sinonimos) if (conjunto.has(s.chave)) conjunto.add(s.sinonimo);
  return { chave: chaveAtiva, areas: [...conjunto].sort(), incluiSemDepartamento: true };
}

/**
 * Quais departamentos a pessoa vê.
 *
 * FAIL-OPEN (ARB-R17-02-bis): `core.usuario_departamento` **nasce vazia** (SPEC-M8 §4.4).
 * Fail-closed deixaria, no dia do deploy, ninguém vendo nada em nenhuma tela. E é seguro porque
 * departamento é escopo organizacional, não permissão: `area` nunca foi RLS (SPEC-M8 §2.2, zero
 * políticas em `pg_policies` mencionam `area`) — não se afrouxa o que nunca esteve fechado.
 *
 * COM UMA EXCEÇÃO, e é a única: `clinico`. Fail-open num escopo organizacional é conveniência;
 * fail-open no clínico é vazamento. O custo de instalar hoje é ZERO literal — `clinico` tem 0
 * conversa, 0 canal, 0 agente e `core.paciente` tem 0 linhas. Instalado antes de existir o que
 * vazar custa uma cláusula; depois custa uma auditoria de tudo o que já circulou.
 *
 * `owner`/`admin` veem tudo, inclusive `clinico`: são os papéis que a porta já trata como capazes
 * de publicar config (SPEC-M8 §2.6), e esconder deles produziria um administrador que não consegue
 * auditar o que administra.
 */
export function visiveisPara(
  deps: Departamento[],
  vinculos: string[],
  // `marketing` (0250) entra pelo mesmo ramo de `membro`, e isso e o certo: ele nao e papel de
  // gestao, entao nao ganha a visao total; sem vinculo cai no fail-open, que ja exclui a
  // fronteira constitucional do `clinico`. Papel novo nunca deve estrear com MAIS visao.
  papel: "owner" | "admin" | "membro" | "marketing" | null,
): Departamento[] {
  const ativos = deps.filter((d) => d.ativo);
  if (papel === "owner" || papel === "admin") return ativos;

  const vinculado = new Set(vinculos);
  if (vinculado.size === 0) {
    // fail-open: vê tudo, MENOS a fronteira constitucional
    return ativos.filter((d) => d.chave !== CLINICO);
  }
  // com vínculo: vê o que foi vinculado e o que descende do que foi vinculado (nível 1 implica os
  // filhos, SPEC-M8 §4.4 — uma regra de hierarquia no sistema, não duas). `clinico` só entra por
  // vínculo EXPLÍCITO nele: herdá-lo de um vínculo com `pos_venda` reabriria o fail-open pela
  // porta dos fundos.
  return ativos.filter((d) => {
    if (d.chave === CLINICO) return vinculado.has(CLINICO);
    if (vinculado.has(d.chave)) return true;
    let atual: string | null = d.pai;
    while (atual) {
      if (vinculado.has(atual)) return true;
      atual = ativos.find((a) => a.chave === atual)?.pai ?? null;
    }
    return false;
  });
}

/**
 * O departamento ativo, dado o que o cookie pediu e o que a pessoa pode ver.
 *
 * O cookie NÃO é a verdade, é a preferência (SPEC-M6 §6.3). Chave que a pessoa não vê, ou que foi
 * arquivada, é tratada como AUSENTE — nunca como erro e nunca como acesso. Sem esta validação,
 * trocar o cookie no navegador seria trocar de escopo, e mesmo escopo não sendo permissão, não se
 * deixa o cliente cravar o que o servidor lê.
 *
 * Sem preferência válida, o ativo é o primeiro visível na ordem da config. Não existe "Todos"
 * (D6-f): o rótulo do topo é promessa dura, e "Todos" era a única opção que não podia ser promessa.
 */
export function escolherAtivo(visiveis: Departamento[], preferida: string | null): Departamento | null {
  if (visiveis.length === 0) return null;
  const pedida = preferida ? visiveis.find((d) => d.chave === preferida) : undefined;
  if (pedida) return pedida;
  const ordenados = ordenar(visiveis);
  return ordenados[0] ?? null;
}

/**
 * Quais departamentos têm PENDÊNCIA — o insumo do ponto no departamento inativo (D6-f).
 *
 * Binário por construção: quem chama recebe um conjunto de chaves, não números. Número no header
 * cai na ARB-R17-33 e no 755 do Kommo — *"a fila vermelha tinha 755 itens e ninguém olhava"*
 * (`components/sidebar.tsx:119-120`, escrito por quem viveu o problema).
 *
 * Por que isto é ESCOPO e não opcional: sem "Todos" (D6-f), quem opera em duas áreas fica cego na
 * área que não está olhando, e "só um por vez" vira armadilha. É o padrão do Slack — marca de
 * pendência no contexto que NÃO está ativo (BENCHMARK §3-bis.2).
 *
 * A pendência de um PAI inclui a dos filhos, pela mesma hierarquia assimétrica do escopo: quem está
 * em Pós-venda precisa saber que há coisa em Cobrança sem precisar entrar lá.
 */
export function chavesComPendencia(
  visiveis: Departamento[],
  arvore: ParAncestral[],
  sinonimos: Sinonimo[],
  porArea: Map<string | null, number>,
): string[] {
  const chavesVisiveis = visiveis.map((d) => d.chave);
  return visiveis
    .filter((d) => {
      const escopo = resolverEscopo(d.chave, arvore, sinonimos, chavesVisiveis);
      return escopo.areas.some((a) => (porArea.get(a) ?? 0) > 0);
    })
    .map((d) => d.chave);
}

/** Ordem de exibição: nível 1 pela `ordem` da config, filhos logo abaixo do pai, também por `ordem`. */
export function ordenar(deps: Departamento[]): Departamento[] {
  const raizes = deps.filter((d) => !d.pai).sort((a, b) => a.ordem - b.ordem);
  const saida: Departamento[] = [];
  for (const r of raizes) {
    saida.push(r);
    for (const f of deps.filter((d) => d.pai === r.chave).sort((a, b) => a.ordem - b.ordem)) {
      saida.push(f);
    }
  }
  // órfãos (pai fora da lista visível) entram no fim, nunca somem: departamento que existe e não
  // aparece é pior que departamento fora de ordem.
  for (const d of deps) if (!saida.includes(d)) saida.push(d);
  return saida;
}

/**
 * M6 · O PREDICADO DE ESCOPO, e ele é a coisa que o C9 mede.
 *
 * O escopo entra na CONSULTA a `core.v_conversa`, no servidor — não como `filter()` depois de a
 * lista chegar ao navegador. Escopo real e filtro de cliente são VISUALMENTE IDÊNTICOS; a única
 * coisa que os separa é o que viaja no HTML. Por isso esta função devolve uma cláusula PostgREST e
 * não um array já lido.
 *
 * `area is null` entra SEMPRE (D6-g): é a faixa "Sem departamento". Sem ela, escopo estrito sobre
 * cobertura de 10,6% seria indistinguível de perda de dado — 72 cards de 680 no dia da entrega.
 *
 * A guarda de forma da chave não é paranoia de injeção (a chave vem do banco, validada contra
 * `v_usuario_departamento`): é para que uma chave com vírgula ou parêntese não quebre a sintaxe do
 * `or` do PostgREST em silêncio, transformando escopo em consulta sem filtro — que é o modo de
 * falha caro, porque parece funcionar.
 */
const CHAVE_DE_AREA = /^[a-z0-9_]+$/;

export function clausulaEscopo(escopo: Escopo | null | undefined): string | null {
  if (!escopo) return null;
  const chaves = escopo.areas.filter((a) => CHAVE_DE_AREA.test(a));
  if (chaves.length === 0) return "area.is.null";
  return `area.in.(${chaves.join(",")}),area.is.null`;
}

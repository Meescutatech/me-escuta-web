/**
 * MENÇÃO `@` — resolução do alvo para ID NA ESCRITA (Rodada 13 / Bloco C).
 * Spec: SPEC-NOTAS-TAREFAS-MENCOES §6.4, §6.1, §7 e §7-bis; decisão D4 (agente não age).
 *
 * A regra que governa este arquivo: **o texto exibe o nome, o dado gravado é o id.** Escolher
 * alguém no autocomplete resolve para `uuid` (pessoa) ou id de agente naquele instante; o
 * evento `mencao_criada` carrega esse id. Em nenhum momento se lê `@Fulano` de volta do texto
 * para descobrir quem é — foi assim que o Kommo acabou com `@Dani` e `@DANI` como pessoas
 * diferentes, e com 15 menções em 7.459 notas que não notificam ninguém.
 *
 * `mencoesVivas` parece contrariar isso e não contraria: ela não RESOLVE nada, só descarta a
 * menção cujo rótulo o autor apagou do texto antes de publicar. A identidade já estava decidida.
 */

export type TipoMencionavel = "humano" | "agente";

export interface Mencionavel {
  /** uuid de core.usuario (humano) ou id text de core.agente. */
  id: string;
  tipo: TipoMencionavel;
  nome: string;
  papel: string | null;
  /** humano revogado (v_membro.ativo=false) — mencionável, mas sem acesso (§6.1). */
  ativo: boolean;
}

export interface MencaoResolvida {
  id: string;
  tipo: TipoMencionavel;
  nome: string;
  /** o que ficou escrito no texto: "@Camila Rocha". */
  rotulo: string;
  /** humano sem acesso no momento da escrita — vira aviso efêmero só pro autor. */
  semAcesso: boolean;
}

export interface GatilhoMencao {
  /** índice do `@` no texto. */
  inicio: number;
  /** o que foi digitado depois do `@` até o cursor. */
  termo: string;
}

/**
 * Achou um `@` "de menção" imediatamente antes do cursor? Só conta se o `@` estiver no início
 * do campo ou depois de espaço — `email@dominio.com` não abre autocomplete. Espaço no termo
 * fecha o menu (nome com espaço entra pela escolha na lista, não pela digitação).
 */
export function gatilhoMencao(texto: string, caret: number): GatilhoMencao | null {
  const ate = texto.slice(0, Math.max(0, Math.min(caret, texto.length)));
  const inicio = ate.lastIndexOf("@");
  if (inicio < 0) return null;
  const anterior = inicio === 0 ? "" : ate[inicio - 1];
  if (anterior && !/\s/.test(anterior)) return null;
  const termo = ate.slice(inicio + 1);
  if (/[\s@]/.test(termo)) return null;
  return { inicio, termo };
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Casa por prefixo do nome inteiro OU de qualquer palavra dele ("rocha" acha "Camila Rocha"). */
function casa(m: Mencionavel, termo: string): boolean {
  if (!termo) return true;
  const alvo = normalizar(termo);
  const nome = normalizar(m.nome);
  return nome.startsWith(alvo) || nome.split(/\s+/).some((p) => p.startsWith(alvo));
}

/**
 * C5 — humanos e agentes em listas SEPARADAS. Agente aparece marcado "em breve" e não age
 * (D4); mencioná-lo grava o id do agente igual ao humano, para que ligar a ação depois seja
 * acender um consumidor de fila, não migrar dado.
 */
export function separarMencionaveis(
  lista: Mencionavel[],
  termo: string,
): { humanos: Mencionavel[]; agentes: Mencionavel[] } {
  const casam = lista.filter((m) => casa(m, termo));
  const ordem = (a: Mencionavel, b: Mencionavel) => a.nome.localeCompare(b.nome, "pt-BR");
  return {
    humanos: casam.filter((m) => m.tipo === "humano").sort(ordem),
    agentes: casam.filter((m) => m.tipo === "agente").sort(ordem),
  };
}

export function rotuloDe(alvo: Mencionavel): string {
  return `@${alvo.nome}`;
}

/** Troca `@termo` pelo rótulo do alvo e devolve a menção já resolvida para id. */
export function aplicarMencao(
  texto: string,
  caret: number,
  gatilho: GatilhoMencao,
  alvo: Mencionavel,
): { texto: string; caret: number; mencao: MencaoResolvida } {
  const rotulo = rotuloDe(alvo);
  const antes = texto.slice(0, gatilho.inicio);
  const depois = texto.slice(Math.min(caret, texto.length));
  const novo = `${antes}${rotulo} ${depois}`;
  return {
    texto: novo,
    caret: (antes + rotulo + " ").length,
    mencao: {
      id: alvo.id,
      tipo: alvo.tipo,
      nome: alvo.nome,
      rotulo,
      semAcesso: alvo.tipo === "humano" && !alvo.ativo,
    },
  };
}

/**
 * Menções cujo rótulo ainda está no texto na hora de publicar. Apagar "@Camila Rocha" do
 * rascunho não pode deixar a Camila recebendo notificação de uma frase que não existe.
 * Conta ocorrências: mencionar a mesma pessoa duas vezes e apagar uma mantém uma.
 */
export function mencoesVivas(texto: string, mencoes: MencaoResolvida[]): MencaoResolvida[] {
  const restante = new Map<string, number>();
  for (const m of mencoes) {
    if (restante.has(m.rotulo)) continue;
    restante.set(m.rotulo, ocorrencias(texto, m.rotulo));
  }
  const vivas: MencaoResolvida[] = [];
  for (const m of mencoes) {
    const n = restante.get(m.rotulo) ?? 0;
    if (n > 0) {
      vivas.push(m);
      restante.set(m.rotulo, n - 1);
    }
  }
  return vivas;
}

function ocorrencias(texto: string, agulha: string): number {
  if (!agulha) return 0;
  let n = 0;
  let i = texto.indexOf(agulha);
  while (i >= 0) {
    n += 1;
    i = texto.indexOf(agulha, i + agulha.length);
  }
  return n;
}

export type OrigemMencao = "nota" | "tarefa";

export interface PayloadMencaoCriada {
  mencionado_id: string;
  origem_tipo: OrigemMencao;
  origem_id: string;
  trecho: string;
}

const TRECHO_MAX = 240;

/**
 * Payload EXATO do contrato §5.2 — o ponto de encontro com o Bloco B (que projeta core.mencao
 * e monta o sino). O trecho é o contexto legível da menção, não o texto inteiro da nota.
 */
export function payloadMencaoCriada(
  mencao: MencaoResolvida,
  origemTipo: OrigemMencao,
  origemId: string,
  texto: string,
): PayloadMencaoCriada {
  return {
    mencionado_id: mencao.id,
    origem_tipo: origemTipo,
    origem_id: origemId,
    trecho: trechoDaMencao(texto, mencao.rotulo),
  };
}

/** Janela de texto em volta da menção, cortada em limite de palavra. */
export function trechoDaMencao(texto: string, rotulo: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= TRECHO_MAX) return limpo;
  const pos = limpo.indexOf(rotulo);
  if (pos < 0) return `${limpo.slice(0, TRECHO_MAX).trimEnd()}…`;
  const meio = Math.max(0, pos - Math.floor((TRECHO_MAX - rotulo.length) / 2));
  const fatia = limpo.slice(meio, meio + TRECHO_MAX).trim();
  return `${meio > 0 ? "…" : ""}${fatia}${meio + TRECHO_MAX < limpo.length ? "…" : ""}`;
}

/**
 * C8 — mencionar quem não tem acesso NÃO bloqueia (padrão Slack, §6.1). Devolve o aviso
 * efêmero que só o autor vê; `null` quando está tudo certo. A nota já foi publicada quando
 * este texto aparece — é informação, não erro.
 */
export function avisoSemAcesso(mencoes: MencaoResolvida[]): string | null {
  const sem = mencoes.filter((m) => m.semAcesso);
  if (sem.length === 0) return null;
  const nomes = sem.map((m) => m.nome);
  const quem =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return nomes.length === 1
    ? `${quem} não tem acesso ao sistema hoje e não vai receber o aviso. A nota foi salva.`
    : `${quem} não têm acesso ao sistema hoje e não vão receber o aviso. A nota foi salva.`;
}

export type Segmento =
  | { tipo: "texto"; texto: string }
  | { tipo: "mencao"; texto: string; alvo: TipoMencionavel };

/**
 * Quebra o texto para destacar as menções na leitura. Usa os rótulos das menções resolvidas
 * quando existem (caminho normal). Notas antigas, sem menção resolvida, saem como texto puro —
 * nunca inventamos menção por regex em cima de texto livre.
 */
export function segmentosComMencao(
  texto: string,
  mencoes: Pick<MencaoResolvida, "rotulo" | "tipo">[],
): Segmento[] {
  const rotulos = [...new Set(mencoes.map((m) => m.rotulo))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // o mais longo primeiro: "@Ana Paula" antes de "@Ana"
  if (rotulos.length === 0) return [{ tipo: "texto", texto }];
  const tipoPorRotulo = new Map(mencoes.map((m) => [m.rotulo, m.tipo]));

  const saida: Segmento[] = [];
  let i = 0;
  while (i < texto.length) {
    const achado = rotulos
      .map((r) => ({ r, pos: texto.indexOf(r, i) }))
      .filter((x) => x.pos >= 0)
      .sort((a, b) => a.pos - b.pos || b.r.length - a.r.length)[0];
    if (!achado) break;
    if (achado.pos > i) saida.push({ tipo: "texto", texto: texto.slice(i, achado.pos) });
    saida.push({
      tipo: "mencao",
      texto: achado.r,
      alvo: tipoPorRotulo.get(achado.r) ?? "humano",
    });
    i = achado.pos + achado.r.length;
  }
  if (i < texto.length) saida.push({ tipo: "texto", texto: texto.slice(i) });
  return saida;
}

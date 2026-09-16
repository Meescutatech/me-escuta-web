/**
 * F9 · LEITURA dos canais. SERVIDOR.
 *
 * Fonte: `core.v_canal_whatsapp` (ARB-21), que ainda NÃO EXISTE nesta base — as migrations
 * 0069/0075 são desta mesma noite. Tudo aqui degrada honesto (padrão da casa para deploy fora de
 * ordem): sem a view, a tela mostra "indisponível" com o motivo, nunca uma tela morta e nunca uma
 * lista vazia que pareça "não há canais".
 *
 * Duas ausências medidas no contrato, tratadas aqui e registradas no adendo ao Agent 3:
 *   • `inbox_desde` não está na view → o SELECT tenta com a coluna e cai para o sem-ela. Ausente
 *     significa "não sei", e "não sei" exige o corte na ativação (regra em regras/canais.ts).
 *   • Não há view nem RPC sobre `pgmq fila_saida` (e `pgmq`/`ops` estão fora da Data API) → a
 *     contagem de pendentes é `null`, e a confirmação de desligar vira INCONDICIONAL.
 */

import { criarClienteServidor } from "@/lib/supabase/server";
import {
  finalidadeValida,
  nivelValido,
  provedorValido,
  type Canal,
  type HistoricoNivel,
  type Provedor,
  type TrocaDeNivel,
} from "../regras/canais.ts";

/**
 * M7 · As colunas são pedidas em DEGRAUS, do mais completo para o mais antigo, e a razão é de
 * sequenciamento de deploy: a web pode subir ANTES da migration que acrescenta `finalidade` e
 * `consentimento_por` à view. PostgREST recusa a consulta INTEIRA quando uma coluna não existe —
 * sem os degraus, a tela de canais ficaria vazia num ambiente onde não há defeito nenhum, e lista
 * vazia é indistinguível de "não há canais".
 *
 * O degrau NÃO substitui a migration: sem a coluna, a funcionalidade não existe. O que ele compra
 * é que a falta apareça como "não sei", com o motivo, em vez de tela morta.
 */
const COLUNAS_BASE =
  "canal_id,nome,provedor,ativo,numero,waba_id,area_efetiva,pareado_em,consentimento_em,consentimento_titular,consentimento_texto_versao,risco_ban_aceito,desativado_em,criado_em";

/**
 * Do mais completo para o mais pobre. O primeiro que responder vence.
 *
 * R22/A1 · o degrau NOVO é o de cima, com `departamento`, e ele existe pelo mesmo motivo que o do
 * M7: a `0130` pode não estar aplicada no ambiente onde esta web subir. Sem ele, PostgREST recusa
 * a consulta INTEIRA por causa de uma coluna e a tela de canais fica vazia — indistinguível de
 * "não há canais".
 */
const COLUNAS_R22 = `${COLUNAS_BASE},inbox_desde,finalidade,consentimento_por,departamento`;

const DEGRAUS: {
  colunas: string;
  corte: boolean;
  m7: boolean;
  r22: boolean;
  d70: boolean;
  /** a view diz, por si, se ALGUEM declarou o nivel (coluna `nivel_declarado`) */
  declarado: boolean;
}[] = [
  /*
   * D70 · os dois degraus de cima sao novos, e existem pela MESMA razao dos outros tres: a web
   * sobe antes do banco (D18), PostgREST recusa a consulta INTEIRA por causa de uma coluna que
   * nao existe, e sem o degrau a tela de canais ficaria VAZIA num ambiente sem defeito nenhum —
   * indistinguivel de "nao ha canais".
   *
   * ⭐ SAO DOIS, e nao um, porque o FORMATO DA VIEW AINDA NAO EXISTE — a trilha do banco nao
   * escreveu a migration. Exigir as DUAS colunas seria um contrato unilateral: se o banco expuser
   * so `nivel` (derivado de `config_jsonb`, que e a forma que a trilha do runtime ja adotou —
   * `me-escuta-runtime/src/whatsapp/canais.ts` le `config_jsonb.nivel` e nao conhece coluna
   * nenhuma), o degrau de cima erraria 42703 em `nivel_declarado`, a leitura cairia para o degrau
   * do R22 e `nivelLegivel` ficaria `false` PARA SEMPRE — botao desabilitado, faixa ambar
   * permanente, feature nascida morta com rc=0 e nenhum erro em log nenhum. O degrade desenhado
   * para ser transitorio viraria o estado final.
   *
   * Entao a web aceita AS DUAS FORMAS, e o contrato com o banco fica escrito aqui:
   *   forma A · `nivel` text + `nivel_declarado` boolean  → nivelLegivel E declaracaoLegivel
   *   forma B · so `nivel` text                           → nivelLegivel; declaracaoLegivel=false,
   *             e a tela DIZ que esta base nao sabe dizer se alguem escolheu ou se e o padrao.
   *
   * MEDIDO em producao 08/09/2026: `core.v_canal_whatsapp` tem 18 colunas, exatamente as de
   * `COLUNAS_R22`, e nenhuma delas e `nivel`. Ou seja, HOJE quem responde e o TERCEIRO degrau
   * (`r22`) e `nivelLegivel` volta `false` — a tela diz que nao conseguiu ler, em vez de mostrar
   * "estrito" como se soubesse.
   */
  { colunas: `${COLUNAS_R22},nivel,nivel_declarado`, corte: true, m7: true, r22: true, d70: true, declarado: true },
  { colunas: `${COLUNAS_R22},nivel`, corte: true, m7: true, r22: true, d70: true, declarado: false },
  { colunas: COLUNAS_R22, corte: true, m7: true, r22: true, d70: false, declarado: false },
  { colunas: `${COLUNAS_BASE},inbox_desde,finalidade,consentimento_por`, corte: true, m7: true, r22: false, d70: false, declarado: false },
  { colunas: `${COLUNAS_BASE},inbox_desde`, corte: true, m7: false, r22: false, d70: false, declarado: false },
  { colunas: COLUNAS_BASE, corte: false, m7: false, r22: false, d70: false, declarado: false },
];

/** Nada respondeu. Um objeto so, para os dois caminhos nao divergirem na proxima coluna nova. */
const INDISPONIVEL: CanaisLidos = {
  canais: [],
  indisponivel: true,
  corteLegivel: false,
  m7Legivel: false,
  r22Legivel: false,
  nivelLegivel: false,
  declaracaoLegivel: false,
};

export interface CanaisLidos {
  canais: Canal[];
  /** true = a view não existe ou a leitura falhou. A tela diz isso; não finge lista vazia. */
  indisponivel: boolean;
  /** false = a view não expõe `inbox_desde`; a ativação passa a exigir o corte sempre. */
  corteLegivel: boolean;
  /**
   * M7. `false` = a view ainda não tem `finalidade` nem `consentimento_por` (a `0094` não está
   * aplicada neste ambiente). A tela DIZ isso — senão mostra "Não declarada" em toda linha e a
   * gestora conclui que ninguém preencheu, quando o que falta é a coluna.
   */
  m7Legivel: boolean;
  /**
   * R22/A1. `false` = a view ainda não tem `departamento` (a `0130` não está aplicada neste
   * ambiente). A tela DIZ isso — senão mostra "Não declarado" em toda linha e a gestora conclui que
   * ninguém preencheu, quando o que falta é a coluna. É a mesma distinção que o `m7Legivel` fez.
   */
  r22Legivel: boolean;
  /**
   * D70. `false` = a view ainda nao expoe `nivel` (a migration do nivel nao esta aplicada neste
   * ambiente). A tela DIZ isso, e nao mostra "Estrito" como se tivesse lido — o comportamento
   * REAL nesse ambiente e mesmo o estrito, mas afirmar que se leu o que nao se leu e o engano do
   * M7 outra vez. Mesma distincao que `m7Legivel` e `r22Legivel` ja faziam.
   */
  nivelLegivel: boolean;
  /**
   * D70. `false` = esta base NAO diz se alguem declarou o nivel — ou porque a coluna `nivel` nao
   * existe (e ai `nivelLegivel` tambem e false), ou porque a view expoe `nivel` SEM
   * `nivel_declarado` (a forma B do contrato acima). No segundo caso o nivel VIGENTE foi lido e e
   * confiavel; o que nao da para saber e se ele foi ESCOLHIDO por alguem ou se e o padrao de quem
   * nunca declarou. A tela diz exatamente isso, em vez de afirmar "ninguem escolheu" — que seria
   * inventar uma leitura que nao houve.
   */
  declaracaoLegivel: boolean;
}

function mapear(
  linha: Record<string, unknown>,
  temCorte: boolean,
  temM7: boolean,
  temR22: boolean,
  temD70: boolean,
  temDeclarado: boolean,
): Canal | null {
  const canalId = String(linha.canal_id ?? "").trim();
  if (!canalId) return null;
  const provedorBruto = String(linha.provedor ?? "waba");
  const provedor: Provedor = provedorValido(provedorBruto) ? provedorBruto : "waba";
  return {
    canal_id: canalId,
    nome: String(linha.nome ?? canalId),
    provedor,
    ativo: linha.ativo === true,
    numero: linha.numero ? String(linha.numero) : null,
    waba_id: linha.waba_id ? String(linha.waba_id) : null,
    area_efetiva: linha.area_efetiva ? String(linha.area_efetiva) : null,
    pareado_em: linha.pareado_em ? String(linha.pareado_em) : null,
    consentimento_em: linha.consentimento_em ? String(linha.consentimento_em) : null,
    consentimento_titular: linha.consentimento_titular ? String(linha.consentimento_titular) : null,
    consentimento_texto_versao: linha.consentimento_texto_versao ? String(linha.consentimento_texto_versao) : null,
    risco_ban_aceito: linha.risco_ban_aceito === true || provedor === "nao_oficial",
    desativado_em: linha.desativado_em ? String(linha.desativado_em) : null,
    criado_em: linha.criado_em ? String(linha.criado_em) : null,
    inbox_desde: temCorte && linha.inbox_desde ? String(linha.inbox_desde) : null,
    consentimento_por: temM7 && linha.consentimento_por ? String(linha.consentimento_por) : null,
    // `null` aqui significa "não declarada" OU "coluna ausente" — nunca "produção". Quem decide
    // qual dos dois é o `m7Legivel`, e a tela mostra textos diferentes para cada um.
    finalidade: temM7 && finalidadeValida(linha.finalidade) ? linha.finalidade : null,
    // `null` = "coluna ausente" OU "nunca declarado" — nunca um departamento inventado. Quem
    // distingue os dois é o `r22Legivel`, e a tela tem texto diferente para cada um.
    departamento: temR22 && linha.departamento ? String(linha.departamento) : null,
    // D70 · `null` = coluna ausente OU valor fora do dominio. Os dois valem `estrito` por
    // `nivelDoCanal`, e NENHUM dos dois vira permissao: fail-closed em toda ignorancia.
    nivel: temD70 && nivelValido(linha.nivel) ? linha.nivel : null,
    // Valor gravado fora do dominio NAO conta como declaracao — e ruido, e ruido nao e escolha de
    // ninguem. Por isso o `nivelValido` aparece nas duas linhas, e nao so na de cima.
    //
    // `temDeclarado` false (forma B da view: `nivel` sem `nivel_declarado`) tambem devolve false
    // aqui, e por isso a tela NAO pode ler este campo sozinha: false significa "nao declarado" OU
    // "esta base nao sabe dizer", e quem separa os dois e `declaracaoLegivel`. Derivar a
    // declaracao de `nivel != null` seria adivinhar o encoding da view que ainda nao existe.
    nivel_declarado:
      temD70 && temDeclarado && linha.nivel_declarado === true && nivelValido(linha.nivel),
  };
}

/**
 * O parâmetro `cliente` existe pela MESMA razão que o de `lerConversas`, e a razão está escrita lá
 * — *"por exigência de spec, não por conveniência de teste: os portões precisam injetar um cliente
 * falso… um portão que testa uma cópia da consulta não testa o produto"*.
 *
 * Aqui ele importa mais que na média, porque esta função tem **três degraus de coluna** e o de
 * BAIXO é o que roda **hoje** em produção. Sem ponto de injeção, o único caminho exercitável é o
 * de cima — o que só existe depois da `0094`.
 *
 * Forma **idêntica** à de `lerConversas`, por condição do GO: mesmo objeto de opções, mesmo
 * `type Supabase`, mesmo `cliente ?? criarClienteServidor()`. Nenhuma variante.
 */
type Supabase = ReturnType<typeof criarClienteServidor>;

export async function lerCanais(opcoes: { cliente?: Supabase } = {}): Promise<CanaisLidos> {
  const { cliente } = opcoes;
  try {
    const supabase = cliente ?? criarClienteServidor();
    const consulta = (colunas: string) =>
      supabase.schema("core").from("v_canal_whatsapp").select(colunas).limit(100);

    for (const degrau of DEGRAUS) {
      const { data, error } = await consulta(degrau.colunas);
      if (error || !data) continue;
      const canais = (data as unknown as Record<string, unknown>[])
        .map((l) => mapear(l, degrau.corte, degrau.m7, degrau.r22, degrau.d70, degrau.declarado))
        .filter((c): c is Canal => c !== null);
      return {
        canais,
        indisponivel: false,
        corteLegivel: degrau.corte,
        m7Legivel: degrau.m7,
        r22Legivel: degrau.r22,
        nivelLegivel: degrau.d70,
        declaracaoLegivel: degrau.declarado,
      };
    }
    // Nenhum degrau respondeu: a view não existe, ou a leitura falhou por outro motivo.
    return INDISPONIVEL;
  } catch {
    return INDISPONIVEL;
  }
}

export async function lerCanal(canalId: string): Promise<Canal | null> {
  const { canais } = await lerCanais();
  return canais.find((c) => c.canal_id === canalId) ?? null;
}

/**
 * 16/09 · O DONO do canal, lido à parte e não nos degraus da lista.
 *
 * Pôr `responsavel_id` nos DEGRAUS seria acorrentar a lista inteira a mais uma coluna — sem ela, o
 * PostgREST recusaria cada degrau até o de baixo, e a tela perderia `finalidade` e `departamento`
 * por causa de um campo que só o portão da sessão usa. Aqui a falha vale `null`, e `null` é "de
 * ninguém": o membro não pareia; a gestão não precisa do dono para parear.
 */
export async function lerResponsavelDoCanal(canalId: string): Promise<string | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_canal_whatsapp")
      .select("responsavel_id")
      .eq("canal_id", canalId)
      .maybeSingle();
    if (error || !data) return null;
    const id = String((data as { responsavel_id?: unknown }).responsavel_id ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * 16/09 · ONDE QUEM ESTÁ LOGADO ESTÁ LOTADO — a lista que a porta confere no registro do membro.
 *
 * Vem de `api.departamentos_do_uid`, a MESMA função que a 0337 usa para recusar com PMEE6: ler a
 * lotação crua e expandir a árvore aqui seria a regra morando em dois lugares. `p_uid` nulo é o
 * próprio chamador (a função faz `coalesce(p_uid, auth.uid())`). Falha vale `null` — "não sei" —, e
 * para o membro "não sei" não oferece departamento nenhum.
 */
export async function lerMinhasLotacoes(): Promise<string[] | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase.schema("api").rpc("departamentos_do_uid", { p_uid: null });
    if (error || !Array.isArray(data)) return null;
    return (data as unknown[])
      .map((d) => String(typeof d === "object" && d !== null ? Object.values(d)[0] ?? "" : d ?? "").trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Quantas mensagens deste canal estão em voo na fila de saída.
 *
 * SEMPRE `null` hoje, e isto é fato medido, não preguiça: a fila é `pgmq`, `pgmq` e `ops` estão
 * FORA da Data API por decisão declarada no `config.toml`, e não existe view nem RPC em `core`
 * que exponha a contagem. A tela usa o `null` para exigir confirmação INCONDICIONAL ao desligar —
 * mais estrito do que o EARS pedia, porque desligar canal com fila cheia transforma cada item em
 * falha PERMANENTE e isso não tem desfazer.
 */
export async function contarPendentesFilaSaida(_canalId: string): Promise<number | null> {
  return null;
}

// ═════════════════════ D71.c · a AUDITORIA do nível, medida e não prometida ═════════════════════

/**
 * O nível é CONFIG MUTÁVEL, e o evento no ledger é registro de INTENÇÃO — não é o estado.
 *
 * Isto não é filosofia, é medida: `porta.projecao_tabela` traz `core.canal_whatsapp` com
 * `no_replay: false`, ou seja `porta.reconstruir_projecao` NUNCA reconstrói esta tabela a partir
 * do ledger. Quem responde "qual é o nível agora" é `core.canal_whatsapp.config_jsonb`, e mais
 * ninguém. Escrever em doc ou em comentário que "o nível fica no ledger com autor e data" seria
 * dizer que o ledger manda no valor vigente, e ele não manda.
 *
 * O que o ledger tem de verdade — e que esta função entrega em vez da promessa — é a SÉRIE DE
 * INTENÇÕES: quem pediu qual nível, e quando. É auditoria real, com o limite escrito junto: se
 * alguém mudar `config_jsonb` por UPDATE direto, essa mudança NÃO aparece aqui, porque não passou
 * por evento nenhum. Foi exatamente assim que o canal `producao` foi ligado em 28/07 sem uma linha
 * no ledger.
 */
/*
 * ⚠️ `TrocaDeNivel` e `HistoricoNivel` moram em `../regras/canais.ts`, que é PURO — e não aqui.
 *
 * Não é organização: o portão `cliente` (tests/portao-web-b.test.ts) reprova componente client que
 * importe qualquer coisa de `dados/`, ainda que só o tipo, porque `import type` some na compilação
 * mas a linha continua no arquivo — e a primeira edição que apagar a palavra `type` passa a puxar
 * o cliente do Supabase e o segredo junto para o browser, sem erro nenhum. O painel precisa do
 * tipo; ele o pega do módulo puro.
 */

const PREFIXO_ATOR_HUMANO = "humano:";

export async function lerHistoricoNivel(
  canalId: string,
  opcoes: { cliente?: Supabase; limite?: number } = {},
): Promise<HistoricoNivel> {
  try {
    const supabase = opcoes.cliente ?? criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("evento")
      .select("id,tipo,ator,payload,criado_em")
      .eq("tipo", "canal_nivel_alterado")
      .eq("payload->>canal_id", canalId)
      .order("criado_em", { ascending: false })
      .limit(opcoes.limite ?? 20);
    if (error || !data) return { trocas: [], indisponivel: true };

    const linhas = data as unknown as Record<string, unknown>[];
    const trocas: TrocaDeNivel[] = linhas.map((l) => {
      const payload = (l.payload ?? {}) as Record<string, unknown>;
      return {
        evento_id: String(l.id ?? ""),
        nivel: String(payload.nivel ?? ""),
        motivo: payload.motivo ? String(payload.motivo) : null,
        quando: String(l.criado_em ?? ""),
        ator: String(l.ator ?? ""),
        autor_nome: null,
      };
    });

    // Os uids viram NOME numa consulta só. Falhar aqui não invalida a auditoria: sem o nome, a
    // tela mostra o `ator` cru, que ainda diz quem foi — pior seria esconder a linha inteira
    // porque o join não saiu.
    const uids = [
      ...new Set(
        trocas
          .map((t) => (t.ator.startsWith(PREFIXO_ATOR_HUMANO) ? t.ator.slice(PREFIXO_ATOR_HUMANO.length) : ""))
          .filter((u) => u.length > 0),
      ),
    ];
    if (uids.length > 0) {
      const { data: membros } = await supabase
        .schema("core")
        .from("v_membro")
        .select("id,nome")
        .in("id", uids);
      const porId = new Map(
        ((membros ?? []) as unknown as Record<string, unknown>[]).map((m) => [
          String(m.id ?? ""),
          m.nome ? String(m.nome) : null,
        ]),
      );
      for (const t of trocas) {
        const uid = t.ator.startsWith(PREFIXO_ATOR_HUMANO)
          ? t.ator.slice(PREFIXO_ATOR_HUMANO.length)
          : "";
        t.autor_nome = uid ? porId.get(uid) ?? null : null;
      }
    }

    return { trocas, indisponivel: false };
  } catch {
    return { trocas: [], indisponivel: true };
  }
}

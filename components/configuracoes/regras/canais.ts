/**
 * F9 · REGRAS PURAS do registro de números de WhatsApp.
 *
 * Fonte de leitura: `core.v_canal_whatsapp` (ARB-21). Escrita: SÓ por `api.registrar_evento`, com
 * os quatro tipos que os dois lados do contrato nomearam idêntico —
 * `canal_registrado` · `canal_atualizado` · `canal_ativado` · `canal_desativado`.
 *
 * Quatro coisas que o executor não descobre sozinho e que estão codificadas aqui:
 *
 *  1. `phone_number_id` CONTINUA sendo a chave, e o canal não oficial recebe um id LOCAL
 *     `lite:<slug-do-apelido>` — nunca o número. Pôr o telefone pessoal da fono numa chave
 *     primária lida por todo `authenticated` seria expor o número dela no catálogo
 *     (CONTRATO-C §4.4). O número fica em `numero_e164`, atrás da RLS de papel.
 *  2. CADASTRAR NÃO É LIGAR. `canal_registrado` nasce `ativo=false`; ligar é um segundo evento,
 *     com autor, que passa pela guarda de consentimento (CONTRATO-C §4.3).
 *  3. `provedor` NÃO é alterável depois do registro — a porta recusa. Um canal que troca de
 *     provedor troca de regime de filtro, e o histórico já ingerido não é reprocessável.
 *  4. Ativar sem `inbox_desde` DESPEJA O HISTÓRICO INTEIRO NO INBOX (0025:31-34, medido: o canal
 *     de produção está hoje nesse estado). ARB-18.1 fez disso guarda na porta; aqui é campo
 *     obrigatório do formulário, para a recusa não ser a primeira notícia.
 *
 * ─────────────────────────── M7 · R18 (SPEC-M7 §4.1-bis, §5.3) ───────────────────────────
 *
 *  5. IDENTIDADE É PRÉ-CONDIÇÃO DE VIDA. Número oficial (`waba`) não fica ativo sem `waba_id` E
 *     `numero_e164`. Medido em produção 28/07/2026: a linha `627327023793464` está `ativo=t` com
 *     os DOIS nulos — um número vivo que ninguém sabe qual é. A defesa real é a constraint
 *     `canal_waba_ativo_exige_identidade`; aqui é o que impede a recusa do banco de ser a
 *     primeira notícia. E `waba_id` passa a ser exigido no REGISTRO: hoje ele nunca é validado, e
 *     `payloadCanalRegistrado` só inclui a chave `if (waba)` — foi exatamente essa forma que
 *     gravou no ledger um `canal_registrado` sem identidade, calado.
 *
 *  6. TODO NÚMERO DECLARA A SUA FINALIDADE, e a tela nunca esconde qual é. Os dois números da Me
 *     Escuta são `+1 555` — faixa reservada da NANP, a que a Meta usa para TESTE — e o
 *     `627327023793464` carrega `verified_name = "Me Escuta"` com selo VERIFIED. Exibido sem
 *     qualificação, ele PARECE o número da empresa. `finalidade` é `NOT NULL` e SEM DEFAULT:
 *     default conveniente foi o que produziu o problema do item 2 (`ativo` nasceu `true` porque
 *     alguém escolheu um). Limite honesto da guarda: ver `ehFaixaTesteMeta`.
 */

import { montarEnvelope, payloadSeguro, type EnvelopeEvento, type VereditoEscrita } from "./porta.ts";
import { ehFolha, ordenar, type Departamento } from "../../../lib/departamentos/escopo.ts";

export type Provedor = "waba" | "nao_oficial";
export type Papel = "owner" | "admin" | "membro";

/**
 * O que este número está autorizado a fazer. Domínio fechado por
 * `check (finalidade in ('teste','producao'))` — igual a `provedor`, que é o precedente da casa.
 */
export type Finalidade = "teste" | "producao";

export const FINALIDADES: Finalidade[] = ["teste", "producao"];

export function finalidadeValida(v: unknown): v is Finalidade {
  return typeof v === "string" && (FINALIDADES as string[]).includes(v);
}

export function rotuloFinalidade(f: Finalidade | null): string {
  if (f === "producao") return "Produção";
  if (f === "teste") return "Teste";
  return "Não declarada";
}

/**
 * A faixa de teste da Meta, e os DOIS limites honestos que impedem alguém de superestimá-la.
 *
 * `+1 555` é a faixa reservada da NANP e é a que a Meta usa hoje para número de teste. Isto é uma
 * REDE sobre o engano medido nesta rodada, **não um classificador**: um número de teste fora dessa
 * faixa passa declarado como `producao` e esta função não tem como saber.
 *
 * E ela NÃO vale ao contrário: um número BR real declarado `teste` é permitido de propósito —
 * declarar MENOS privilégio do que se tem é sempre seguro, e proibir isso atrapalharia ensaio
 * legítimo. Foi assim que as 12 mensagens de 27/07 chegaram ao telefone do Diogo.
 */
export const FAIXA_TESTE_META = /^\+1555\d{7}$/;

export function ehFaixaTesteMeta(numero: string | null): boolean {
  return FAIXA_TESTE_META.test((numero ?? "").trim());
}

/**
 * Uma linha de `core.v_canal_whatsapp`.
 *
 * `inbox_desde` foi pedido no adendo da fase 1 e a `0069` o ENTREGOU na view. A leitura mantém o
 * caminho de degrade mesmo assim: `null` significa "ausente OU não legível", e os dois exigem o
 * corte na ativação — o dano do falso negativo é uma pergunta a mais; o do falso positivo é o
 * histórico inteiro do número no inbox de todo mundo, e isso não tem desfazer barato.
 */
export interface Canal {
  canal_id: string;
  nome: string;
  provedor: Provedor;
  ativo: boolean;
  numero: string | null;
  waba_id: string | null;
  /**
   * ⚠ APOSENTADA (R22/A1, D22-1) e mantida por UM motivo só: a `0130` deixou a coluna na view de
   * propósito, porque a web e o banco sobem em ordens diferentes (D18). Ela some no mesmo commit
   * que tira `area` do payload. NÃO ler daqui: quem manda é `departamento`.
   */
  area_efetiva: string | null;
  /**
   * R22/A1 · A PALAVRA ÚNICA. `null` significa **"a coluna ainda não existe neste ambiente OU o
   * canal nunca declarou"** — e a tela mostra "não declarado", que é a verdade nos dois casos.
   * Mesmo degrade honesto de `finalidade` (M7) e pela mesma razão: sem ele, o deploy da web ficaria
   * acorrentado ao do banco.
   */
  departamento: string | null;
  pareado_em: string | null;
  consentimento_em: string | null;
  consentimento_titular: string | null;
  consentimento_texto_versao: string | null;
  /** uuid do usuário que registrou o consentimento. A tela renderiza o NOME, nunca o uuid. */
  consentimento_por: string | null;
  risco_ban_aceito: boolean;
  desativado_em: string | null;
  criado_em: string | null;
  /** null = ausente OU não legível por esta tela. Os dois casos exigem o corte na ativação. */
  inbox_desde: string | null;
  /**
   * M7. `null` significa **"a coluna ainda não existe neste ambiente OU não é legível"**, e NUNCA
   * "produção" — a tela mostra "não declarada", que é a verdade. É o mesmo degrade honesto de
   * `inbox_desde`, e existe porque a web pode subir ANTES da migration que cria a coluna: sem
   * isso, o deploy da web ficaria acorrentado ao deploy do banco, e o D18 exige o contrário.
   *
   * Depois da migration a coluna é `NOT NULL`, então `null` volta a significar só "não legível".
   */
  finalidade: Finalidade | null;
}

export const PROVEDORES: Provedor[] = ["waba", "nao_oficial"];

export function provedorValido(v: unknown): v is Provedor {
  return typeof v === "string" && (PROVEDORES as string[]).includes(v);
}

export function rotuloProvedor(p: Provedor): string {
  return p === "waba" ? "Oficial (WhatsApp Cloud API)" : "Não oficial (biblioteca)";
}

/** Gerir canais é ação de gestão. A defesa real é a guarda da porta; aqui é ergonomia. */
export function podeGerirCanais(papel: Papel | null): boolean {
  return papel === "admin" || papel === "owner";
}

// ───────────────────────────────── id do canal não oficial ─────────────────────────────────

export const PREFIXO_LITE = "lite:";

/** "Sarah Müller" → "sarah-muller". Estável, legível e sem acento — é o que vira chave primária. */
export function slugApelido(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function canalIdNaoOficial(nome: string): string {
  return `${PREFIXO_LITE}${slugApelido(nome)}`;
}

export function ehCanalNaoOficialId(id: string): boolean {
  return (id ?? "").startsWith(PREFIXO_LITE);
}

// ───────────────────────────────────── validação do form ─────────────────────────────────────

export interface FormCanal {
  /** só o WABA declara: é o id da Meta. No não oficial o id é derivado do nome. */
  canalId: string;
  nome: string;
  provedor: Provedor;
  numeroE164: string;
  wabaId: string;
  /**
   * R22/A1 · CHAVE de `core.v_departamento`, e sempre FOLHA. `""` = não escolhido, e é o estado
   * inicial — mesma decisão de `finalidade`: o campo nasce sem valor, porque default conveniente
   * foi o que pôs `comercial` (nó de agrupamento) em dois canais e obrigou a rodada 18 a descê-los
   * à mão para a `0087` poder entrar.
   */
  departamento: string;
  /**
   * M7. `""` = **não escolhido**, e é o estado inicial do formulário por decisão de desenho: o
   * campo nasce SEM valor pré-selecionado. Pré-selecionar é dar um default por outro nome, e
   * default foi o que produziu dois números vivos que ninguém ligou.
   */
  finalidade: Finalidade | "";
}

/** Campo → motivo em PT-BR. Motivo NOMEIA o limite violado, nunca "valor inválido". */
export type Problemas = Partial<
  Record<keyof FormCanal | "inboxDesde" | "consentimento" | "papel" | "identidade", string>
>;

/** E.164: '+' e 8 a 15 dígitos, o primeiro diferente de zero. */
export const E164 = /^\+[1-9]\d{7,14}$/;

export function numeroE164Valido(v: string): boolean {
  return E164.test((v ?? "").trim());
}

export function validarRegistroCanal(f: FormCanal): Problemas {
  const p: Problemas = {};
  const nome = (f.nome ?? "").trim();

  if (nome.length === 0) {
    p.nome = "dê um nome ao canal — é por ele que a operação identifica o número (e, no não oficial, é ele que vira o id `lite:`)";
  } else if (nome.length > 60) {
    p.nome = "o nome passa de 60 caracteres";
  }

  if (!provedorValido(f.provedor)) {
    p.provedor = "escolha oficial (WABA) ou não oficial — o banco só aceita esses dois, e o valor decide se o filtro da borda roda";
  }

  // M7 · a finalidade é declarada ou não existe — vale para os dois provedores, e não tem default.
  if (!finalidadeValida(f.finalidade)) {
    p.finalidade =
      "declare para que serve este número: TESTE (só entrega a destinatários em lista) ou PRODUÇÃO (fala com paciente). Não há valor padrão — quem cadastra é quem sabe";
  }

  if (f.provedor === "waba") {
    const id = (f.canalId ?? "").trim();
    if (id.length === 0) {
      p.canalId = "o canal oficial precisa do phone_number_id da Meta — é a chave da conversa, não dá para inventar depois";
    } else if (ehCanalNaoOficialId(id)) {
      p.canalId = "id começando por `lite:` é reservado ao canal não oficial";
    }
    if (!numeroE164Valido(f.numeroE164)) {
      p.numeroE164 = "informe o número em E.164 (+55 e DDD, sem espaço) — ex.: +5511999998888";
    }
    // M7 · `waba_id` passa a ser OBRIGATÓRIO. Sem ele o evento sai calado e sem identidade, que é
    // exatamente a assinatura do `canal_registrado` do `627327023793464` gravado no ledger.
    if ((f.wabaId ?? "").trim().length === 0) {
      p.wabaId =
        "o canal oficial precisa do WABA id — sem ele ninguém sabe, pelo banco, de qual conta da Meta este número saiu, e o canal não pode ser ligado";
    }
    // M7 · o detector de CONTRADIÇÃO, espelho da guarda da porta. Só recusa o sentido perigoso.
    if (f.finalidade === "producao" && ehFaixaTesteMeta(f.numeroE164)) {
      p.finalidade =
        "número +1 555 é da faixa de teste da Meta e não pode ser declarado de produção. Se este número é de produção de verdade, o dado da Meta está contradizendo a declaração — confira antes de insistir";
    }
  } else if (f.provedor === "nao_oficial") {
    // id derivado: o apelido é o nome da fono, e é o que torna `lite:jade` legível no ledger.
    if (nome.length > 0 && slugApelido(nome).length === 0) {
      p.nome = "o nome precisa ter ao menos uma letra ou número — o id do canal (`lite:…`) sai dele";
    }
    // numero_e164 é OPCIONAL aqui: o número é da fono e pode nem ser conhecido no cadastro.
    if ((f.numeroE164 ?? "").trim().length > 0 && !numeroE164Valido(f.numeroE164)) {
      p.numeroE164 = "número em formato inválido — use E.164 (+55…) ou deixe em branco";
    }
    if ((f.wabaId ?? "").trim().length > 0) {
      p.wabaId = "canal não oficial não tem WABA — deixe em branco";
    }
  }

  return p;
}

export function semProblemas(p: Problemas): boolean {
  return Object.keys(p).length === 0;
}

// ─────────────────────── R22/A1 · o domínio de departamento na tela ───────────────────────

/**
 * Uma opção do `<select>` de departamento.
 *
 * `selecionavel` NÃO é estética: **o banco só aceita FOLHA**. A guarda existe desde o M8
 * (`GUARDA:M8:escrita_so_em_folha`) e a `0130` a herdou para a chave nova (VD1). `comercial` e
 * `pos_venda` são nós de AGRUPAMENTO — quem opera neles enxerga os filhos, mas número nenhum mora
 * lá; foi de `comercial` que a rodada 18 teve de descer os dois canais à mão para a `0087` poder
 * entrar.
 *
 * Por que eles aparecem mesmo assim, em vez de sumirem da lista: sem os pais, "Pré-venda",
 * "Avaliação" e "Crédito" chegam como três irmãos soltos e a árvore de dois níveis some da tela —
 * e a árvore é o que explica por que existem sete nomes. O desenho mostra a hierarquia inteira e
 * deixa escolher só o que o banco aceita. A alternativa — oferecer os sete e deixar a porta recusar
 * — faria a recusa ser a primeira notícia, que é exatamente o que esta tela recusa desde o F9.
 */
export interface OpcaoDepartamento {
  chave: string;
  rotulo: string;
  nivel: number;
  selecionavel: boolean;
}

export function opcoesDepartamento(deps: Departamento[]): OpcaoDepartamento[] {
  const ativos = deps.filter((d) => d.ativo);
  return ordenar(ativos).map((d) => ({
    chave: d.chave,
    rotulo: d.rotulo,
    nivel: d.nivel,
    selecionavel: ehFolha(d.chave, ativos),
  }));
}

/**
 * O rótulo que a tela mostra — `"Pré-venda"`, nunca `pre_venda`. Chave é identificador de banco; a
 * gestora não deveria precisar aprendê-la para usar a tela.
 *
 * Chave que não está no domínio volta ELA MESMA, e isso é deliberado: um canal apontando para um
 * departamento arquivado tem de ficar VISÍVEL como estranho, não virar "—". Sumir com o valor
 * esconderia justamente a linha que precisa de conserto.
 */
export function rotuloDepartamento(chave: string | null, deps: Departamento[]): string {
  if (!chave) return "Não declarado";
  return deps.find((d) => d.chave === chave)?.rotulo ?? chave;
}

/** O id que o evento vai carregar: declarado (WABA) ou derivado do nome (não oficial). */
export function canalIdDoForm(f: FormCanal): string {
  return f.provedor === "nao_oficial" ? canalIdNaoOficial(f.nome) : (f.canalId ?? "").trim();
}

// ───────────────────────────────────── ativar / desativar ─────────────────────────────────────

export interface PedidoAtivacao {
  canal: Canal;
  /** ISO. Obrigatório quando o canal ainda não tem corte (ou quando não dá para saber). */
  inboxDesde: string;
  papel: Papel | null;
}

export function validarAtivacao(pedido: PedidoAtivacao): Problemas {
  const p: Problemas = {};
  const { canal, papel } = pedido;

  if (!podeGerirCanais(papel)) {
    p.papel = "ligar e desligar canal exige admin ou owner";
  }

  if (canal.provedor === "nao_oficial" && !canal.consentimento_em) {
    p.consentimento =
      "este número é de uma pessoa: sem o consentimento dela registrado, o canal não liga. O banco recusa a linha, não só a tela";
  }

  // M7 · IDENTIDADE É PRÉ-CONDIÇÃO DE VIDA, e só para o canal oficial.
  //
  // `nao_oficial` fica DE FORA de propósito, e não é esquecimento: `numero_e164` é opcional lá (o
  // número é de terceiro e pode nem ser conhecido no cadastro) e `waba_id` é proibido lá pela
  // própria natureza do provedor. A constraint do banco faz o mesmo recorte.
  //
  // Aqui a recusa é ERGONOMIA; a defesa real é `canal_waba_ativo_exige_identidade`, porque quem
  // ligou o canal `producao` em 28/07 foi um UPDATE direto, que guarda de tela nenhuma alcança.
  if (canal.provedor === "waba") {
    const semWaba = (canal.waba_id ?? "").trim().length === 0;
    const semNumero = (canal.numero ?? "").trim().length === 0;
    if (semWaba || semNumero) {
      const faltam = [semWaba ? "WABA id" : null, semNumero ? "número em E.164" : null]
        .filter(Boolean)
        .join(" e ");
      p.identidade =
        `falta ${faltam} neste canal — sem isso ninguém sabe, pelo banco, qual número está falando com a paciente. ` +
        "Complete a identidade antes de ligar; o banco recusa a linha, não só a tela";
    }
  }

  if (!canal.inbox_desde && (pedido.inboxDesde ?? "").trim().length === 0) {
    p.inboxDesde =
      "defina a data de corte do inbox antes de ligar — sem ela o histórico inteiro do número cai no inbox de todo mundo (0025)";
  } else if ((pedido.inboxDesde ?? "").trim().length > 0 && !dataIsoValida(pedido.inboxDesde)) {
    p.inboxDesde = "data de corte inválida — informe uma data real";
  }

  return p;
}

export function dataIsoValida(iso: string): boolean {
  const t = Date.parse((iso ?? "").trim());
  return Number.isFinite(t);
}

/**
 * O aviso obrigatório de desativação (EARS de F9). `pendentes = null` é o caso REAL hoje: não há
 * view nem RPC sobre `pgmq fila_saida`, e `ops`/`pgmq` estão fora da Data API — a web NÃO
 * CONSEGUE contar o que está em voo. Pedido registrado ao Agent 3; enquanto não existir, a
 * confirmação é INCONDICIONAL, que é mais estrito do que o EARS pedia e nunca menos.
 */
export function avisoDesativacao(pendentes: number | null): string {
  if (pendentes === null) {
    return (
      "Desligar este canal transforma cada mensagem ainda na fila de saída em falha PERMANENTE — " +
      "o sender não retenta, e a mensagem não volta sozinha. Esta tela não consegue contar quantas " +
      "estão em voo (a fila fica fora da API de dados), então confirme sabendo que pode não ser zero."
    );
  }
  if (pendentes === 0) {
    return "Nenhuma mensagem pendente na fila de saída deste canal agora. Desligar interrompe o envio a partir de já.";
  }
  const plural = pendentes === 1 ? "mensagem pendente" : "mensagens pendentes";
  return (
    `Há ${pendentes} ${plural} na fila de saída deste canal. Desligar transforma cada uma em falha ` +
    `PERMANENTE — o sender não retenta e elas não voltam sozinhas.`
  );
}

/**
 * O que a tela promete depois de gravar. NÃO é "aplicado agora": o runtime cacheia canal por 60 s
 * — e cacheia também a AUSÊNCIA (`canais.ts:45-47`), com canal desconhecido virando falha
 * permanente no sender (`sender.ts:258-259`). Dizer só "demora um minuto" esconde a metade cara.
 */
export const AVISO_APLICACAO_RUNTIME =
  "O runtime relê os canais a cada 60 segundos. Até lá, mensagem enviada por um canal recém-criado pode falhar — e essa falha é permanente, não volta sozinha. Espere um minuto antes de usar.";

/** Vai junto do canal não oficial, sempre, sem opção de fechar. O dano não é da empresa. */
export const AVISO_RISCO_BAN =
  "Número pessoal conectado por biblioteca não oficial: o WhatsApp pode banir. O ban atinge o WhatsApp PESSOAL de quem cedeu o número — contatos, grupos e histórico dela — e não é reversível.";

// ───────────────────────────────────────── payloads ─────────────────────────────────────────

export interface PayloadECanalId {
  canalId: string;
  payload: Record<string, unknown>;
}

export function payloadCanalRegistrado(f: FormCanal): PayloadECanalId {
  const canalId = canalIdDoForm(f);
  const payload: Record<string, unknown> = {
    canal_id: canalId,
    nome: (f.nome ?? "").trim(),
    provedor: f.provedor,
  };
  const numero = (f.numeroE164 ?? "").trim();
  const waba = (f.wabaId ?? "").trim();
  const departamento = (f.departamento ?? "").trim();
  if (numero) payload.numero_e164 = numero;
  if (waba) payload.waba_id = waba;
  // R22/A1 · a chave é `departamento`, e `area` NÃO viaja junto. A porta aceita as duas durante a
  // janela do D18 (VD2), mas mandar as duas seria manter viva a fonte que esta rodada matou — e
  // payload que carrega o mesmo fato duas vezes é como as duas divergem.
  if (departamento) payload.departamento = departamento;
  // M7 · a finalidade viaja no payload. O `if` aqui NÃO é o mesmo caso do `waba_id`: lá o campo
  // sumir calado era o defeito; aqui `validarRegistroCanal` já barrou o vazio antes de chegar,
  // e a omissão só acontece num ambiente onde a coluna ainda não existe.
  if (finalidadeValida(f.finalidade)) payload.finalidade = f.finalidade;
  return { canalId, payload };
}

/**
 * Patch parcial. `provedor` NUNCA entra — a porta recusa a alteração, e mandar o campo só para
 * ser recusado transforma um "salvar" comum em erro na cara da gestora.
 */
export function payloadCanalAtualizado(
  canalId: string,
  patch: {
    nome?: string;
    numeroE164?: string;
    wabaId?: string;
    departamento?: string;
    finalidade?: Finalidade;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = { canal_id: canalId };
  if (patch.nome !== undefined) payload.nome = patch.nome.trim();
  if (patch.numeroE164 !== undefined) payload.numero_e164 = patch.numeroE164.trim();
  if (patch.wabaId !== undefined) payload.waba_id = patch.wabaId.trim();
  // R22/A1 · `area` morreu como chave de saída. Ver `payloadCanalRegistrado`.
  if (patch.departamento !== undefined) payload.departamento = patch.departamento.trim();
  // M7 · depois da migration, `finalidade` muda POR EVENTO, nunca por UPDATE. É esta chave.
  if (patch.finalidade !== undefined) payload.finalidade = patch.finalidade;
  return payload;
}

export function payloadCanalAtivado(canalId: string, inboxDesde: string, motivo?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { canal_id: canalId };
  const corte = (inboxDesde ?? "").trim();
  if (corte) payload.inbox_desde = corte;
  const m = (motivo ?? "").trim();
  if (m) payload.motivo = m;
  return payload;
}

export function payloadCanalDesativado(canalId: string, motivo?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { canal_id: canalId };
  const m = (motivo ?? "").trim();
  if (m) payload.motivo = m;
  return payload;
}

export type TipoEventoCanal =
  | "canal_registrado"
  | "canal_atualizado"
  | "canal_ativado"
  | "canal_desativado";

/**
 * Envelope pronto + guarda antissegredo aplicada ANTES de sair da máquina. A porta também
 * recusa (CONTRATO-C §4.3); recusar aqui é o que transforma o erro em teste vermelho.
 */
export function envelopeCanal(
  tipo: TipoEventoCanal,
  idExterno: string,
  payload: Record<string, unknown>,
): { ok: true; envelope: EnvelopeEvento } | { ok: false; motivo: string } {
  const seguro: VereditoEscrita = payloadSeguro(payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo! };
  return { ok: true, envelope: montarEnvelope(tipo, idExterno, payload) };
}

// ──────────────────────────────────────── apresentação ────────────────────────────────────────

export type EstadoCanal = "ativo" | "inativo" | "bloqueado_sem_consentimento";

export function estadoDoCanal(c: Canal): EstadoCanal {
  if (c.ativo) return "ativo";
  if (c.provedor === "nao_oficial" && !c.consentimento_em) return "bloqueado_sem_consentimento";
  return "inativo";
}

export function rotuloEstadoCanal(e: EstadoCanal): string {
  if (e === "ativo") return "Ligado";
  if (e === "bloqueado_sem_consentimento") return "Desligado · falta consentimento";
  return "Desligado";
}

/**
 * Credencial: presença ou ausência, NUNCA o valor — nem mascarado. A web não tem como saber se o
 * token existe (ele é env do RUNTIME), então a tela diz o que sabe e não finge.
 */
export const TEXTO_CREDENCIAL_DESCONHECIDA =
  "A credencial deste canal vive no ambiente do runtime — esta tela não lê, não mostra e não guarda token.";

/**
 * M7 · O AVISO QUE A TELA É OBRIGADA A DAR, e ele existe por um engano MEDIDO, não hipotético.
 *
 * O `627327023793464` tem `verified_name = "Me Escuta"` e `code_verification_status = VERIFIED` na
 * Graph API. Três lugares independentes — o nome verificado, o selo verde e o apelido `producao`
 * no banco — descrevem algo que ele NÃO é. Foi esse conjunto que produziu a frase errada no
 * relatório de deploy, no despacho da rodada e na primeira versão da própria SPEC-M7.
 *
 * O engano é estrutural: o dado se APRESENTA como produção. Por isso a tela não pode mostrar só
 * QUAL é o número — tem de dizer QUE TIPO de número é.
 */
export const TEXTO_NUMERO_DE_TESTE =
  "Número de TESTE da Meta: só entrega a destinatários em lista de permissão. Mensagem para qualquer outra pessoa FALHA. O nome verificado e o selo da Meta não mudam isso.";

/** Sem finalidade declarada a tela diz que não sabe. Nunca supõe produção — supor é o engano. */
export const TEXTO_FINALIDADE_AUSENTE =
  "Este número não declara para que serve. Enquanto não declarar, trate como não confiável para falar com paciente.";

/**
 * COLUNA COM VALOR ÚNICO SOME (decisão do Orquestrador sobre o mockup r10).
 *
 * Uma coluna em que todas as linhas dizem a mesma coisa não é informação: é ruído com custo de
 * largura. Enquanto todo canal for `comercial`, ÁREA sai; enquanto todo canal for oficial,
 * PROVEDOR sai. Voltam sozinhas no instante em que a segunda área ou o primeiro canal não oficial
 * aparecer — e é aí que elas passam a significar alguma coisa.
 *
 * Regra deliberadamente NÃO aplicada a `nome`, `numero` e `estado`: essas três são a identidade e
 * o estado da linha, e sumir com elas deixaria a tabela sem sujeito mesmo quando o valor coincide.
 *
 * ───────────────── ARB-R18-05 · o que a regra realmente esconde ─────────────────
 *
 * A regra esconde **REDUNDÂNCIA**, nunca **ALARME**. Valor constante em 100% das linhas significa
 * "não informa" quando o valor é banal, e "isto é SISTÊMICO" quando o valor é o problema.
 *
 * `finalidade` é o segundo caso e por isso **nunca se esconde**: hoje os dois canais são `teste`,
 * e a regra genérica apagaria exatamente o aviso de que o sistema inteiro está em número de teste.
 * Coluna cujo valor único É o risco não é redundante — é o achado.
 *
 * O contraste que prova que é a mesma regra, e não uma exceção de conveniência: a ARB-R18-03
 * manteve o rótulo de departamento FORA do inbox pelo mesmo mecanismo, porque `comercial` em 73
 * de 86 conversas é redundância pura. Mesma regra, resultados opostos, porque o conteúdo é oposto.
 */
export interface ColunasVisiveis {
  provedor: boolean;
  /**
   * R22/A1 · era `area`. A regra do valor único CONTINUA valendo aqui, e o contraste com
   * `finalidade` (que nunca se esconde) está escrito acima: departamento igual em todas as linhas é
   * REDUNDÂNCIA — `comercial` em 73 de 86 conversas é ruído, não achado (ARB-R18-03).
   */
  departamento: boolean;
  /** ARB-R18-05: SEMPRE visível quando há linha. Não é config — é invariante. */
  finalidade: boolean;
  /** As 4 colunas de LGPD só fazem sentido onde existe titular terceiro (`nao_oficial`). */
  consentimento: boolean;
}

export function colunasVisiveis(canais: Canal[]): ColunasVisiveis {
  if (canais.length === 0)
    return { provedor: false, departamento: false, finalidade: false, consentimento: false };
  const provedores = new Set(canais.map((c) => c.provedor));
  // `null` (não declarado) conta como um valor PRÓPRIO, e não vira `comercial` por conveniência: um
  // canal sem departamento ao lado de um com departamento é justamente o contraste que a coluna
  // precisa mostrar. Era o `?? "comercial"` de antes que apagava esse contraste.
  const deps = new Set(canais.map((c) => c.departamento ?? "(não declarado)"));
  return {
    provedor: provedores.size > 1,
    departamento: deps.size > 1,
    finalidade: true,
    consentimento: canais.some((c) => c.provedor === "nao_oficial"),
  };
}

/**
 * Ordem de ATENÇÃO, não de importância — e a chave nova vem ANTES de `ativo` (recomendação do
 * Croqui, decisão minha, reversível em uma linha).
 *
 * `não declarada` → `teste` → `producao`. O que não alcança paciente sobe; o que está em ordem
 * desce. É a mesma lógica da ARB-R18-05 aplicada à ordenação: um número que não pode falar com
 * ninguém, sentado calado no fim de um inventário, é como ele é esquecido.
 *
 * Hoje não muda nada visível — os dois canais são `teste`. Ela existe para o dia em que houver um
 * número de produção de verdade e os de teste passarem a se misturar com ele.
 */
const PESO_FINALIDADE: Record<string, number> = { producao: 2, teste: 1 };

export function ordenarCanais(canais: Canal[]): Canal[] {
  const peso = (c: Canal) => (c.finalidade ? PESO_FINALIDADE[c.finalidade] ?? 0 : 0);
  return [...canais].sort(
    (a, b) =>
      peso(a) - peso(b) ||
      Number(b.ativo) - Number(a.ativo) ||
      a.provedor.localeCompare(b.provedor) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

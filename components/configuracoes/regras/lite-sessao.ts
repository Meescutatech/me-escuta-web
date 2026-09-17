/**
 * F11 · REGRAS PURAS da sessão do canal NÃO OFICIAL (WhatsApp de uma pessoa, não da empresa).
 *
 * O desenho está partido em dois de propósito (ARB-18.5, merge dos dois contratos):
 *   • STATUS  → `ops.sessao_canal`, lido pela UI em `core.v_sessao_canal`. Sobrevive a restart do
 *               runtime, e NUNCA carrega segredo.
 *   • QR e COMANDOS → rota interna do runtime. O QR **jamais toca o banco**: QR de WhatsApp é
 *               credencial viva — quem lê, pareia. Ele trafega runtime → tela e morre.
 *
 * Três achados que a tela precisa carregar, cada um com um jeito próprio de mentir se ignorado:
 *
 *  (a) `IsConnected` ≠ `IsLoggedIn` (lido em `handlers.go` do WuzAPI): são TRÊS estados de
 *      conexão, não dois — desconectado · conectado-aguardando-pareamento · logado. Uma tela com
 *      um booleano mente. O banco acrescenta um quarto que a minha spec não tinha: `banido`.
 *  (b) O QR EXPIRA EM SEGUNDOS e é reemitido. A tela relê; nunca guarda.
 *  (c) O CONTADOR É CEGO. Ele existe para responder "o filtro está funcionando?" sem responder
 *      "quem foi barrado?". Por isso `sanitizarLinhaDescarte` é allowlist, não blocklist: se a
 *      view um dia ganhar uma coluna com PII, a tela não passa a mostrar por descuido.
 */

import { montarEnvelope, payloadSeguro, type EnvelopeEvento } from "./porta.ts";
import type { Canal, Papel } from "./canais.ts";
import { podeGerirCanais } from "./canais.ts";

/** Vocabulário do banco (`ops.sessao_canal.status` check). É ele que manda, não o meu rascunho. */
export type EstadoSessao = "desconectado" | "aguardando_qr" | "conectado" | "banido";

export const ESTADOS_SESSAO: EstadoSessao[] = ["desconectado", "aguardando_qr", "conectado", "banido"];

export function estadoSessaoValido(v: unknown): v is EstadoSessao {
  return typeof v === "string" && (ESTADOS_SESSAO as string[]).includes(v);
}

export interface SessaoCanal {
  canal_id: string;
  canal_nome: string | null;
  provedor: string | null;
  status: EstadoSessao;
  /** mensagem legível do provedor. Nunca QR, nunca credencial. */
  detalhe: string | null;
  qr_expira_em: string | null;
  ultimo_batimento: string | null;
  atualizado_em: string | null;
}

/**
 * O achado (a), como função. Recebe as três flags que o provedor devolve separadas e devolve UM
 * estado. Quem colapsar `conectado = IsConnected` vai chamar de "conectado" uma sessão que só
 * abriu socket e ainda não pareou — e a tela dirá que está tudo certo enquanto nada chega.
 */
export function estadoDeFlags(f: {
  conectado: boolean;
  logado: boolean;
  banido?: boolean;
}): EstadoSessao {
  if (f.banido) return "banido";
  if (f.logado) return "conectado";
  if (f.conectado) return "aguardando_qr";
  return "desconectado";
}

export type EventoSessao =
  | "pediu_sessao"
  | "qr_recebido"
  | "pareou"
  | "caiu"
  | "desconectou"
  | "banido";

/** Máquina de estados da tela. Determinística e sem I/O — é o que o polling alimenta. */
export function proximoEstado(atual: EstadoSessao, evento: EventoSessao): EstadoSessao {
  if (evento === "banido") return "banido";
  if (atual === "banido") return "banido"; // só sai por intervenção humana no provedor
  switch (evento) {
    case "pediu_sessao":
      return atual === "conectado" ? "conectado" : "aguardando_qr";
    case "qr_recebido":
      return atual === "conectado" ? "conectado" : "aguardando_qr";
    case "pareou":
      return "conectado";
    case "caiu":
    case "desconectou":
      return "desconectado";
    default:
      return atual;
  }
}

export const INTERVALO_RELEITURA_MS = 5_000;
/**
 * 16/09 · enquanto o PRIMEIRO QR não chegou. Medido: o WuzAPI gera o QR ~0,7 s depois do `connect`,
 * a primeira leitura sai antes disso, e com 5 s o QR pronto às :23 só aparecia às :29.
 */
export const INTERVALO_RELEITURA_SEM_QR_MS = 1_000;

/**
 * EARS: relê a cada 5 s ENQUANTO aguarda pareamento; PARA de reler quando conecta. Devolver
 * `null` (e não 0) obriga quem chama a decidir explicitamente — um número sempre positivo viraria
 * polling eterno contra o runtime.
 */
export function intervaloRelituraMs(
  estado: EstadoSessao,
  provedorIndisponivel = false,
  /** `false` = aguardando e o QR ainda não veio: relê rápido até ele chegar. */
  temQr = true,
): number | null {
  // ⚠️ NÃO SEI ≠ DESCONECTADO. Enquanto o runtime não conseguir falar com o provedor, continuar
  // relendo é a ÚNICA forma de a tela voltar sozinha quando a rede voltar. Parar aqui é o defeito
  // que já aconteceu duas vezes por caminhos diferentes: a fono fica olhando "nenhuma sessão ativa"
  // com a instância viva esperando o scan, e só um F5 desfaz. O estado que chega junto é o último
  // conhecido — reler sobre ele é barato e converge; parar é definitivo.
  if (provedorIndisponivel) return INTERVALO_RELEITURA_MS;
  if (estado !== "aguardando_qr") return null;
  return temQr ? INTERVALO_RELEITURA_MS : INTERVALO_RELEITURA_SEM_QR_MS;
}

export type TelaDoQr = "gerando" | "qr" | "conectado" | "erro";

/**
 * 16/09 · o que o painel mostra depois de escolher "Não oficial". "Gerando o QR…" cobre o registro,
 * o provisionamento e a espera do primeiro QR — antes, o quadro vazio dizia "nenhum código ativo"
 * nesses segundos, que é mentira: o código está a caminho.
 */
export function telaDoQr(pedido: {
  gravando: boolean;
  sessao: { estado: EstadoSessao; temQr: boolean; motivo: string | null } | null;
  erro: string | null;
}): TelaDoQr {
  if (pedido.erro) return "erro";
  if (pedido.gravando || !pedido.sessao) return "gerando";
  const { estado, temQr, motivo } = pedido.sessao;
  if (estado === "conectado") return "conectado";
  if (motivo) return "erro";
  if (estado === "aguardando_qr") return temQr ? "qr" : "gerando";
  return "erro";
}

export function devoRelerEstado(estado: EstadoSessao, provedorIndisponivel = false): boolean {
  return intervaloRelituraMs(estado, provedorIndisponivel) !== null;
}

/**
 * Predicado ESTRITO: sem instante legível, assume expirado. Continua existindo porque é a leitura
 * certa em qualquer lugar que precise decidir "posso confiar neste QR?" sem ter como avisar
 * ninguém. Quem desenha a TELA usa `validadeQr` — ver ali o porquê.
 */
export function qrExpirado(qrExpiraEm: string | null | undefined, agoraMs: number): boolean {
  const t = Date.parse((qrExpiraEm ?? "").trim());
  if (!Number.isFinite(t)) return true;
  return t <= agoraMs;
}

/**
 * A validade do QR em TRÊS valores, e a diferença entre o do meio e os outros dois é a diferença
 * entre uma tela que funciona e uma que some.
 *
 * MEDIDO no provedor (WuzAPI, D65 — `wmiau.go` e `handlers.go`): **não existe campo de expiração
 * em lugar nenhum** do que ele devolve. Nem no webhook de QR, nem no `GET /session/qr`. O prazo é
 * o do WhatsApp, de segundos, e o único sinal de que estourou é o provedor passar a devolver `""`
 * ou 500 `"no session"` — porque ele MATA o cliente quando o QR vence. Ou seja: em produção o
 * `qr_expira_em` chega **ausente**, sempre.
 *
 * Com o predicado estrito isso significava `expirado` para todo QR real, e a tela desenhava um
 * quadro vazio em cima de uma imagem perfeitamente escaneável — o defeito mais caro possível, que
 * é o que PARECE estar certo. `sem_prazo` separa "o provedor disse que morreu" de "o provedor não
 * disse nada": o primeiro esconde, o segundo mostra E avisa que não há prazo declarado.
 *
 * Instante ilegível cai em `sem_prazo`, não em `expirado`: string quebrada é o runtime falando
 * errado, e nada nela afirma que o código morreu. O que a tela nunca pode fazer é esconder um QR
 * vivo — e nunca mostrar um que uma data legível já declarou morto.
 */
export type ValidadeQr = "valido" | "sem_prazo" | "expirado";

export function validadeQr(qrExpiraEm: string | null | undefined, agoraMs: number): ValidadeQr {
  const bruto = (qrExpiraEm ?? "").trim();
  if (!bruto) return "sem_prazo";
  const t = Date.parse(bruto);
  if (!Number.isFinite(t)) return "sem_prazo";
  return t <= agoraMs ? "expirado" : "valido";
}

export function rotuloEstadoSessao(e: EstadoSessao): string {
  switch (e) {
    case "conectado":
      return "Conectado";
    case "aguardando_qr":
      return "Aguardando pareamento";
    case "banido":
      return "Banido pelo WhatsApp";
    default:
      return "Desconectado";
  }
}

export function descricaoEstadoSessao(e: EstadoSessao): string {
  switch (e) {
    case "conectado":
      return "O número está pareado e as mensagens de contraparte conhecida entram no sistema.";
    case "aguardando_qr":
      // "redesenhado sozinho" era falso e custava uma sessão: quando o QR vence, o provedor MATA
      // o cliente (`wmiau.go`, evento `timeout`) e para de emitir. A releitura de 5 s encontra
      // vazio, não um código novo. Quem redesenha é a pessoa, no botão.
      return "Abra o WhatsApp no celular dela, em Aparelhos conectados, e leia o código. Ele vale por segundos; passou do tempo, gere outro.";
    case "banido":
      return "O WhatsApp bloqueou este número. Não há reconexão possível por aqui — e o bloqueio atinge o WhatsApp pessoal de quem cedeu o número.";
    default:
      return "Nenhuma sessão ativa. Nada deste número entra no sistema.";
  }
}

// ─────────────────────────────── o portão de criação de sessão ───────────────────────────────

export interface ContextoCriacaoSessao {
  papel: Papel | null;
  /** quem está logado. Só o membro precisa dele: ele pareia o canal cujo dono é ele. */
  uid?: string | null;
  canal: Canal | null;
  /** F8 (bloco `conversa` obrigatório) em produção E verificado por V8. Gate duro. */
  f8Pronto: boolean;
}

export interface VereditoSessao {
  pode: boolean;
  /** o motivo do PRIMEIRO bloqueio, na ordem de prioridade abaixo. Vai na tela, não no console. */
  motivo?: string;
  /** o que não bloqueia mas o operador precisa saber antes de parear. */
  avisos: string[];
}

/**
 * Ordem de prioridade deliberada: papel → provedor → CONSENTIMENTO → F8. O consentimento vem
 * antes do F8 porque é o único bloqueio cujo dano é de terceiro: a fono perde o WhatsApp dela, e
 * ninguém nesta conversa pode consentir no lugar dela. Se o motivo mostrado fosse "falta F8",
 * alguém destravaria o F8 e acharia que resolveu.
 */
export function podeCriarSessao(ctx: ContextoCriacaoSessao): VereditoSessao {
  const avisos: string[] = [];
  if (!podeGerirCanais(ctx.papel) && ctx.papel !== "membro") {
    return { pode: false, motivo: "criar sessão exige admin, Proprietário ou a dona do número", avisos };
  }
  if (!ctx.canal) {
    return { pode: false, motivo: "registre o canal antes — a sessão se pendura num canal existente", avisos };
  }
  /*
   * 16/09 · O MEMBRO PAREIA O PRÓPRIO CANAL, e só o próprio. Sem isto ele registrava o número e
   * parava no passo seguinte. Dono vazio nunca casa com uid vazio: os dois precisam existir.
   */
  if (!podeGerirCanais(ctx.papel)) {
    const uid = (ctx.uid ?? "").trim();
    const dono = (ctx.canal.responsavel_id ?? "").trim();
    if (!uid || uid !== dono) {
      return { pode: false, motivo: "você só gera o QR do seu próprio número — os outros ficam com admin e Proprietário", avisos };
    }
  }
  if (ctx.canal.provedor !== "nao_oficial") {
    return {
      pode: false,
      motivo: "só canal não oficial tem sessão por pareamento — o canal oficial fala com a Meta por token",
      avisos,
    };
  }
  /*
   * 14/09 · O CONSENTIMENTO SAIU DAQUI, e foi para onde o risco de fato começa.
   *
   * Esta trava recusava o PAREAMENTO. Medido, e ela estava no lugar errado nas duas pontas:
   *   · o BANCO só exige consentimento para o canal ficar ATIVO —
   *       CHECK (provedor <> 'nao_oficial' OR ativo IS NOT TRUE OR consentimento_em IS NOT NULL)
   *   · o RUNTIME não exige nada para parear (zero referência a consentimento no caminho da sessão)
   *
   * Ou seja: era regra só nossa, e mais dura que a do banco. Parear não põe nada em movimento — o
   * canal nasce DESLIGADO e nenhuma mensagem entra ou sai enquanto ninguém o liga. O ban que
   * ameaça o WhatsApp pessoal dela vem do USO, não do QR.
   *
   * O aviso do risco continua na tela de registro, antes do botão. E o consentimento continua
   * obrigatório — em `podeAtivarCanal`, que é o degrau em que ele sempre devia ter estado, e onde
   * o próprio banco o cobra. Uma trava a menos aqui não é uma proteção a menos: é a proteção no
   * degrau certo, e uma única fonte de verdade em vez de duas que discordam.
   */
  if (!ctx.f8Pronto) {
    return {
      pode: false,
      motivo:
        "F8 (bloco `conversa` obrigatório na ingestão) precisa estar em produção e verificado antes de parear — sem ele o histórico que chega mistura pessoas no ledger, e ledger não devolve",
      avisos,
    };
  }
  if (!ctx.canal.ativo) {
    avisos.push(
      "O canal está desligado: parear conecta a sessão, mas nada é ingerido enquanto ele não for ligado.",
    );
  }
  return { pode: true, avisos };
}

// ─────────────────────────────────── consentimento (portão) ───────────────────────────────────

/**
 * D70 · v2. Subiu de `v1` em 08/09/2026 porque o texto passou a descrever o NIVEL do canal, e o
 * `v1` prometia a titular uma coisa que deixa de ser verdade fora do estrito: *"Mensagem de quem
 * nao e nosso conhecido e descartada na borda e nao e guardada em lugar nenhum"*.
 *
 * Consentimento dado sobre o `v1` NAO cobre o `v2` — e agora isso e regra executavel, nao aviso:
 * `exigeAceiteDoTermo` (logo abaixo) faz do aceite na versao vigente uma pre-condicao para sair
 * do estrito. Ate 08/09 esta constante tinha UM unico uso no repo inteiro (carimbar o valor no
 * envio do formulario) e NADA comparava a versao gravada com a vigente.
 *
 * ⚠️ Subir esta versao NAO invalida o pareamento de quem ja consentiu no v1: o portao da sessao
 * continua olhando `consentimento_em`, e derrubar canal em producao por troca de texto seria um
 * dano maior que o que o texto novo evita. O que a versao velha bloqueia e o AFROUXAMENTO.
 */
export const TERMO_VERSAO = "v2";

export type MeioConsentimento = "assinatura" | "whatsapp" | "presencial" | "video";
export const MEIOS_CONSENTIMENTO: MeioConsentimento[] = ["assinatura", "whatsapp", "presencial", "video"];

export function meioConsentimentoValido(v: unknown): v is MeioConsentimento {
  return typeof v === "string" && (MEIOS_CONSENTIMENTO as string[]).includes(v);
}

/**
 * O texto do termo. Não é jurídico e não tenta ser: é a fono sabendo, ANTES, o que pode perder.
 * O conteúdo é do Diogo e do Croqui — o que esta trilha garante é que (1) não dá para abrir sessão
 * sem registrar aceite, e (2) o texto nomeia o dano. O item (2) é testado, não confiado: o teste
 * exige as palavras do dano, e mudar o texto sem elas REPROVA.
 *
 * Mudou o texto? Sobe a versão. Consentimento dado sobre um texto antigo não cobre um texto novo —
 * é para isso que `consentimento_texto_versao` existe no banco.
 */
export const TERMO_CANAL_PESSOAL = [
  "Este número é seu, pessoal. Conectá-lo ao sistema usa uma biblioteca NÃO OFICIAL do WhatsApp.",
  "O WhatsApp pode banir números conectados assim. Se isso acontecer, o bloqueio atinge o SEU WhatsApp pessoal — suas conversas, seus grupos, seus contatos, o seu histórico. Não é reversível, e não é um chip da empresa: é o seu.",
  "Quanto do que chega a este número a empresa passa a ler depende do NÍVEL configurado. O nível é escolhido por um admin ou pelo Proprietário — nunca pelo sistema, e nunca sozinho. São três, e todo canal começa no primeiro:",
  "1) Estrito — é como todo canal nasce, e é o que vale enquanto ninguém escolher outro. A empresa lê apenas as mensagens de quem já é lead, de quem já é paciente, ou de quem teve o aceite de contato registrado antes. Mensagem de qualquer outra pessoa é descartada na borda: não entra, não é lida e não é guardada em lugar nenhum.",
  "2) Responde quem escrever — passa a entrar no sistema, e a ficar guardada, a mensagem de QUALQUER pessoa que escrever para este número. Inclusive quem é seu conhecido e não tem nada a ver com a empresa. O sistema só responde a quem escreveu primeiro; ele não começa conversa.",
  "3) Aberto — entra mensagem de qualquer pessoa E o sistema pode escrever primeiro, para quem nunca falou com você. E tem uma parte que não é sobre a empresa, é sobre você: neste nível o sistema também passa a guardar o que VOCÊ manda do seu celular, para QUALQUER pessoa — sua família, o grupo do condomínio, seu médico, um amigo. Fica gravado o telefone de quem recebeu e o texto do que você escreveu, e cada uma dessas pessoas vira um contato dentro do sistema da empresa. Quem trabalha aqui e tem acesso consegue ler. Hoje NÃO existe apagar depois: esse registro é permanente. É também o nível de maior risco de bloqueio: mensagem para quem não pediu contato é o que costuma fazer o WhatsApp banir, e quem perde a conta é você, não a empresa.",
  "Sair do Estrito só acontece com você aceitando este texto, nesta versão. Um aceite dado sobre uma versão anterior não vale para esta.",
  "Você pode pedir a volta ao Estrito, ou a desconexão do número, a qualquer momento.",
].join("\n\n");

/**
 * D70.b · A TRAVA DE VERSAO — e ela nao existia.
 *
 * MEDIDO em 08/09/2026: `TERMO_VERSAO` tinha UM uso em todo o repositorio (`painel-sessao.tsx`,
 * carimbando o valor no envio do formulario). Nada, em lugar nenhum, comparava o
 * `consentimento_texto_versao` gravado com o vigente — ou seja, a frase "se o texto mudar, este
 * aceite nao cobre o novo", que a propria tela mostrava a titular, nao era imposta por nada.
 *
 * A regra: **sair do estrito exige aceite na versao vigente**. Voltar PARA o estrito nunca exige
 * nada — apertar o filtro e sempre seguro, e travar o caminho de volta seria prender a titular no
 * nivel mais permissivo justamente quando ela quer sair dele.
 *
 * `versaoAceita` nulo, vazio ou diferente da vigente ⇒ exige. Fail-closed: nao saber qual versao
 * ela aceitou e o mesmo que saber que nao foi esta.
 */
export function exigeAceiteDoTermo(
  nivelAlvo: string,
  versaoAceita: string | null | undefined,
  versaoVigente: string = TERMO_VERSAO,
): boolean {
  if (nivelAlvo === "estrito") return false;
  return (versaoAceita ?? "").trim() !== versaoVigente;
}

/** O que a tela diz quando a trava dispara. Nomeia a versao velha, para ninguem procurar no escuro. */
export function motivoAceiteDesatualizado(versaoAceita: string | null | undefined): string {
  const v = (versaoAceita ?? "").trim();
  return (
    `a titular aceitou o termo ${v ? `na versao ${v}` : "numa versao nao registrada pelo banco"}, e o ` +
    `vigente e o ${TERMO_VERSAO}. Afrouxar o filtro muda o que ela aceitou: o texto novo descreve os ` +
    "tres niveis e diz que fora do estrito a mensagem de desconhecido passa a ser guardada. " +
    "Registre o aceite nesta versao antes de trocar o nivel."
  );
}

/** As palavras que o termo TEM de conter para ser um consentimento informado, não um rodapé. */
export const TERMO_EXIGE_DIZER = [
  "não oficial",
  "banir",
  "pessoal",
  "não é reversível",
  "descartada",
] as const;

export function termoNomeiaODano(texto: string): boolean {
  const t = (texto ?? "").toLowerCase();
  return TERMO_EXIGE_DIZER.every((frase) => t.includes(frase.toLowerCase()));
}

/*
 * ─────────── D72 · o que o nivel ABERTO faz com o celular DELA, dito nos DOIS lugares ───────────
 *
 * D72, cravada pelo dono em 08/09/2026: no nivel `aberto` o que a titular manda do celular pessoal
 * dela para QUALQUER pessoa — familia, condominio, medico — tambem entra no sistema. Vira evento no
 * ledger append-only, com telefone e corpo em claro, e a porta fabrica um lead de cada
 * destinatario. Funcao de esquecimento nao existe (C1/D58: adiada para depois do lancamento).
 *
 * Ate aqui isso estava dito na TELA (`consequenciaNivel("aberto")`, em `regras/canais.ts`) e NAO
 * estava no TERMO. E a divergencia mais cara possivel neste par: o aceite da titular so cobre o que
 * o TEXTO conta, e o texto e o que ela aceita. Tela honesta com termo omisso nao e consentimento
 * informado — e quem assina e ela.
 *
 * Por isso a lista abaixo e aplicada aos DOIS textos pelo mesmo teste. Ela nao pede as mesmas
 * palavras (a tela fala "a dona do numero", o termo fala "voce"): pede os mesmos FATOS. Mexer num
 * dos dois sem o outro reprova.
 *
 * Comparacao insensivel a acento de proposito — os dois arquivos seguem convencoes diferentes
 * (`regras/canais.ts` escreve sem acento) e nenhum fato pode depender disso.
 */
export function semAcento(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const ABERTO_EXIGE_DIZER: ReadonlyArray<{ fato: string; padrao: RegExp }> = [
  { fato: "que o que ELA manda do proprio celular passa a ser gravado", padrao: /manda do (seu )?celular/ },
  { fato: "que vale para QUALQUER destinatario", padrao: /qualquer pessoa/ },
  { fato: "o exemplo `familia`", padrao: /familia/ },
  { fato: "o exemplo `condominio`", padrao: /condominio/ },
  { fato: "o exemplo `medico`", padrao: /medico/ },
  { fato: "que fica gravado o TELEFONE de quem recebeu", padrao: /telefone/ },
  { fato: "que fica gravado o TEXTO da mensagem", padrao: /texto/ },
  { fato: "que hoje NAO existe apagar depois", padrao: /hoje\s+nao\s+existe[^.]{0,40}apagar/ },
  { fato: "o risco de ban, que continua sendo dela", padrao: /banir/ },
];

/** Os fatos do `aberto` que o texto NAO diz. Vazio = diz todos. Nomeia o que faltou. */
export function fatosDoAbertoQueFaltam(texto: string): string[] {
  const t = semAcento(texto);
  const faltando: string[] = [];
  for (const { fato, padrao } of ABERTO_EXIGE_DIZER) {
    if (!padrao.test(t) && !faltando.includes(fato)) faltando.push(fato);
  }
  return faltando;
}

/** O paragrafo do termo que descreve o nivel `aberto` — `null` se ninguem o escreveu. */
export function itemAbertoDoTermo(termo: string = TERMO_CANAL_PESSOAL): string | null {
  return (termo ?? "").split("\n\n").find((p) => /^3\)\s*Aberto/i.test(p.trim())) ?? null;
}

/*
 * ─────────── A ORDEM do aceite → nivel, fora do componente para poder ser exercida ───────────
 *
 * O dialogo grava DUAS coisas: `canal_consentimento_registrado` e, so depois,
 * `canal_nivel_alterado`. A ordem nao e estetica — se o aceite nao gravar e o nivel trocar assim
 * mesmo, o canal sai do estrito com a titular tendo aceitado outro texto, e o evento do nivel fica
 * num ledger append-only sem base nenhuma atras dele.
 *
 * Enquanto isso morava dentro do `onClick` do componente, nada exercia a ordem: da para trocar as
 * duas chamadas de lugar, ou apagar o `return`, e a suite nao ve. Aqui e uma funcao pura de
 * orquestracao, e o teste (`tests/nivel-acao.test.ts`) a chama com espioes que registram a
 * sequencia.
 */
export const MOTIVO_ACEITE_NAO_GRAVOU = "nao deu para registrar o aceite — o nivel nao foi trocado";

export async function aceiteEntaoNivel(passos: {
  registrarAceite: () => Promise<{ ok: boolean; motivo?: string }>;
  trocarNivel: () => void | Promise<void>;
}): Promise<{ trocou: boolean; motivo?: string }> {
  const r = await passos.registrarAceite();
  if (!r?.ok) return { trocou: false, motivo: r?.motivo ?? MOTIVO_ACEITE_NAO_GRAVOU };
  await passos.trocarNivel();
  return { trocou: true };
}

export interface FormConsentimento {
  canalId: string;
  titularNome: string;
  meio: MeioConsentimento;
  /** ISO. Quando a titular aceitou de fato — pode ser antes de alguém digitar aqui. */
  aceitoEm: string;
  textoVersao: string;
  aceiteMarcado: boolean;
}

export type ProblemasConsentimento = Partial<Record<keyof FormConsentimento, string>>;

export function validarConsentimento(f: FormConsentimento, agoraMs: number): ProblemasConsentimento {
  const p: ProblemasConsentimento = {};
  if ((f.titularNome ?? "").trim().length < 2) {
    p.titularNome = "diga de quem é o número — o consentimento é de uma pessoa com nome, não do canal";
  }
  if (!meioConsentimentoValido(f.meio)) {
    p.meio = "informe como ela consentiu: assinatura, WhatsApp, presencial ou vídeo";
  }
  const t = Date.parse((f.aceitoEm ?? "").trim());
  if (!Number.isFinite(t)) {
    p.aceitoEm = "informe quando ela consentiu";
  } else if (t > agoraMs) {
    p.aceitoEm = "a data do consentimento está no futuro — consentimento não se registra antes de acontecer";
  }
  if ((f.textoVersao ?? "").trim().length === 0) {
    p.textoVersao = "a versão do termo precisa ser registrada — sem ela, um aceite sobre texto antigo passaria a valer para um texto novo";
  }
  if (!f.aceiteMarcado) {
    p.aceiteMarcado = "confirme que a titular leu e concordou com o termo acima";
  }
  return p;
}

export function payloadConsentimento(f: FormConsentimento): Record<string, unknown> {
  return {
    canal_id: f.canalId,
    titular_nome: (f.titularNome ?? "").trim(),
    texto_versao: (f.textoVersao ?? "").trim(),
    meio: f.meio,
    aceito_em: (f.aceitoEm ?? "").trim(),
  };
}

export function envelopeConsentimento(
  idExterno: string,
  payload: Record<string, unknown>,
): { ok: true; envelope: EnvelopeEvento } | { ok: false; motivo: string } {
  const seguro = payloadSeguro(payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo! };
  return { ok: true, envelope: montarEnvelope("canal_consentimento_registrado", idExterno, payload) };
}

// ──────────────────────────────────── o contador cego ────────────────────────────────────

/**
 * As ÚNICAS colunas que a tela aceita de `core.v_descarte_borda`. Allowlist, não blocklist: o
 * contador existe para provar que o filtro funciona sem guardar quem ele barrou, e uma coluna
 * nova na view não pode virar PII na tela por omissão de quem escreveu o componente.
 */
export const CAMPOS_DESCARTE = [
  "canal_id",
  "canal_nome",
  "provedor",
  "dia",
  "motivo",
  "quantidade",
  "primeiro_em",
  "ultimo_em",
] as const;

export type CampoDescarte = (typeof CAMPOS_DESCARTE)[number];
export type LinhaDescarte = Record<CampoDescarte, unknown>;

export function sanitizarLinhaDescarte(bruta: Record<string, unknown>): LinhaDescarte {
  const limpa = {} as LinhaDescarte;
  for (const campo of CAMPOS_DESCARTE) limpa[campo] = bruta?.[campo] ?? null;
  return limpa;
}

export interface ResumoDescartes {
  total: number;
  porMotivo: { motivo: string; quantidade: number }[];
  desde: string | null;
  ate: string | null;
}

export function resumirDescartes(linhas: LinhaDescarte[]): ResumoDescartes {
  let total = 0;
  const porMotivo = new Map<string, number>();
  let desde: string | null = null;
  let ate: string | null = null;
  for (const l of linhas) {
    const q = Number(l.quantidade ?? 0);
    if (Number.isFinite(q)) total += q;
    const m = String(l.motivo ?? "desconhecido");
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + (Number.isFinite(q) ? q : 0));
    const p = l.primeiro_em ? String(l.primeiro_em) : null;
    const u = l.ultimo_em ? String(l.ultimo_em) : null;
    if (p && (!desde || p < desde)) desde = p;
    if (u && (!ate || u > ate)) ate = u;
  }
  return {
    total,
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)),
    desde,
    ate,
  };
}

export const ROTULO_MOTIVO_DESCARTE: Record<string, string> = {
  contraparte_desconhecida: "contraparte não é lead nem paciente",
  telefone_ilegivel: "telefone ilegível",
  canal_inativo: "canal desligado",
  grupo: "mensagem de grupo",
  status_broadcast: "status/transmissão",
};

/**
 * O sinal do NONO DÍGITO — a forma mais provável desta feature falhar sem ninguém ver.
 * O WhatsApp entrega 12 dígitos e o formulário 13 (`APRENDIZADOS.md` §8): um filtro que compare
 * telefone cru classifica PACIENTE CONHECIDO como desconhecido e descarta em silêncio. A mensagem
 * não é reentregue. Aqui não dá para provar que o oráculo está certo — dá para acender a suspeita
 * quando o padrão bate: descarte crescendo com zero mensagem persistida na mesma janela.
 */
export interface SinalFiltro {
  suspeito: boolean;
  motivo?: string;
}

export function suspeitaFiltroCego(janela: {
  descartados24h: number;
  persistidas24h: number;
}): SinalFiltro {
  if (janela.descartados24h > 0 && janela.persistidas24h === 0) {
    return {
      suspeito: true,
      motivo:
        `${janela.descartados24h} mensagem(ns) descartada(s) nas últimas 24 h e NENHUMA guardada. ` +
        "Pode ser normal (número pessoal recebe muita conversa de fora), mas é também a cara de um filtro " +
        "comparando telefone cru em vez da chave canônica — nesse caso ele está barrando paciente conhecido, " +
        "e o WhatsApp não reentrega. Confira o oráculo antes de assumir que é normal.",
    };
  }
  return { suspeito: false };
}

// ─────────────────────────────── contrato com a rota do runtime ───────────────────────────────

/**
 * O que a rota interna do runtime devolve. A web NUNCA fala com o provedor: se falasse, o token
 * de instância teria de chegar ao browser. O QR vem daqui, é desenhado e morre — não é gravado,
 * não é logado, não vai para o banco.
 */
export interface RespostaSessaoRuntime {
  estado: EstadoSessao;
  /**
   * código CRU do QR, quando o provedor devolve um. **Não é o caso do WuzAPI** — ver `qr_imagem`.
   * Quem desenha o código cru é o cliente (`regras/qr-pareamento.ts`).
   */
  qr?: string | null;
  /**
   * O QR JÁ COMO IMAGEM, em `data:` — e é ESTE o campo que o dialeto de produção preenche.
   *
   * O nome é o do contrato do runtime (`whatsapp/lite/sessao.ts`, campos `qr_imagem`/`qr_formato`),
   * copiado letra por letra de propósito: a última vez que esta trilha quebrou foi por um nome que
   * não casava entre as duas pontas, e o sintoma de um nome errado aqui é exatamente o de um QR que
   * não chegou — quadro vazio, sem erro nenhum.
   *
   * MEDIDO no Go do provedor: `wmiau.go` faz `qrcode.Encode(...)` e grava
   * `"data:image/png;base64," + base64(PNG)`; `handlers.go` devolve isso em `{"QRCode": …}`. Ou
   * seja, o que chega já é um PNG pronto — e era descartado na fronteira, porque esta interface só
   * transportava `qr`.
   */
  qr_imagem?: string | null;
  /** o que o runtime diz ter mandado. A tela decide pelo que CHEGOU e usa isto só para denunciar a divergência. */
  qr_formato?: "codigo" | "imagem" | null;
  /**
   * `true` ⇒ o runtime **não conseguiu falar com o provedor** nesta leitura, e o `estado` acima é
   * o ÚLTIMO CONHECIDO — não um palpite, e não foi regravado no banco.
   *
   * Existe porque a versão anterior colapsava "não sei" em `desconectado`: um timeout de rede
   * derrubava a tela para "nenhuma sessão ativa", o relê parava (só rearma em `aguardando_qr`) e a
   * fono ficava travada no meio do pareamento até recarregar. Quem consome DEVE continuar relendo
   * enquanto isto for `true`.
   */
  provedor_indisponivel?: boolean;
  /** quando indisponível, o que falhou — para a tela dizer, em vez de sumir. */
  causa_rede?: string | null;
  qr_expira_em?: string | null;
  desde?: string | null;
  motivo?: string | null;
}

/**
 * Os tipos de imagem que a tela aceita pôr num `<img>`, e por que a lista é fechada.
 *
 * O `data:` chega de outro processo por HTTP. Um `src` que aceitasse qualquer string aceitaria
 * também `javascript:`; um que aceitasse `data:image/svg+xml,<svg …>` em texto puro aceitaria a
 * carga sem passar por base64. Exigir `data:image/<tipo conhecido>;base64,` fecha os dois de uma
 * vez, e é uma linha. `svg+xml` está na lista porque é o que o STUB do runtime manda (uma imagem
 * que se anuncia como não escaneável, para ninguém confundir bancada com produção).
 */
const RE_IMAGEM_QR = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Um QR de 256px em PNG dá ~2-6 KB em base64. Meio mega é folga larga e ainda barra despejo. */
export const LIMITE_IMAGEM_QR_BYTES = 512 * 1024;

/** Devolve a imagem só se ela for exibível; qualquer outra coisa vira `null`, nunca um `src` torto. */
export function imagemQrSegura(bruta: unknown): string | null {
  if (typeof bruta !== "string") return null;
  const v = bruta.trim();
  if (!v || v.length > LIMITE_IMAGEM_QR_BYTES) return null;
  return RE_IMAGEM_QR.test(v) ? v : null;
}

export const TIMEOUT_RUNTIME_MS = 10_000;

export const MOTIVO_RUNTIME_MUDO =
  "sem resposta do runtime em 10 segundos — não é QR vazio nem carregando infinito: o serviço não respondeu";

export const MOTIVO_CREDENCIAL_PROVEDOR =
  "a credencial do provedor está ausente ou inválida no runtime (a tela não vê, não guarda e não mostra credencial nenhuma)";

export const MOTIVO_SEM_ROTA =
  "a rota interna de sessão do runtime não está configurada neste ambiente — sem ela não há como criar sessão nem obter QR";

/** O runtime responde 200 com `{ok: false, motivo}` quando a operação falhou no servidor. */
export function corpoRuntimeIndicaFalha(corpo: unknown): { falhou: false } | { falhou: true; motivo: string } {
  if (corpo && typeof corpo === "object" && "ok" in corpo && (corpo as Record<string, unknown>).ok === false) {
    const m = (corpo as Record<string, unknown>).motivo;
    return { falhou: true, motivo: typeof m === "string" ? m : "o runtime respondeu ok: false" };
  }
  return { falhou: false };
}

/** Normaliza a resposta do runtime; qualquer coisa fora do contrato vira desconectado + motivo. */
export function normalizarRespostaRuntime(bruta: unknown): RespostaSessaoRuntime {
  const b = (bruta ?? {}) as Record<string, unknown>;
  const estado = estadoSessaoValido(b.estado) ? b.estado : "desconectado";
  const qr = typeof b.qr === "string" && b.qr.length > 0 ? b.qr : null;
  const formato = b.qr_formato === "codigo" || b.qr_formato === "imagem" ? b.qr_formato : null;
  return {
    estado,
    qr,
    // a imagem passa pelo filtro AQUI, na borda, e não no componente: assim existe um lugar só
    // onde um `src` pode nascer, e ele é o mesmo que os testes exercem.
    qr_imagem: imagemQrSegura(b.qr_imagem),
    qr_formato: formato,
    qr_expira_em: typeof b.qr_expira_em === "string" ? b.qr_expira_em : null,
    desde: typeof b.desde === "string" ? b.desde : null,
    motivo: typeof b.motivo === "string" ? b.motivo : null,
    // "não consegui falar com o provedor NESTA leitura" — e o `estado` que veio junto é o último
    // conhecido, não um palpite. É o que mantém o relê armado; sem transportar, o conserto do
    // runtime morre na borda e a tela volta a congelar.
    provedor_indisponivel: b.provedor_indisponivel === true,
    causa_rede: typeof b.causa_rede === "string" ? b.causa_rede : null,
  };
}

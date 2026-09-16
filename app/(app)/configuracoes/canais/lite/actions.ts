"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  lerPapelAtual,
  lerUidAtual,
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import { lerCanal, lerResponsavelDoCanal } from "@/components/configuracoes/dados/canais";
import {
  contarConversasTocadas24h,
  criarSessaoNoRuntime,
  provisionarInstanciaNoRuntime,
  desconectarNoRuntime,
  lerDescartes,
  lerEstadoNoRuntime,
  lerSessao,
} from "@/components/configuracoes/dados/lite-sessao";
import {
  payloadConsentimento,
  podeCriarSessao,
  resumirDescartes,
  suspeitaFiltroCego,
  validadeQr,
  validarConsentimento,
  type EstadoSessao,
  type FormConsentimento,
  type RespostaSessaoRuntime,
  type ResumoDescartes,
  type SinalFiltro,
} from "@/components/configuracoes/regras/lite-sessao.ts";

/**
 * F11 · Ações da sessão do canal NÃO OFICIAL.
 *
 * A fronteira que sustenta o resto: **a web nunca fala com o provedor**. Ela fala com a rota
 * interna do runtime (segredo só no servidor) e com o banco. O QR trafega runtime → tela e morre:
 * não é gravado, não é logado, não vai para `core.evento` nem para `ops`.
 *
 * O gate do F8 chega por parâmetro, não por leitura própria: quem sabe se o F8 está em produção e
 * verificado por V8 é o Estaleiro, e inventar aqui uma heurística de "parece pronto" seria a
 * maneira mais fácil de destravar o pareamento sem que ninguém tenha verificado nada.
 */

const ROTA = "/configuracoes/canais";

export interface EstadoSessaoNaTela {
  estado: EstadoSessao;
  /** código CRU do QR, quando o provedor manda um. Nunca persistido — chega, desenha, morre. */
  qr: string | null;
  /**
   * o QR JÁ DESENHADO pelo provedor, em `data:` — é o que o dialeto de produção manda (o campo
   * `qr_imagem` do contrato do runtime). Já veio filtrado por `imagemQrSegura`. Também não é
   * persistido: é credencial viva igual ao código, só que em pixels.
   */
  qrImagem: string | null;
  /** o que o runtime declarou ter mandado. A tela decide pelo que chegou; isto denuncia divergência. */
  qrFormato: "codigo" | "imagem" | null;
  qrExpiraEm: string | null;
  /** false SÓ quando um instante legível já passou. Ausência de instante não é morte — ver `validadeQr`. */
  qrValido: boolean;
  /** true = o provedor não declarou prazo nenhum. A tela mostra o QR E diz que ninguém está contando. */
  qrSemPrazo: boolean;
  detalhe: string | null;
  desde: string | null;
  motivo?: string;
  /** true = a leitura de status do banco falhou (0081 ainda não subiu neste ambiente). */
  statusIndisponivel: boolean;
  /**
   * true = o RUNTIME não conseguiu falar com o PROVEDOR nesta leitura. Não confundir com
   * `statusIndisponivel`, que é o banco: aqui o `estado` acima é o último conhecido, e a tela
   * PRECISA continuar relendo — parar congela a fono no meio do pareamento.
   */
  provedorIndisponivel: boolean;
  /** quando indisponível, o que falhou na rede — para a tela dizer em vez de sumir. */
  causaRede: string | null;
}

/**
 * Cria a sessão. Ordem deliberada: o PORTÃO primeiro (papel → provedor → consentimento → F8), e
 * só depois a chamada ao runtime. Pedir o QR antes de checar o consentimento seria abrir a sessão
 * de uma pessoa que talvez não saiba do risco — e o QR já teria sido emitido.
 */
export async function criarSessao(
  canalId: string,
  ctx: { f8Pronto: boolean },
): Promise<EstadoSessaoNaTela> {
  // 16/09 · o uid e o dono entram porque o membro pareia o PRÓPRIO canal. Os dois vêm do servidor —
  // nunca da tela, que poderia dizer que o número é de quem quisesse.
  const [lido, papel, uid, responsavel] = await Promise.all([
    lerCanal(canalId),
    lerPapelAtual(),
    lerUidAtual(),
    lerResponsavelDoCanal(canalId),
  ]);
  const canal = lido ? { ...lido, responsavel_id: responsavel } : null;
  const veredito = podeCriarSessao({ papel, uid, canal, f8Pronto: ctx.f8Pronto });
  if (!veredito.pode) {
    return {
      estado: "desconectado",
      qr: null,
      qrImagem: null,
      qrFormato: null,
      qrExpiraEm: null,
      qrValido: false,
      qrSemPrazo: false,
      detalhe: null,
      desde: null,
      motivo: veredito.motivo,
      statusIndisponivel: false,
      provedorIndisponivel: false,
      causaRede: null,
    };
  }

  /*
   * PROVISIONA ANTES DE PEDIR O QR — dois passos, e a ordem é do provedor.
   *
   * O WuzAPI recusa `connect` de uma instância que não existe, e é isso que produzia o **502** que
   * a tela mostrava num canal recém-criado (medido em 14/09). A instância nasce aqui.
   *
   * Provisionar é IDEMPOTENTE do lado do provedor — canal que já tem instância volta a mesma —, e
   * por isso a chamada é incondicional: guardar "já provisionei" num estado da tela seria manter
   * uma segunda verdade sobre um fato que só o provedor conhece.
   *
   * ⚠️ A falha aqui NÃO é ignorada, e também não interrompe: se o provisionamento não passou, o
   * `connect` seguinte vai falhar de qualquer jeito, e o motivo DELE é mais específico do que
   * "falhou ao provisionar". Mas se o provisionamento falhou com uma causa que a sessão não sabe
   * explicar — 503 com a lista de env que faltam, por exemplo —, é esse motivo que a pessoa
   * precisa ler. Então o motivo do provisionamento só aparece quando a sessão não tem um próprio.
   */
  const prov = await provisionarInstanciaNoRuntime(canalId);
  const r = await criarSessaoNoRuntime(canalId);
  revalidatePath(ROTA);
  const estado = montarEstado(r.ok ? r.resposta ?? null : null, r.motivo, false);
  if (!prov.ok && !r.ok) {
    return { ...estado, motivo: `não deu para preparar o número: ${prov.motivo ?? "o runtime recusou"}` };
  }
  return estado;
}

/** Releitura. O status vem do BANCO (sobrevive a restart); o QR, do runtime. */
export async function lerEstadoSessao(canalId: string): Promise<EstadoSessaoNaTela> {
  const [doBanco, doRuntime] = await Promise.all([lerSessao(canalId), lerEstadoNoRuntime(canalId)]);

  if (doRuntime.ok && doRuntime.resposta) {
    const base = montarEstado(doRuntime.resposta, undefined, doBanco.indisponivel);
    // o detalhe legível é do banco (o runtime não guarda histórico de mensagem do provedor)
    return { ...base, detalhe: doBanco.sessao?.detalhe ?? base.detalhe };
  }

  // runtime mudo: o status do banco ainda vale, e dizer isso é melhor que "desconectado" chutado.
  const s = doBanco.sessao;
  return {
    // sem runtime não há QR NENHUM para mostrar: o banco guarda o INSTANTE, nunca a credencial
    // (0081). `qrValido: false` aqui não é juízo sobre o código — é a ausência dele.
    estado: s?.status ?? "desconectado",
    qr: null,
    qrImagem: null,
    qrFormato: null,
    qrExpiraEm: s?.qr_expira_em ?? null,
    qrValido: false,
    qrSemPrazo: false,
    detalhe: s?.detalhe ?? null,
    desde: s?.ultimo_batimento ?? null,
    motivo: doRuntime.motivo,
    statusIndisponivel: doBanco.indisponivel,
    // Aqui quem não respondeu foi o RUNTIME (a web não o alcançou), não o provedor — mas para a
    // tela a consequência é a mesma e a decisão certa também: o `estado` acima é o último conhecido
    // (veio do banco) e o relê tem de continuar armado, senão a página fica parada num retrato
    // velho até alguém dar F5. É por isso que a marca é ligada nos dois casos.
    provedorIndisponivel: true,
    causaRede: null,
  };
}

export async function desconectarSessao(canalId: string): Promise<EstadoSessaoNaTela> {
  const r = await desconectarNoRuntime(canalId);
  revalidatePath(ROTA);
  return montarEstado(r.ok ? r.resposta ?? null : null, r.motivo, false);
}

function montarEstado(
  resposta: RespostaSessaoRuntime | null,
  motivo: string | undefined,
  statusIndisponivel: boolean,
): EstadoSessaoNaTela {
  if (!resposta) {
    return {
      estado: "desconectado",
      qr: null,
      qrImagem: null,
      qrFormato: null,
      qrExpiraEm: null,
      qrValido: false,
      qrSemPrazo: false,
      detalhe: null,
      desde: null,
      motivo,
      statusIndisponivel,
      provedorIndisponivel: false,
      causaRede: null,
    };
  }
  const qrExpiraEm = resposta.qr_expira_em ?? null;
  const qr = resposta.qr ?? null;
  const qrImagem = resposta.qr_imagem ?? null;
  // A validade é do QR, não do formato: uma vez que existe ALGUMA coisa a mostrar, quem decide se
  // ela pode aparecer é o instante. Sem nada a mostrar, `qrValido` é falso por ausência — e isso
  // não muda a tela, porque o quadro vazio já é o destino de "não chegou nada".
  const validade = qr || qrImagem ? validadeQr(qrExpiraEm, Date.now()) : "expirado";
  return {
    estado: resposta.estado,
    qr,
    qrImagem,
    qrFormato: resposta.qr_formato ?? null,
    qrExpiraEm,
    qrValido: validade !== "expirado",
    qrSemPrazo: validade === "sem_prazo",
    detalhe: resposta.motivo ?? null,
    desde: resposta.desde ?? null,
    motivo,
    statusIndisponivel,
    provedorIndisponivel: resposta.provedor_indisponivel === true,
    causaRede: resposta.causa_rede ?? null,
  };
}

/**
 * O consentimento da titular — PORTÃO da sessão, não rodapé. Sem ele registrado, a constraint do
 * banco recusa a ativação do canal e `podeCriarSessao` recusa o pareamento.
 */
export async function registrarConsentimento(form: FormConsentimento): Promise<ResultadoAcao> {
  const problemas = validarConsentimento(form, Date.now());
  if (Object.keys(problemas).length > 0) {
    return { ok: false, motivo: Object.values(problemas)[0], classe: "recusa" };
  }
  return registrarEventoComReadback({
    tipo: "canal_consentimento_registrado",
    payload: payloadConsentimento(form),
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
}

/**
 * O aceite explícito de um contato (caminho (a) do §0-bis: alguém passa a ser conhecido ANTES de
 * escrever). É ledger-only por desenho — `core.contraparte_conhecida()` lê o evento direto —, e a
 * conferência declarada é a existência no ledger.
 */
export async function registrarAceiteContato(dados: {
  telefone: string;
  meio: "resposta_whatsapp" | "presencial" | "formulario";
  observacao?: string;
}): Promise<ResultadoAcao> {
  const telefone = (dados.telefone ?? "").trim();
  if (telefone.length < 8) {
    return { ok: false, motivo: "informe o telefone completo, com DDD", classe: "recusa" };
  }
  const payload: Record<string, unknown> = { telefone, meio: dados.meio };
  const obs = (dados.observacao ?? "").trim();
  if (obs) payload.observacao = obs;
  return registrarEventoComReadback({
    tipo: "aceite_contato_registrado",
    payload,
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
}

export interface PainelDescartes {
  resumo: ResumoDescartes;
  sinal: SinalFiltro;
  indisponivel: boolean;
}

/**
 * O contador CEGO. Responde "o filtro está funcionando?" sem responder "quem foi barrado?" — e o
 * sinal de suspeita existe porque a forma mais provável desta feature falhar é silenciosa:
 * descartar paciente conhecido por comparar telefone cru (12 × 13 dígitos).
 */
export async function lerPainelDescartes(canalId: string): Promise<PainelDescartes> {
  const [descartes, tocadas] = await Promise.all([
    lerDescartes(canalId, 7),
    contarConversasTocadas24h(canalId),
  ]);
  const resumo = resumirDescartes(descartes.linhas);
  const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const descartados24h = descartes.linhas
    .filter((l) => String(l.dia ?? "") >= ontem)
    .reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
  return {
    resumo,
    // sem o número de conversas tocadas, não acuso: sinal falso desliga portão.
    sinal:
      tocadas === null
        ? { suspeito: false }
        : suspeitaFiltroCego({ descartados24h, persistidas24h: tocadas }),
    indisponivel: descartes.indisponivel,
  };
}

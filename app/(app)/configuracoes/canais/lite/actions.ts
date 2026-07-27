"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  lerPapelAtual,
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import { lerCanal } from "@/components/configuracoes/dados/canais";
import {
  contarConversasTocadas24h,
  criarSessaoNoRuntime,
  desconectarNoRuntime,
  lerDescartes,
  lerEstadoNoRuntime,
  lerSessao,
} from "@/components/configuracoes/dados/lite-sessao";
import {
  payloadConsentimento,
  podeCriarSessao,
  qrExpirado,
  resumirDescartes,
  suspeitaFiltroCego,
  validarConsentimento,
  type EstadoSessao,
  type FormConsentimento,
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
  /** código CRU do QR, quando houver. Nunca persistido — chega, desenha, morre. */
  qr: string | null;
  qrExpiraEm: string | null;
  qrValido: boolean;
  detalhe: string | null;
  desde: string | null;
  motivo?: string;
  /** true = a leitura de status do banco falhou (0081 ainda não subiu neste ambiente). */
  statusIndisponivel: boolean;
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
  const [canal, papel] = await Promise.all([lerCanal(canalId), lerPapelAtual()]);
  const veredito = podeCriarSessao({ papel, canal, f8Pronto: ctx.f8Pronto });
  if (!veredito.pode) {
    return {
      estado: "desconectado",
      qr: null,
      qrExpiraEm: null,
      qrValido: false,
      detalhe: null,
      desde: null,
      motivo: veredito.motivo,
      statusIndisponivel: false,
    };
  }

  const r = await criarSessaoNoRuntime(canalId);
  revalidatePath(ROTA);
  return montarEstado(r.ok ? r.resposta ?? null : null, r.motivo, false);
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
    estado: s?.status ?? "desconectado",
    qr: null,
    qrExpiraEm: s?.qr_expira_em ?? null,
    qrValido: false,
    detalhe: s?.detalhe ?? null,
    desde: s?.ultimo_batimento ?? null,
    motivo: doRuntime.motivo,
    statusIndisponivel: doBanco.indisponivel,
  };
}

export async function desconectarSessao(canalId: string): Promise<EstadoSessaoNaTela> {
  const r = await desconectarNoRuntime(canalId);
  revalidatePath(ROTA);
  return montarEstado(r.ok ? r.resposta ?? null : null, r.motivo, false);
}

function montarEstado(
  resposta: { estado: EstadoSessao; qr?: string | null; qr_expira_em?: string | null; desde?: string | null; motivo?: string | null } | null,
  motivo: string | undefined,
  statusIndisponivel: boolean,
): EstadoSessaoNaTela {
  if (!resposta) {
    return {
      estado: "desconectado",
      qr: null,
      qrExpiraEm: null,
      qrValido: false,
      detalhe: null,
      desde: null,
      motivo,
      statusIndisponivel,
    };
  }
  const qrExpiraEm = resposta.qr_expira_em ?? null;
  return {
    estado: resposta.estado,
    qr: resposta.qr ?? null,
    qrExpiraEm,
    qrValido: resposta.qr ? !qrExpirado(qrExpiraEm, Date.now()) : false,
    detalhe: resposta.motivo ?? null,
    desde: resposta.desde ?? null,
    motivo,
    statusIndisponivel,
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

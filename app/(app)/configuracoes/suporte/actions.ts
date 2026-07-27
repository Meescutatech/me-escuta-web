"use server";

import { randomUUID } from "crypto";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  lerPapelAtual,
  lerUidAtual,
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import {
  BUCKET_SUPORTE,
  caminhoAnexoSuporte,
  payloadTicketAberto,
  payloadTicketComentado,
  payloadTicketResolvido,
  podeAbrirChamado,
  podeResolverChamado,
  primeiraPasta,
  semProblemasChamado,
  validarAnexoSuporte,
  validarChamado,
  MAX_ANEXOS,
  MOTIVO_UPLOAD_FALHOU,
  type AnexoDoEvento,
  type FormChamado,
} from "@/components/suporte/regras/suporte.ts";

/**
 * F12 · Abrir, comentar e resolver chamado de suporte.
 *
 * Duas coisas que não são detalhe:
 *
 *  1. O ANEXO SOBE ANTES DO EVENTO, e o evento carrega o CAMINHO, nunca o binário. Se o upload
 *     falhar, o chamado NÃO é gravado sem a imagem por conta própria: enviar sem ela vira escolha
 *     explícita de quem está reportando (`semAnexo: true`).
 *  2. O CAMINHO É `<uid>/<ticket_id>/<arquivo>` e a RLS por autor do Storage DEPENDE disso. Por
 *     isso o `ticket_id` é gerado aqui, antes do upload — e é o mesmo que vai no payload, o que
 *     de quebra torna o readback determinístico.
 */

const ROTA = "/configuracoes/suporte";

export interface ArquivoParaSubir {
  nome: string;
  tipo: string;
  tamanho: number;
  /** conteúdo já lido no cliente. O componente envia; o servidor sobe com a sessão do usuário. */
  conteudo: ArrayBuffer;
}

export interface ResultadoAbertura extends ResultadoAcao {
  ticketId?: string;
  /** anexos que não subiram — a tela decide se reenvia ou envia sem eles. */
  anexosFalhos?: string[];
}

export async function abrirChamado(
  form: FormChamado,
  arquivos: ArquivoParaSubir[] = [],
  opcoes: { semAnexo?: boolean } = {},
): Promise<ResultadoAbertura> {
  const papel = await lerPapelAtual();
  if (!podeAbrirChamado(papel)) {
    return { ok: false, motivo: "é preciso estar autenticado para abrir chamado", classe: "permissao" };
  }

  const problemas = validarChamado(form);
  if (!semProblemasChamado(problemas)) {
    return { ok: false, motivo: Object.values(problemas)[0], classe: "recusa" };
  }

  const uid = await lerUidAtual();
  if (!uid) {
    return { ok: false, motivo: "não deu para identificar o seu usuário — recarregue a página", classe: "outro" };
  }

  const ticketId = randomUUID();
  const anexos: AnexoDoEvento[] = [];
  const falhos: string[] = [];

  for (const arq of arquivos.slice(0, MAX_ANEXOS)) {
    const valido = validarAnexoSuporte({ type: arq.tipo, size: arq.tamanho });
    if (!valido.ok) return { ok: false, motivo: valido.motivo, classe: "recusa" };
    const subido = await subirAnexo(uid, ticketId, arq, valido.mime);
    if (subido) anexos.push(subido);
    else falhos.push(arq.nome);
  }

  if (falhos.length > 0 && !opcoes.semAnexo) {
    return { ok: false, motivo: MOTIVO_UPLOAD_FALHOU, anexosFalhos: falhos, classe: "outro" };
  }

  const r = await registrarEventoComReadback({
    tipo: "suporte_ticket_aberto",
    payload: payloadTicketAberto({ ticketId, form, anexos }),
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
  return { ...r, ticketId: r.ok ? ticketId : undefined, ...(falhos.length ? { anexosFalhos: falhos } : {}) };
}

/**
 * Sobe um anexo com a SESSÃO DO USUÁRIO (anon key + JWT), nunca com chave de serviço: quem decide
 * se o objeto pode ser gravado é a policy do Storage, e ela compara a primeira pasta com o uid.
 */
async function subirAnexo(
  uid: string,
  ticketId: string,
  arq: ArquivoParaSubir,
  mime: string,
): Promise<AnexoDoEvento | null> {
  const caminho = caminhoAnexoSuporte(uid, ticketId, arq.nome);
  // cinto e suspensório: se a primeira pasta não for o uid, a policy recusaria — e um caminho
  // montado errado que "quase" funciona é como um anexo vaza para fora do dono.
  if (primeiraPasta(caminho) !== uid) return null;
  try {
    const supabase = criarClienteServidor();
    const { error } = await supabase.storage
      .from(BUCKET_SUPORTE)
      .upload(caminho, arq.conteudo, { contentType: mime, upsert: false });
    if (error) return null;
    return { caminho, mime, nome: arq.nome, bytes: arq.tamanho };
  } catch {
    return null;
  }
}

export async function comentarChamado(ticketId: string, texto: string): Promise<ResultadoAcao> {
  if ((texto ?? "").trim().length === 0) {
    return { ok: false, motivo: "escreva o comentário", classe: "recusa" };
  }
  return registrarEventoComReadback({
    tipo: "suporte_ticket_comentado",
    payload: payloadTicketComentado(ticketId, texto),
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
}

export async function resolverChamado(ticketId: string, resolucao: string): Promise<ResultadoAcao> {
  const papel = await lerPapelAtual();
  if (!podeResolverChamado(papel)) {
    return { ok: false, motivo: "resolver chamado exige admin ou owner", classe: "permissao" };
  }
  if ((resolucao ?? "").trim().length === 0) {
    return { ok: false, motivo: "escreva o que foi feito — é o que o autor do chamado vai ler", classe: "recusa" };
  }
  return registrarEventoComReadback({
    tipo: "suporte_ticket_resolvido",
    payload: payloadTicketResolvido(ticketId, resolucao),
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
}

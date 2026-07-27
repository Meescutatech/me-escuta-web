/**
 * PONTO ÚNICO DE ESCRITA da Web-B (F9 · F11 · F12 · F14). SERVIDOR — nunca importar de componente
 * client (o portão `cliente` reprova quem tentar).
 *
 * Por que ponto ÚNICO e não uma chamada em cada `actions.ts`: com quatro pontos de escrita,
 * "esqueci o readback num deles" é indetectável, e é assim que nasce a tela que diz "salvo" com a
 * lista vazia (R14/R15, ao vivo). Com um só, o portão `readback` vira regra de uma linha — e regra
 * que uma máquina confere não morre na próxima pressa.
 *
 * O READBACK É O DO F6 (Agent 1, `lib/eventos/confirmar-projecao.ts`) — importado, não reescrito.
 * Duas coisas somam a ele, e as duas são necessárias hoje:
 *
 *  1. FAIL-CLOSED PARA OS TIPOS DESTA NOITE. `confirmarProjecao` devolve `{ok:true}` quando a ação
 *     não está na tabela dele — prudente para os 20 caminhos antigos, e exatamente o defeito que o
 *     readback existe para pegar nos tipos NOVOS: eles estreiam junto com o ramo do dispatcher, e
 *     "tipo sem ramo passa calado" é o modo de falha nº 1 do projeto. Aqui, tipo sem conferência
 *     declarada é FALHA. As 10 linhas vivem em `regras/porta.ts` e migram para a tabela do F6 na
 *     fase 2, JUNTO do portão que as exercita com escrita real (regra do Orquestrador; E-020).
 *  2. CLASSE DO ERRO POR ERRCODE (ARB-21): o texto continua sendo o do banco; o errcode decide o
 *     que a tela faz depois.
 *
 * A sequência é sempre a mesma: guarda antissegredo → `api.registrar_evento(p)` → duplicado é
 * sucesso idempotente → RELEITURA da projeção → só então `revalidatePath` e `{ok:true}`.
 */

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  MOTIVO_NAO_PROJETADO,
  confirmarProjecao,
  excecaoDe,
  motivoFalhaVerificacao,
  temConferencia,
  type RespostaRegistrarEvento,
} from "@/lib/eventos/confirmar-projecao";
import {
  classificarErroPorta,
  excecaoWebB,
  montarEnvelope,
  motivoTipoSemConferencia,
  payloadSeguro,
  regraWebB,
  resolverFiltros,
  type ClasseErroPorta,
} from "../regras/porta.ts";

export type Supabase = ReturnType<typeof criarClienteServidor>;

export interface ResultadoAcao {
  ok: boolean;
  /** texto CRU da porta quando o banco recusou — a mensagem do banco É a mensagem da UI. */
  motivo?: string;
  /** true = a porta absorveu a repetição. É estado, não erro. */
  duplicado?: boolean;
  classe?: ClasseErroPorta;
  /**
   * O id do evento que a porta criou. É a IDENTIDADE do que nasceu — o ticket de suporte tem
   * `id = evento.id` (0070), e ARB-26 cravou que é assim para todo mundo: quem manda id de fora
   * está inventando identidade. Quem precisa referenciar o que acabou de criar usa este campo.
   */
  eventoId?: string;
}

export interface PedidoEscrita {
  tipo: string;
  payload: Record<string, unknown>;
  idExterno: string;
  revalidar?: string[];
}

export async function registrarEventoComReadback(pedido: PedidoEscrita): Promise<ResultadoAcao> {
  const seguro = payloadSeguro(pedido.payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo, classe: "recusa" };

  // fail-closed ANTES de escrever: recusar depois de gravar no ledger append-only seria tarde.
  const conhecidoPeloF6 = temConferencia(pedido.tipo) || excecaoDe(pedido.tipo) !== null;
  const regra = regraWebB(pedido.tipo);
  const excecao = excecaoWebB(pedido.tipo);
  if (!conhecidoPeloF6 && !regra && !excecao) {
    return { ok: false, motivo: motivoTipoSemConferencia(pedido.tipo), classe: "outro" };
  }

  const supabase = criarClienteServidor();
  const envelope = montarEnvelope(pedido.tipo, pedido.idExterno, pedido.payload);
  const { data, error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });

  if (error) {
    const classe = classificarErroPorta((error as { code?: string }).code);
    return { ok: false, motivo: error.message, classe };
  }

  const resposta = (data ?? null) as RespostaRegistrarEvento | null;

  // Duplicado é ESTADO: a projeção vigente é a do evento original, não há posição nova a conferir.
  if (resposta?.duplicado) {
    revalidar(pedido.revalidar);
    return { ok: true, duplicado: true, eventoId: resposta.evento_id };
  }

  const veredito = conhecidoPeloF6
    ? await confirmarProjecao(supabase, pedido.tipo, pedido.payload, resposta)
    : await conferir(supabase, pedido.tipo, pedido.payload, resposta);

  if (!veredito.ok) return { ok: false, motivo: veredito.motivo, classe: "outro" };

  revalidar(pedido.revalidar);
  return { ok: true, eventoId: resposta?.evento_id };
}

/**
 * A releitura dos tipos novos. Determinística, não polling: os projetores rodam na mesma transação
 * da porta — quando o RPC volta, a linha existe ou nunca vai existir.
 *
 * "não achei" e "não consegui ler" ficam SEPARADOS: o primeiro acusa ramo perdido no dispatcher, o
 * segundo é rede ou RLS e não prova nada sobre a projeção. Tratar os dois igual manda alguém caçar
 * bug de banco por causa de wifi.
 */
async function conferir(
  supabase: Supabase,
  tipo: string,
  payload: Record<string, unknown>,
  resposta: RespostaRegistrarEvento | null,
): Promise<{ ok: boolean; motivo?: string }> {
  const excecao = excecaoWebB(tipo);
  if (excecao) {
    if (!excecao.conferirLedger || !resposta?.evento_id) return { ok: true };
    const { data, error } = await supabase
      .schema("core")
      .from("evento")
      .select("id")
      .eq("id", resposta.evento_id)
      .limit(1);
    if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
    return (data ?? []).length > 0 ? { ok: true } : { ok: false, motivo: MOTIVO_NAO_PROJETADO };
  }

  const regra = regraWebB(tipo);
  if (!regra) return { ok: false, motivo: motivoTipoSemConferencia(tipo) };

  const filtros = resolverFiltros(regra, payload, resposta?.evento_id ?? null);
  if (!filtros) {
    // Um filtro sem valor transformaria "esta linha" em "qualquer linha" — a conferência passaria
    // a aprovar a escrita de outra pessoa. Melhor recusar e mandar recarregar.
    return {
      ok: false,
      motivo: motivoFalhaVerificacao("faltou dado no payload para montar a releitura da projeção"),
    };
  }

  let consulta = supabase.schema("core").from(regra.fonte).select(regra.coluna);
  for (const f of filtros) {
    consulta = f.tipo === "naoNulo" ? consulta.not(f.campo, "is", null) : consulta.eq(f.campo, f.valor);
  }
  const { data, error } = await consulta.limit(1);
  if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
  return (data ?? []).length > 0 ? { ok: true } : { ok: false, motivo: MOTIVO_NAO_PROJETADO };
}

function revalidar(rotas: string[] | undefined): void {
  for (const r of rotas ?? []) revalidatePath(r);
}

/** Papel do usuário logado, resolvido no servidor. `null` = sem papel (ou leitura indisponível). */
export async function lerPapelAtual(): Promise<"owner" | "admin" | "membro" | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase.schema("api").rpc("papel_atual");
    if (error) return null;
    const p = String(data ?? "").trim();
    return p === "owner" || p === "admin" || p === "membro" ? p : null;
  } catch {
    return null;
  }
}

/** uid do usuário logado — a PRIMEIRA PASTA do caminho do anexo depende dele (RLS do Storage). */
export async function lerUidAtual(): Promise<string | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

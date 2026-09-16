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
 *  1. FAIL-CLOSED. As 10 linhas desta trilha JÁ MIGRARAM para a tabela do F6 (27/07, junto do caso
 *     que as exercita com escrita real). O que fica aqui é a recusa de tipo NÃO declarado:
 *     `confirmarProjecao` devolve `{ok:true}` nesse caso — prudente para os 20 caminhos antigos, e
 *     o defeito exato para um tipo que estreia junto com o ramo novo do dispatcher.
 *  2. CLASSE DO ERRO POR ERRCODE (ARB-21): o texto continua sendo o do banco; o errcode decide o
 *     que a tela faz depois.
 *
 * A sequência é sempre a mesma: guarda antissegredo → `api.registrar_evento(p)` → duplicado é
 * sucesso idempotente → RELEITURA da projeção → só então `revalidatePath` e `{ok:true}`.
 */

import { revalidatePath } from "next/cache";
import { PAPEIS, type Papel } from "@/lib/membros";
import { criarClienteServidor } from "@/lib/supabase/server";
import { confirmarProjecao, type RespostaRegistrarEvento } from "@/lib/eventos/confirmar-projecao";
import {
  classificarErroPorta,
  montarEnvelope,
  motivoTipoSemConferencia,
  payloadSeguro,
  tipoDeclarado,
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
  /**
   * 16/09 · O id do canal que FICOU gravado. No não oficial ele pode não ser o da prévia
   * (`lite:ana-2` quando `lite:ana` já existia), e quem pede a sessão logo depois precisa deste.
   */
  canalId?: string;
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

  // FAIL-CLOSED, e ele continua sendo meu: `confirmarProjecao` devolve {ok:true} para ação fora da
  // tabela, o que é prudente para os 20 caminhos antigos e é o defeito exato num tipo que estreia
  // junto com o ramo novo do dispatcher. Aqui, tipo sem conferência declarada recusa ANTES de
  // escrever — depois de gravar num ledger append-only seria tarde.
  if (!tipoDeclarado(pedido.tipo)) {
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

  const veredito = await confirmarProjecao(supabase, pedido.tipo, pedido.payload, resposta);
  if (!veredito.ok) return { ok: false, motivo: veredito.motivo, classe: "outro" };

  revalidar(pedido.revalidar);
  return { ok: true, eventoId: resposta?.evento_id };
}

function revalidar(rotas: string[] | undefined): void {
  for (const r of rotas ?? []) revalidatePath(r);
}

// O vocabulario de papel mora em `lib/membros.ts` (logica pura, sem I/O) — reexportado aqui
// porque este e o modulo que as telas ja importam para ler papel.
export { PAPEIS, podeVerMarketing, type Papel } from "@/lib/membros";

/** Papel do usuário logado, resolvido no servidor. `null` = sem papel (ou leitura indisponível). */
export async function lerPapelAtual(): Promise<Papel | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase.schema("api").rpc("papel_atual");
    if (error) return null;
    const p = String(data ?? "").trim();
    // ALLOWLIST: papel que o banco devolve e a web nao conhece vira `null`, e `null` e tratado
    // como "sem poder nenhum" em todo o app. Falhar fechado e o certo — mas a lista tem de
    // espelhar o CHECK, senao ela recusa papel legitimo em silencio (ver `lib/membros.ts`).
    return (PAPEIS as readonly string[]).includes(p) ? (p as Papel) : null;
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

/**
 * 16/09 · D116 — nome e e-mail de quem está logado, do CADASTRO (`core.v_membro`). É de onde sai o
 * nome do número pessoal. Nunca de `user_metadata`, que a própria pessoa edita. `null` = não leu.
 */
export async function lerNomeAtual(): Promise<{ nome: string | null; email: string | null } | null> {
  try {
    const uid = await lerUidAtual();
    if (!uid) return null;
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_membro")
      .select("nome,email")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return null;
    const linha = data as { nome?: string | null; email?: string | null };
    return { nome: linha.nome ?? null, email: linha.email ?? null };
  } catch {
    return null;
  }
}

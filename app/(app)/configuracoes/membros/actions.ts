"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PapelConvidavel } from "@/lib/membros";

/**
 * Ações da aba Configurações > Membros (Bloco C).
 *
 * Governança (papel/funcao/revogar/reativar): evento via porta `api.registrar_evento` —
 * a matriz §3 é validada NO BANCO (0035); recusa volta como motivo legível.
 *
 * Convites: o runtime (VPS) é quem gera token + grava hash + monta o link (service_role
 * só lá). A chamada vai SERVER-SIDE com o access token do gestor (Bearer) — o runtime
 * valida o JWT no Auth e a porta re-checa o papel. V1 = convite por LINK (decisão 22/07;
 * email fica atrás da flag de config `convite.envio_email_ativo`, desligada).
 */

export interface ResultadoAcao {
  ok: boolean;
  motivo?: string;
}

/** Vínculo com departamento — o formato que `core.expandir_cargo` devolve e que o evento leva. */
export interface VinculoConvite {
  departamento: string;
  papel_no_departamento: "membro" | "gestor";
}

export interface ResultadoConvite extends ResultadoAcao {
  url?: string;
  convite_id?: string;
  expira_em?: string;
}

const CONVITES_URL = (process.env.CONVITES_URL ?? "http://localhost:8082").replace(/\/+$/, "");

async function registrarEventoMembros(
  tipo: string,
  payload: Record<string, unknown>,
): Promise<ResultadoAcao> {
  const supabase = criarClienteServidor();
  const envelope = { tipo, id_externo: randomUUID(), versao_payload: 1, payload };
  const { error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/configuracoes/membros");
  return { ok: true };
}

export async function mudarPapel(usuarioId: string, papelDe: string, papelPara: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("papel_alterado", {
    usuario_id: usuarioId,
    papel_de: papelDe,
    papel_para: papelPara,
  });
}

export async function mudarFuncao(usuarioId: string, funcaoDe: string | null, funcaoPara: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("funcao_alterada", {
    usuario_id: usuarioId,
    funcao_de: funcaoDe,
    funcao_para: funcaoPara,
  });
}

export async function revogarAcesso(usuarioId: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("acesso_revogado", { usuario_id: usuarioId });
}

export async function reativarAcesso(usuarioId: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("acesso_reativado", { usuario_id: usuarioId });
}

/** Bearer do gestor logado (o runtime valida no Auth; nunca expomos service_role aqui). */
async function tokenDoGestor(): Promise<string | null> {
  const supabase = criarClienteServidor();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function chamarConvites(caminho: string, corpo: Record<string, unknown>): Promise<ResultadoConvite> {
  const token = await tokenDoGestor();
  if (!token) return { ok: false, motivo: "sessão expirada — entre de novo" };
  try {
    const resp = await fetch(`${CONVITES_URL}${caminho}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resp.ok) {
      return { ok: false, motivo: typeof json.erro === "string" ? json.erro : `falha (${resp.status})` };
    }
    revalidatePath("/configuracoes/membros");
    return {
      ok: true,
      url: typeof json.url === "string" ? json.url : undefined,
      convite_id: typeof json.convite_id === "string" ? json.convite_id : undefined,
      expira_em: typeof json.expira_em === "string" ? json.expira_em : undefined,
    };
  } catch {
    return { ok: false, motivo: "runtime de convites fora do ar — tente de novo" };
  }
}

/**
 * Gera o convite por LINK (caminho único da V1) e devolve a URL de aceite pra copiar.
 *
 * `papel` era `"admin" | "membro"` escrito à mão aqui — a terceira cópia do vocabulário. Com
 * `PapelConvidavel` (fonte única em `lib/membros.ts`), acrescentar papel convidável passa a ser
 * uma linha lá, e o compilador cobra o resto do caminho em vez de deixar passar em silêncio.
 */
export async function gerarLinkConvite(email: string, papel: PapelConvidavel): Promise<ResultadoConvite> {
  return chamarConvites("/admin/convites", { email, papel, canal: "link" });
}

/** Reenviar = gerar link NOVO (o antigo morre no ato — spec §4.3). */
export async function reenviarConvite(conviteId: string): Promise<ResultadoConvite> {
  return chamarConvites("/admin/convites/reenviar", { convite_id: conviteId });
}

export async function revogarConvite(conviteId: string): Promise<ResultadoConvite> {
  return chamarConvites("/admin/convites/revogar", { convite_id: conviteId });
}

/**
 * CONVITE PELA TELA — por CARGO (0338), que é o que a tela de Membros pergunta.
 *
 * `gerarLinkConvite` acima manda `papel` e continua existindo para o degrade `TabelaMembros`.
 * Esta manda `cargo`, e quem expande para papel + lotação é o BANCO (`core.expandir_cargo`).
 * Duas rotas, um caminho: as duas caem no mesmo `POST /admin/convites`, que aceita um ou outro
 * (runtime `src/convites/servidor.ts:187`) — o que não existe é convite sem nenhum dos dois.
 *
 * O e-mail é OBRIGATÓRIO e não é burocracia: `porta.criar_convite` grava o convite nele, o aceite
 * confere `v_email <> c.email`, e é por ele que o sistema sabe que este link é DESTA pessoa. O
 * modal não pedia e-mail — era o sintoma mais visível de que ele não falava com o servidor.
 */
export async function gerarConvitePorCargo(email: string, cargo: string): Promise<ResultadoConvite> {
  const limpo = email.trim().toLowerCase();
  if (!limpo.includes("@")) return { ok: false, motivo: "informe um e-mail válido" };
  if (!cargo.trim()) return { ok: false, motivo: "escolha um cargo" };
  return chamarConvites("/admin/convites", { email: limpo, cargo: cargo.trim(), canal: "link" });
}

/**
 * LINK ABERTO — um link, várias pessoas (0342-0344).
 *
 * Sem e-mail: `porta.aceitar_convite` não consome o token e não confere o e-mail no canal aberto —
 * cada pessoa traz o seu ao entrar. Quem monta o e-mail MARCADOR que a porta exige é o runtime, não
 * esta função e não a tela: e-mail é identidade, e identidade inventada pelo navegador é a classe
 * de defeito que esta rodada inteira existiu para tirar.
 *
 * ⚠️ O link é uma CREDENCIAL QUE SE ENCAMINHA: quem o receber de terceiro entra igual. Revogar mata
 * na hora (`POST /admin/convites/revogar`), e é por isso que a tela deixa o revogar à mão.
 *
 * Existe UM link aberto vivo por cargo de cada vez: o marcador leva o cargo, e a porta recusa
 * segundo convite pendente para o mesmo e-mail. Pedir outro devolve "já existe convite pendente" —
 * que é a verdade, e evita dois links do mesmo cargo abertos sem ninguém lembrar de fechar.
 */
export async function gerarConviteAberto(cargo: string): Promise<ResultadoConvite> {
  if (!cargo.trim()) return { ok: false, motivo: "escolha um cargo" };
  return chamarConvites("/admin/convites", { cargo: cargo.trim(), canal: "link_aberto" });
}

export interface PassoCargo {
  rotulo: string;
  ok: boolean;
  motivo?: string;
}

export interface ResultadoMudarCargo extends ResultadoAcao {
  /**
   * Um passo por evento emitido. Existe porque a mudança de cargo NÃO é uma transação: são até
   * três escritas (papel + tirar lotação + pôr lotação) e o banco não tem `cargo_alterado`. Se a
   * segunda falhar, a primeira já entrou — e a tela tem de dizer isso, não "não deu certo".
   */
  passos: PassoCargo[];
}

/**
 * MUDAR O CARGO DE QUEM JÁ ESTÁ DENTRO.
 *
 * Não existe evento `cargo_alterado` (medido 14/09 em `supabase/migrations/`: zero ocorrências).
 * Cargo é LEITURA de `core.usuario.papel` + `core.usuario_departamento` — foi o que a D91 travou,
 * e criar um evento novo agora seria criar uma segunda verdade sobre a mesma coisa. Então isto
 * compõe com os eventos que existem e que o projetor já sabe aplicar:
 *   `papel_alterado` (0035) · `usuario_departamento_removido` / `_atribuido` (0085).
 *
 * A expansão do cargo vem do BANCO (`core.expandir_cargo`, `grant execute to authenticated` na
 * 0338), nunca do catálogo do front: a tela mostra a expansão, o servidor decide qual é.
 *
 * O estado atual também é lido aqui, e não recebido do cliente: `papel_de` entra na guarda
 * (`api.registrar_evento` recusa admin rebaixando admin), e guarda que confia em número mandado
 * pelo navegador não é guarda.
 */
export async function mudarCargo(usuarioId: string, cargo: string): Promise<ResultadoMudarCargo> {
  const supabase = criarClienteServidor();

  const { data: expansao, error: errCargo } = await supabase
    .schema("core")
    .rpc("expandir_cargo", { p_cargo: cargo });
  if (errCargo) return { ok: false, motivo: errCargo.message, passos: [] };
  const alvo = expansao as { papel?: string; departamentos?: VinculoConvite[] } | null;
  if (!alvo?.papel) {
    return { ok: false, motivo: `cargo desconhecido: "${cargo}"`, passos: [] };
  }

  const [{ data: membro, error: errMembro }, { data: lotacao }] = await Promise.all([
    supabase.schema("core").from("v_membro").select("papel").eq("id", usuarioId).maybeSingle(),
    supabase
      .schema("core")
      .from("usuario_departamento")
      .select("departamento, papel_no_departamento")
      .eq("usuario_id", usuarioId)
      .is("removido_em", null),
  ]);
  if (errMembro) return { ok: false, motivo: errMembro.message, passos: [] };
  if (!membro) return { ok: false, motivo: "esse membro não existe no workspace", passos: [] };

  const papelDe = String((membro as { papel: string }).papel);
  const atuais = ((lotacao ?? []) as VinculoConvite[]).map((l) => ({
    departamento: String(l.departamento),
    papel_no_departamento: l.papel_no_departamento === "gestor" ? "gestor" : "membro",
  }));
  const novos = (alvo.departamentos ?? []).map((d) => ({
    departamento: String(d.departamento),
    papel_no_departamento: d.papel_no_departamento === "gestor" ? "gestor" : "membro",
  }));

  const passos: PassoCargo[] = [];
  const emitir = async (rotulo: string, tipo: string, payload: Record<string, unknown>) => {
    const r = await registrarEventoMembros(tipo, payload);
    passos.push(r.ok ? { rotulo, ok: true } : { rotulo, ok: false, motivo: r.motivo });
  };

  // 1 · papel, e SÓ quando muda. Emitir `papel_alterado` com papel_de = papel_para passaria pela
  //     guarda e sujaria o ledger com uma mudança que não houve.
  if (alvo.papel !== papelDe) {
    await emitir(`papel ${papelDe} → ${alvo.papel}`, "papel_alterado", {
      usuario_id: usuarioId,
      papel_de: papelDe,
      papel_para: alvo.papel,
    });
  }

  // 2 · tirar o que sobrou. Remover ANTES de atribuir: quem trocasse de departamento com a ordem
  //     invertida ficaria, no meio do caminho, lotado nos dois — e o rodízio M3 sortearia por lá.
  for (const a of atuais) {
    if (!novos.some((n) => n.departamento === a.departamento)) {
      await emitir(`sai de ${a.departamento}`, "usuario_departamento_removido", {
        usuario_id: usuarioId,
        departamento: a.departamento,
      });
    }
  }

  // 3 · pôr o que falta — inclusive quando só o papel_no_departamento mudou (membro ⇄ gestor):
  //     o projetor faz upsert e reativa `removido_em`, então reatribuir é o caminho correto.
  for (const n of novos) {
    const igual = atuais.find(
      (a) => a.departamento === n.departamento && a.papel_no_departamento === n.papel_no_departamento,
    );
    if (igual) continue;
    await emitir(`entra em ${n.departamento} como ${n.papel_no_departamento}`, "usuario_departamento_atribuido", {
      usuario_id: usuarioId,
      departamento: n.departamento,
      papel_no_departamento: n.papel_no_departamento,
    });
  }

  if (passos.length === 0) return { ok: true, motivo: "nada a mudar — já está nesse cargo", passos };
  const falhou = passos.filter((p) => !p.ok);
  if (falhou.length === 0) return { ok: true, passos };
  return {
    ok: false,
    motivo: falhou.map((p) => `${p.rotulo}: ${p.motivo ?? "recusado"}`).join(" · "),
    passos,
  };
}

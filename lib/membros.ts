/**
 * Lógica pura da aba Configurações > Membros (Rodada 11 / Bloco C).
 * Espelha a matriz de permissão §3 da SPEC-WORKSPACE-USUARIOS para HABILITAR/DESABILITAR
 * controles na UI — a defesa real vive no banco (api.registrar_evento v3 + porta.*, 0035);
 * aqui é só ergonomia (não mostrar botão que a porta vai recusar).
 */

export type Papel = "owner" | "admin" | "membro";

export interface MembroLinha {
  id: string;
  nome: string | null;
  email: string;
  papel: Papel;
  funcao: string | null;
  ativo: boolean;
  ultimo_acesso_em: string | null;
}

export interface ConviteLinha {
  id: string;
  email: string;
  papel: "admin" | "membro";
  funcao: string | null;
  criado_em: string;
  expira_em: string;
  status: "pendente" | "aceito" | "revogado" | "expirado";
}

export function rotuloPapel(papel: Papel): string {
  return papel === "owner" ? "Proprietário" : papel === "admin" ? "Admin" : "Membro";
}

/** Gestão de membros/convites (convidar, reenviar, revogar convite): admin e owner. */
export function podeGerirMembros(meuPapel: Papel | null): boolean {
  return meuPapel === "admin" || meuPapel === "owner";
}

/**
 * Select de papel na linha (§3):
 *  - ninguém edita o próprio papel; o papel do owner é fixo ("Proprietário", texto);
 *  - owner: muda admin<->membro de qualquer um;
 *  - admin: só PROMOVE membro -> admin (rebaixar admin é só do owner);
 *  - membro: nada.
 */
export function podeMudarPapel(meuPapel: Papel | null, alvo: { papel: Papel; souEu: boolean }): boolean {
  if (alvo.souEu || alvo.papel === "owner") return false;
  if (meuPapel === "owner") return true;
  if (meuPapel === "admin") return alvo.papel === "membro";
  return false;
}

/** Opções que o select de papel pode oferecer para um alvo (já sabendo que é editável). */
export function opcoesDePapel(meuPapel: Papel | null, papelAlvo: Papel): Papel[] {
  if (meuPapel === "owner") return ["admin", "membro"];
  if (meuPapel === "admin" && papelAlvo === "membro") return ["admin", "membro"]; // só promover de fato
  return [papelAlvo];
}

/** Revogar/reativar acesso (§3): owner qualquer não-owner; admin só membro; nunca a si mesmo. */
export function podeRevogar(meuPapel: Papel | null, alvo: { papel: Papel; souEu: boolean }): boolean {
  if (alvo.souEu || alvo.papel === "owner") return false;
  if (meuPapel === "owner") return true;
  if (meuPapel === "admin") return alvo.papel === "membro";
  return false;
}

/** Funcao (subtítulo livre): a própria qualquer um edita; a de outro, admin/owner. */
export function podeEditarFuncao(meuPapel: Papel | null, souEu: boolean): boolean {
  if (souEu) return true;
  return podeGerirMembros(meuPapel);
}

/** Iniciais pro avatar ("Diogo Fonseca" → "DF"; fallback no email). */
export function iniciaisMembro(nome: string | null, email: string): string {
  const base = (nome ?? "").trim() || email.split("@")[0].replace(/[._-]/g, " ").trim();
  const partes = base.split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : base.slice(0, 2);
  return letras.toUpperCase();
}

/** "Membro · convidado há 2 dias" (linha pendente do mockup). */
export function convidadoHa(criadoEm: string, agora: Date): string {
  const criado = new Date(criadoEm);
  const ms = agora.getTime() - criado.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "convidado agora";
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "convidado agora";
  if (horas < 24) return `convidado há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `convidado há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function emailConviteValido(email: string): boolean {
  const e = email.trim();
  return e.length >= 5 && e.includes("@") && e.indexOf("@") > 0 && e.indexOf("@") < e.length - 1 && !e.includes(" ");
}

/** Separa e ordena a tabela única do mockup: ativos (owner primeiro, depois nome) + pendentes no fim. */
export function ordenarTabela(membros: MembroLinha[], convites: ConviteLinha[]): {
  ativos: MembroLinha[];
  pendentes: ConviteLinha[];
} {
  const peso = (p: Papel) => (p === "owner" ? 0 : p === "admin" ? 1 : 2);
  const ativos = [...membros]
    .filter((m) => m.ativo)
    .sort((a, b) => peso(a.papel) - peso(b.papel) || (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));
  const pendentes = [...convites]
    .filter((c) => c.status === "pendente" || c.status === "expirado")
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  return { ativos, pendentes };
}

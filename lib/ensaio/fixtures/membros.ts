import { PESSOAS } from "../modo";

/**
 * MEMBROS + CONVITES de ensaio.
 *
 * Os quatro membros são as quatro pessoas do seletor "ver como…" — a tabela mostra a si mesma.
 * Os vínculos de departamento vêm do contrato D91 (R5): Sara é `gestor` de Pré-venda; Ana Paula é
 * `membro` de Clínico; Rodolfo e Diogo não têm lotação (admin/owner veem tudo).
 *
 * Dois convites pendentes, um de cada tipo que a tela precisa mostrar: um de `marketing` (o
 * Fernando, sem departamento) e um de `membro` que entra como `gestor` de Cobrança (a Priscila
 * humana). Um deles está a 6 dias do fim; o outro, a 1 dia — para o "expira em" ter dois tons.
 */

export type PapelWorkspace = "owner" | "admin" | "membro" | "marketing";
export type PapelNoDepartamento = "membro" | "gestor";

export interface VinculoDepartamento {
  departamento: string;
  papel_no_departamento: PapelNoDepartamento;
}

export interface MembroEnsaio {
  id: string;
  nome: string;
  email: string;
  papel: PapelWorkspace;
  funcao: string | null;
  ativo: boolean;
  departamentos: VinculoDepartamento[];
  ultimo_acesso_em: string | null;
  criado_em: string;
}

export interface ConviteEnsaio {
  id: string;
  /** Convite por LINK (V1): o e-mail é opcional — o nome ajuda a lembrar para quem foi. */
  nome: string | null;
  email: string | null;
  papel: Exclude<PapelWorkspace, "owner">;
  departamentos: VinculoDepartamento[];
  criado_em: string;
  expira_em: string;
  status: "pendente" | "expirado" | "aceito" | "revogado";
  token: string;
  criado_por: string;
}

const H = 3_600_000;
const D = 24 * H;

export function gerarMembrosEnsaio(agora: Date = new Date()): MembroEnsaio[] {
  const t = agora.getTime();
  const p = (chave: string) => PESSOAS.find((x) => x.chave === chave)!;
  return [
    {
      id: p("diogo").id,
      nome: p("diogo").nome,
      email: p("diogo").email,
      papel: "owner",
      funcao: "Tecnologia",
      ativo: true,
      departamentos: [],
      ultimo_acesso_em: new Date(t - 11 * 60_000).toISOString(),
      criado_em: new Date(t - 88 * D).toISOString(),
    },
    {
      id: p("rodolfo").id,
      nome: p("rodolfo").nome,
      email: p("rodolfo").email,
      papel: "admin",
      funcao: "Sócio · operação",
      ativo: true,
      departamentos: [],
      ultimo_acesso_em: new Date(t - 2 * H).toISOString(),
      criado_em: new Date(t - 80 * D).toISOString(),
    },
    {
      id: p("sara").id,
      nome: p("sara").nome,
      email: p("sara").email,
      papel: "membro",
      funcao: "Pré-venda",
      ativo: true,
      departamentos: [{ departamento: "pre_venda", papel_no_departamento: "gestor" }],
      ultimo_acesso_em: new Date(t - 6 * 60_000).toISOString(),
      criado_em: new Date(t - 41 * D).toISOString(),
    },
    {
      id: p("fono").id,
      nome: p("fono").nome,
      email: p("fono").email,
      papel: "membro",
      funcao: "Fonoaudióloga · CRFa 3-12849",
      ativo: true,
      departamentos: [{ departamento: "clinico", papel_no_departamento: "membro" }],
      ultimo_acesso_em: new Date(t - 3 * H).toISOString(),
      criado_em: new Date(t - 3 * D).toISOString(),
    },
  ];
}

export function gerarConvitesEnsaio(agora: Date = new Date()): ConviteEnsaio[] {
  const t = agora.getTime();
  const diogo = PESSOAS.find((x) => x.chave === "diogo")!.id;
  const rodolfo = PESSOAS.find((x) => x.chave === "rodolfo")!.id;
  return [
    {
      id: "c0000000-0000-4000-8000-000000000101",
      nome: "Fernando Lopes",
      email: "fernando@trisestrategia.com.br",
      papel: "marketing",
      departamentos: [],
      criado_em: new Date(t - 1 * D).toISOString(),
      expira_em: new Date(t + 6 * D).toISOString(),
      status: "pendente",
      token: "cnv_exemplo_convite_fernando",
      criado_por: diogo,
    },
    {
      id: "c0000000-0000-4000-8000-000000000102",
      nome: "Priscila Martins",
      email: null,
      papel: "membro",
      departamentos: [{ departamento: "cobranca", papel_no_departamento: "gestor" }],
      criado_em: new Date(t - 6 * D).toISOString(),
      expira_em: new Date(t + 1 * D).toISOString(),
      status: "pendente",
      token: "cnv_exemplo_convite_priscila",
      criado_por: rodolfo,
    },
  ];
}

/** "expira em 6 dias" / "expira amanhã" / "expira em 3 horas" / "expirado". */
export function expiraEm(expiraIso: string, agora: Date): { texto: string; urgente: boolean } {
  const ms = new Date(expiraIso).getTime() - agora.getTime();
  if (ms <= 0) return { texto: "expirado", urgente: true };
  const horas = Math.floor(ms / H);
  if (horas < 24) return { texto: horas <= 1 ? "expira em 1 hora" : `expira em ${horas} horas`, urgente: true };
  const dias = Math.round(ms / D);
  if (dias <= 1) return { texto: "expira amanhã", urgente: true };
  return { texto: `expira em ${dias} dias`, urgente: dias <= 2 };
}

/** "há 6 min" · "há 2 h" · "há 3 dias" — o carimbo de último acesso. */
export function haQuantoTempo(iso: string | null, agora: Date): string {
  if (!iso) return "nunca entrou";
  const ms = agora.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

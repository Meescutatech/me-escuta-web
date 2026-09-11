import { PESSOAS, type PessoaEnsaio } from "../modo";

/**
 * CANAIS de ensaio — três números, os três do contrato D91 §1 (R1/R2):
 *  · `Kommo · Oficial` · WABA oficial, o número de PRODUÇÃO — "o número do Kommo", como o Diogo
 *                      fala dele. Pertence à empresa;
 *                      departamento de entrada = Pré-venda; nível `aberto` (todo mundo responde).
 *  · `lite:sara`     · WhatsApp Lite, número da Sara. Ela é a dona (`responsavel_id`), nível
 *                      `estrito` (só ela responde por ele).
 *  · `lite:ana-paula`· WhatsApp Lite, número da fono. Dona = Ana Paula, departamento Clínico.
 *
 * Vocabulário de status = o da `core.canal_whatsapp` + `config_jsonb.nivel` (0323/0331/0332).
 */

export type ProvedorCanal = "waba" | "nao_oficial";
export type NivelCanal = "estrito" | "responde_qualquer_um" | "aberto";
export type PareamentoCanal = "pareado" | "nao_pareado" | "expirado";

export interface CanalEnsaio {
  canal_id: string;
  apelido: string;
  numero_e164: string;
  provedor: ProvedorCanal;
  finalidade: "producao" | "teste";
  departamento: string;
  responsavel_id: string | null;
  nivel: NivelCanal;
  ativo: boolean;
  /** Só faz sentido em `nao_oficial` — no oficial é sempre `pareado` (a Meta cuida). */
  pareamento: PareamentoCanal;
  pareado_em: string | null;
  /** Volume dos últimos 7 dias — para a tabela não ser só configuração. */
  conversas_7d: number;
  ultima_mensagem_em: string | null;
}

const H = 3_600_000;

export function gerarCanaisEnsaio(agora: Date = new Date()): CanalEnsaio[] {
  const t = agora.getTime();
  return [
    {
      canal_id: "waba:1067455192551392",
      apelido: "Kommo · Oficial",
      numero_e164: "+5531999080271",
      provedor: "waba",
      finalidade: "producao",
      departamento: "pre_venda",
      responsavel_id: null,
      nivel: "aberto",
      ativo: true,
      pareamento: "pareado",
      pareado_em: new Date(t - 62 * 24 * H).toISOString(),
      conversas_7d: 143,
      ultima_mensagem_em: new Date(t - 4 * 60_000).toISOString(),
    },
    {
      canal_id: "lite:sara",
      apelido: "Sara · comercial",
      numero_e164: "+5531988427150",
      provedor: "nao_oficial",
      finalidade: "producao",
      departamento: "pre_venda",
      responsavel_id: PESSOAS.find((p) => p.chave === "sara")!.id,
      nivel: "estrito",
      ativo: true,
      pareamento: "pareado",
      pareado_em: new Date(t - 9 * 24 * H).toISOString(),
      conversas_7d: 38,
      ultima_mensagem_em: new Date(t - 23 * 60_000).toISOString(),
    },
    {
      canal_id: "lite:ana-paula",
      apelido: "Ana Paula · fono",
      numero_e164: "+5531997310094",
      provedor: "nao_oficial",
      finalidade: "producao",
      departamento: "clinico",
      responsavel_id: PESSOAS.find((p) => p.chave === "fono")!.id,
      nivel: "estrito",
      ativo: true,
      pareamento: "pareado",
      pareado_em: new Date(t - 2 * 24 * H).toISOString(),
      conversas_7d: 11,
      ultima_mensagem_em: new Date(t - 3 * H).toISOString(),
    },
  ];
}

/** "+55 31 99908-0271" — o número como uma pessoa lê. */
export function formatarE164(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.startsWith("55") && d.length === 12) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.startsWith("1") && d.length === 11) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164;
}

/**
 * R2/R4 do contrato · QUAIS canais esta pessoa pode usar para ENVIAR, e qual vem pré-selecionado.
 *  1. admin/owner: todos os ativos, produção primeiro;
 *  2. membro: os ativos dos departamentos em que está lotada (e dos ancestrais/descendentes via
 *     `pre_venda` ⊂ `comercial`) + o canal de que é dona. Produção pré-selecionado quando alcançável;
 *     senão o próprio.
 * Sem lotação (fail-open do contrato): tudo, menos `clinico`.
 */
export function canaisDeEnvio(
  pessoa: PessoaEnsaio,
  canais: CanalEnsaio[],
): { canais: CanalEnsaio[]; padrao: CanalEnsaio | null } {
  const ativos = canais.filter((c) => c.ativo);
  let lista: CanalEnsaio[];
  if (pessoa.papel === "owner" || pessoa.papel === "admin") {
    lista = ativos;
  } else if (pessoa.departamentos.length === 0) {
    lista = ativos.filter((c) => c.departamento !== "clinico");
  } else {
    const lotada = new Set(pessoa.departamentos.map((d) => d.departamento));
    lista = ativos.filter(
      (c) =>
        c.responsavel_id === pessoa.id ||
        lotada.has(c.departamento) ||
        // `estrito` de outra pessoa nunca entra, mesmo no mesmo departamento (R1)
        (c.nivel !== "estrito" && lotada.has(c.departamento)),
    );
    lista = lista.filter((c) => c.nivel !== "estrito" || c.responsavel_id === pessoa.id);
  }
  const ordem = (c: CanalEnsaio) => (c.finalidade === "producao" && c.provedor === "waba" ? 0 : c.responsavel_id === pessoa.id ? 1 : 2);
  lista = [...lista].sort((a, b) => ordem(a) - ordem(b));
  const padrao =
    lista.find((c) => c.finalidade === "producao" && c.provedor === "waba") ??
    lista.find((c) => c.responsavel_id === pessoa.id) ??
    null;
  return { canais: lista, padrao };
}

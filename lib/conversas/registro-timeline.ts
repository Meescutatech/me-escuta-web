import type { BlocoDia, GrupoBolhas } from "@/lib/conversas/thread";
import type { AnotacaoLead, MencaoLead, TarefaLead } from "@/lib/dados/lead-painel";
import type { Mencionavel, TipoMencionavel } from "@/lib/conversas/mencao";

/**
 * REGISTRO INTERNO na timeline da conversa (Rodada 13 / Bloco C — C2).
 * Mockup composer-comandos-v3.html, estado (f): nota e tarefa aparecem no mesmo fio
 * cronológico das mensagens, mas em LARGURA TOTAL e sem bolha. A bolha é reservada ao que
 * trafega com o cliente — a forma já diz de que lado a coisa está, antes da cor.
 */

export interface RegistroInterno {
  id: string;
  tipo: "nota" | "tarefa";
  texto: string;
  /** nome legível de quem escreveu; null quando só há artefato técnico. */
  autor: string | null;
  /** só tarefa: para quem ficou. */
  responsavel: string | null;
  prazo: string | null;
  criado_em: string;
  /** rótulos das menções resolvidas (via core.mencao) — base do destaque na leitura. */
  mencoes: { rotulo: string; tipo: TipoMencionavel }[];
}

function nomeDe(id: string | null, porId: Map<string, Mencionavel>): string | null {
  if (!id) return null;
  return porId.get(id)?.nome ?? null;
}

function autorLegivel(bruto: string | null): string | null {
  const s = (bruto ?? "").trim();
  if (!s || /^(humano:|agente:|sistema$)/i.test(s)) return null;
  return s.includes("@") ? s.split("@")[0] : s;
}

/**
 * Monta os registros da conversa a partir das projeções do lead. As menções vêm de
 * `core.mencao` (Bloco B): é a entidade que diz QUEM foi mencionado. Sem ela, o texto é
 * exibido sem destaque — nunca reconstruímos menção por regex em cima de texto livre.
 */
export function montarRegistros(
  anotacoes: AnotacaoLead[],
  tarefas: TarefaLead[],
  mencoes: MencaoLead[],
  mencionaveis: Mencionavel[],
): RegistroInterno[] {
  const porId = new Map(mencionaveis.map((m) => [m.id, m]));
  const porOrigem = new Map<string, { rotulo: string; tipo: TipoMencionavel }[]>();
  for (const m of mencoes) {
    const alvo = porId.get(m.mencionado_id);
    if (!alvo) continue;
    const lista = porOrigem.get(m.origem_id) ?? [];
    lista.push({ rotulo: `@${alvo.nome}`, tipo: alvo.tipo });
    porOrigem.set(m.origem_id, lista);
  }

  const registros: RegistroInterno[] = [];

  for (const a of anotacoes) {
    registros.push({
      id: a.id,
      tipo: "nota",
      texto: a.texto,
      autor: nomeDe(a.autor_id, porId) ?? autorLegivel(a.autor),
      responsavel: null,
      prazo: null,
      criado_em: a.criado_em,
      mencoes: porOrigem.get(a.id) ?? [],
    });
  }

  for (const t of tarefas) {
    registros.push({
      id: t.id,
      tipo: "tarefa",
      texto: t.titulo,
      autor: null,
      responsavel: nomeDe(t.responsavel_id, porId) ?? autorLegivel(t.responsavel),
      prazo: t.prazo,
      criado_em: t.criado_em,
      mencoes: porOrigem.get(t.id) ?? [],
    });
  }

  return registros.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export type ItemTimeline =
  | { tipo: "grupo"; grupo: GrupoBolhas; quando: string }
  | { tipo: "registro"; registro: RegistroInterno; quando: string };

/**
 * Intercala os registros do dia entre os grupos de bolhas, por horário. Registro fora dos dias
 * que têm mensagem não aparece aqui — ele continua visível na aba Tarefas e notas do painel.
 */
export function itensDoDia(bloco: BlocoDia, registros: RegistroInterno[]): ItemTimeline[] {
  const doDia = registros.filter((r) =>
    bloco.grupos.some((g) => g.itens.some((m) => mesmoDia(m.criado_em, r.criado_em))),
  );
  const itens: ItemTimeline[] = [
    ...bloco.grupos.map((grupo) => ({
      tipo: "grupo" as const,
      grupo,
      quando: grupo.itens[0]?.criado_em ?? "",
    })),
    ...doDia.map((registro) => ({ tipo: "registro" as const, registro, quando: registro.criado_em })),
  ];
  return itens.sort((a, b) => a.quando.localeCompare(b.quando));
}

function mesmoDia(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

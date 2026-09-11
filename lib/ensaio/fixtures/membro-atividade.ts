import type { MembroEnsaio } from "./membros";

/**
 * ATIVIDADE de um membro (ensaio) — o que a pessoa fez no sistema, o que fez COM IA e a história
 * do papel/departamento dela. Tudo derivado do ledger em produção; aqui, gerado por pessoa a
 * partir de um molde determinístico (mesma pessoa, mesma timeline em duas aberturas).
 */

export type TipoAtividade =
  | "mensagem_enviada"
  | "etapa_alterada"
  | "tarefa_criada"
  | "tarefa_concluida"
  | "convite_criado"
  | "canal_ativado"
  | "canal_pareado"
  | "conversa_assumida"
  | "config_publicada"
  | "anotacao_criada";

export interface Atividade {
  id: string;
  tipo: TipoAtividade;
  em: string;
  texto: string;
  /** para onde a linha leva (conversa, lead, tarefa) */
  href?: string;
}

export type TipoComIa = "pergunta_jarvis" | "proposta_aceita" | "proposta_ajustada" | "proposta_descartada" | "tarefa_do_jarvis" | "sugestao_clara_aprovada";

export interface ComIa {
  id: string;
  tipo: TipoComIa;
  em: string;
  agente: "jarvis" | "clara";
  texto: string;
  detalhe?: string;
}

export interface HistoricoPapel {
  em: string;
  texto: string;
  por: string;
}

export interface AtividadeMembro {
  atividades: Atividade[];
  comIa: ComIa[];
  historico: HistoricoPapel[];
  resumo7d: { rotulo: string; valor: string }[];
}

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEADS = ["Maria Aparecida", "José Carlos", "Antônia Ribeiro", "Waldemar Costa", "Neusa Maria", "Sebastião Lima", "Camila Andrade", "Conceição Barbosa", "Irene Salgado", "Benedito Rocha"];
const PACIENTES = ["Geraldo Nunes", "Terezinha Alves", "Ivone Castro", "Rosângela Pinto", "Luzia Campos"];

export function gerarAtividadeMembro(m: MembroEnsaio, agora: Date = new Date()): AtividadeMembro {
  const t = agora.getTime();
  const semente = parseInt(m.id.slice(-4), 16) || 7;
  const rnd = prng(semente);
  const escolher = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const atividades: Atividade[] = [];
  const comIa: ComIa[] = [];
  let n = 0;
  const id = () => `${m.id.slice(0, 8)}-${String(++n).padStart(6, "0")}`;

  const fono = m.departamentos.some((d) => d.departamento === "clinico");
  const gestao = m.papel === "owner" || m.papel === "admin";
  const nomes = fono ? PACIENTES : LEADS;
  const dias = m.papel === "marketing" ? 0 : 6;

  for (let d = 0; d < dias; d++) {
    const base = t - d * D;
    const fds = new Date(base).getDay() === 0 || new Date(base).getDay() === 6;
    const qtdMsg = fds ? 0 : gestao ? 2 + Math.floor(rnd() * 3) : 6 + Math.floor(rnd() * 8);
    for (let i = 0; i < qtdMsg; i++) {
      const quem = escolher(nomes);
      atividades.push({ id: id(), tipo: "mensagem_enviada", em: new Date(base - (1 + rnd() * 9) * H).toISOString(), texto: `Respondeu ${quem}`, href: "/conversas" });
    }
    if (!fds && !gestao) {
      const movidos = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < movidos; i++) {
        const quem = escolher(nomes);
        atividades.push({ id: id(), tipo: "etapa_alterada", em: new Date(base - (2 + rnd() * 8) * H).toISOString(), texto: fono ? `Registrou retorno de ${quem}` : `Moveu ${quem} para ${escolher(["Qualificando", "Avaliação auditiva", "Proposta enviada", "Negociação"])}`, href: "/funil" });
      }
      if (rnd() < 0.7) atividades.push({ id: id(), tipo: "tarefa_concluida", em: new Date(base - (3 + rnd() * 6) * H).toISOString(), texto: `Concluiu: ${escolher(["Confirmar audiometria", "Ligar para agendar", "Cobrar retorno da simulação", "Enviar orientação por áudio"])} · ${escolher(nomes)}`, href: "/tarefas" });
      if (rnd() < 0.4) atividades.push({ id: id(), tipo: "tarefa_criada", em: new Date(base - (4 + rnd() * 5) * H).toISOString(), texto: `Criou tarefa: ${escolher(["Reenviar proposta", "Confirmar presença", "Verificar rastreio"])} · ${escolher(nomes)}`, href: "/tarefas" });
      if (rnd() < 0.5) atividades.push({ id: id(), tipo: "conversa_assumida", em: new Date(base - (1 + rnd() * 9) * H).toISOString(), texto: `Assumiu a conversa de ${escolher(nomes)} da Clara`, href: "/conversas" });
      if (rnd() < 0.3) atividades.push({ id: id(), tipo: "anotacao_criada", em: new Date(base - (2 + rnd() * 7) * H).toISOString(), texto: `Anotou em ${escolher(nomes)}: "${escolher(["filha decide", "prefere tarde", "já usou aparelho da Caixa", "medo de apito"])}"` });
    }
    if (gestao && !fds) {
      if (rnd() < 0.5) atividades.push({ id: id(), tipo: "config_publicada", em: new Date(base - (2 + rnd() * 7) * H).toISOString(), texto: `Publicou ${escolher(["sla_etapas", "tipo_tarefa", "funil_vendas", "clara.prompt v7"])}`, href: "/configuracoes/avancado" });
      if (rnd() < 0.3) atividades.push({ id: id(), tipo: "convite_criado", em: new Date(base - (3 + rnd() * 5) * H).toISOString(), texto: `Convidou ${escolher(["Fernando Lopes (marketing)", "Priscila Martins (gestora de Cobrança)"])}`, href: "/configuracoes/membros" });
    }
  }
  if (m.departamentos.length > 0 && !gestao) {
    atividades.push({ id: id(), tipo: "canal_ativado", em: new Date(t - (fono ? 2 : 9) * D - 3 * H).toISOString(), texto: `Ligou o número ${fono ? "Ana Paula · fono" : "Sara · comercial"}`, href: "/configuracoes/canais" });
    atividades.push({ id: id(), tipo: "canal_pareado", em: new Date(t - (fono ? 2 : 9) * D - 3.2 * H).toISOString(), texto: "Pareou o celular por QR", href: "/configuracoes/canais" });
  }

  // com IA
  if (!fono && m.papel !== "marketing") {
    for (let d = 0; d < 5; d++) {
      const base = t - d * D;
      const q = gestao ? 1 : 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < q; i++) {
        const quem = escolher(nomes);
        const tipo = escolher<TipoComIa>(["tarefa_do_jarvis", "tarefa_do_jarvis", "proposta_aceita", "proposta_ajustada", "proposta_descartada", "pergunta_jarvis"]);
        const em = new Date(base - (1 + rnd() * 9) * H).toISOString();
        if (tipo === "pergunta_jarvis")
          comIa.push({ id: id(), tipo, em, agente: "jarvis", texto: escolher(["Quem está sem resposta há mais de 2 h?", "Quais leads em Proposta não falam há 3 dias?", "Resume a semana da Pré-venda"]), detalhe: "respondido em 4 s" });
        else if (tipo === "tarefa_do_jarvis")
          comIa.push({ id: id(), tipo, em, agente: "jarvis", texto: `Jarvis criou para você: ${escolher(["Ligar para agendar a audiometria", "Responder dúvida sobre o teste", "Confirmar presença amanhã"])} · ${quem}`, detalhe: escolher(["concluída no prazo", "concluída atrasada", "aberta"]) });
        else
          comIa.push({ id: id(), tipo, em, agente: "jarvis", texto: `Proposta do Jarvis em ${quem}: ${escolher(["Retomar contato e oferecer dois horários", "Cobrar retorno da simulação", "Reenviar o guia do teste"])}`, detalhe: tipo === "proposta_aceita" ? "aceita como veio" : tipo === "proposta_ajustada" ? "ajustou prazo para amanhã" : "descartada: já resolvido por telefone" });
      }
      if (!gestao && rnd() < 0.5) comIa.push({ id: id(), tipo: "sugestao_clara_aprovada", em: new Date(base - (2 + rnd() * 8) * H).toISOString(), agente: "clara", texto: `Aprovou sugestão da Clara para ${escolher(nomes)}`, detalhe: escolher(["sem editar", "editou o texto"]) });
    }
  }

  const historico: HistoricoPapel[] = [];
  if (m.papel === "owner") historico.push({ em: m.criado_em, texto: "Criou o workspace como proprietário", por: "sistema" });
  else {
    historico.push({ em: m.criado_em, texto: `Entrou por convite como ${m.papel === "admin" ? "admin" : m.papel === "marketing" ? "marketing" : "membro"}`, por: "Diogo Tambasco" });
    for (const v of m.departamentos) {
      historico.push({ em: new Date(new Date(m.criado_em).getTime() + 5 * MIN).toISOString(), texto: `Lotado em ${v.departamento === "pre_venda" ? "Pré-venda" : v.departamento === "clinico" ? "Clínico" : v.departamento}${v.papel_no_departamento === "gestor" ? " como gestora" : ""}`, por: "convite" });
    }
  }

  atividades.sort((a, b) => b.em.localeCompare(a.em));
  comIa.sort((a, b) => b.em.localeCompare(a.em));
  historico.sort((a, b) => b.em.localeCompare(a.em));

  const ult7 = (xs: { em: string }[]) => xs.filter((x) => t - new Date(x.em).getTime() < 7 * D).length;
  const resumo7d = [
    { rotulo: "mensagens", valor: String(atividades.filter((a) => a.tipo === "mensagem_enviada" && t - new Date(a.em).getTime() < 7 * D).length) },
    { rotulo: "tarefas concluídas", valor: String(atividades.filter((a) => a.tipo === "tarefa_concluida" && t - new Date(a.em).getTime() < 7 * D).length) },
    { rotulo: "com IA", valor: String(ult7(comIa)) },
  ];

  return { atividades, comIa, historico, resumo7d };
}

/** Agrupa por dia ("hoje", "ontem", "seg 08/09") mantendo a ordem decrescente. */
export function agruparPorDia<T extends { em: string }>(itens: T[], agora: Date): Array<{ dia: string; itens: T[] }> {
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const grupos = new Map<string, T[]>();
  for (const it of itens) {
    const d = new Date(it.em);
    const dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dif = Math.round((hoje0 - dia0) / 86_400_000);
    const rotulo = dif === 0 ? "hoje" : dif === 1 ? "ontem" : d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    if (!grupos.has(rotulo)) grupos.set(rotulo, []);
    grupos.get(rotulo)!.push(it);
  }
  return Array.from(grupos.entries()).map(([dia, itens]) => ({ dia, itens }));
}

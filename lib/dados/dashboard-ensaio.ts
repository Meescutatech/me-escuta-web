import type {
  Ator,
  LinhaAtorDia,
  LinhaConversaAtor,
  LinhaDia,
  LinhaEtapaDia,
  LinhaFunil,
  LinhaPrimeiraResposta,
} from "./dashboard-ceo-calculos";

/**
 * FIXTURE DE ENSAIO do Dashboard do CEO — só com `NEXT_PUBLIC_DASHBOARD_ENSAIO=1`, NUNCA por
 * padrão. Gera as LINHAS CRUAS das views `api.v_dashboard_*` e deixa toda a agregação com o
 * código real (`dashboard-ceo-calculos.ts`): o design vê a tela verdadeira, só o banco é
 * substituído. Nada é escrito em lugar nenhum.
 *
 * Determinística (PRNG com semente fixa): a mesma tela em duas aberturas, com 190 dias de
 * história, fim de semana mais fraco, Clara carregando o grosso do atendimento e a Sarah os
 * transbordos — os contrastes que o CEO precisa enxergar.
 */

export function ensaioDashboardLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_DASHBOARD_ENSAIO === "1";
}

const DIAS = 190;

export const ATORES_ENSAIO: Ator[] = [
  { ator: "agente:clara", tipo: "agente", nome: "Clara", ativo: true },
  { ator: "agente:jarvis", tipo: "agente", nome: "Jarvis", ativo: true },
  { ator: "humano:sarah", tipo: "humano", nome: "Sarah", ativo: true },
  { ator: "humano:diogo", tipo: "humano", nome: "Diogo", ativo: true },
];

const ETAPAS: Array<Pick<LinhaFunil, "etapa" | "nome" | "tipo" | "ordem"> & { peso: number }> = [
  { etapa: "incoming_leads", nome: "Entrada", tipo: "aberto", ordem: 10, peso: 26 },
  { etapa: "interessado", nome: "Interessado", tipo: "aberto", ordem: 20, peso: 18 },
  { etapa: "qualificado", nome: "Qualificado", tipo: "aberto", ordem: 30, peso: 12 },
  { etapa: "audiometria_agendada", nome: "Audiometria agendada", tipo: "aberto", ordem: 40, peso: 7 },
  { etapa: "audiometria_realizada", nome: "Audiometria realizada", tipo: "aberto", ordem: 50, peso: 6 },
  { etapa: "consulta_realizada", nome: "Consulta realizada", tipo: "aberto", ordem: 60, peso: 4 },
  { etapa: "teste_aparelho", nome: "Teste do aparelho", tipo: "aberto", ordem: 70, peso: 3 },
  { etapa: "ganho", nome: "Venda ganha", tipo: "ganho", ordem: 10000, peso: 2 },
  { etapa: "perdido", nome: "Venda perdida", tipo: "perdido", ordem: 11000, peso: 5 },
];

/** PRNG determinístico (mulberry32) — Math.random aqui quebraria a comparação entre aberturas. */
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

export interface EnsaioDashboard {
  atores: Ator[];
  atorDia: LinhaAtorDia[];
  primeira: LinhaPrimeiraResposta[];
  dias: LinhaDia[];
  etapaDia: LinhaEtapaDia[];
  funil: LinhaFunil[];
  conversaAtor: LinhaConversaAtor[];
}

export function gerarEnsaioDashboard(agora: Date = new Date(), semente = 41): EnsaioDashboard {
  const rnd = prng(semente);
  const dias: LinhaDia[] = [];
  const atorDia: LinhaAtorDia[] = [];
  const primeira: LinhaPrimeiraResposta[] = [];
  const etapaDia: LinhaEtapaDia[] = [];
  const conversaAtor: LinhaConversaAtor[] = [];

  let nConversa = 0;
  for (let d = DIAS - 1; d >= 0; d--) {
    const data = new Date(agora.getTime() - d * 86_400_000);
    const dia = data.toISOString().slice(0, 10);
    const fds = data.getUTCDay() === 0 || data.getUTCDay() === 6 ? 0.35 : 1;
    // rampa: a operação cresce ao longo dos 190 dias
    const rampa = 0.6 + (0.4 * (DIAS - d)) / DIAS;
    const leadsNovos = Math.round((4 + rnd() * 9) * fds * rampa);
    const recebidas = Math.round(leadsNovos * (4 + rnd() * 3));
    const enviadas = Math.round(recebidas * (0.9 + rnd() * 0.3));

    dias.push({
      dia,
      leads_novos: leadsNovos,
      mensagens_recebidas: recebidas,
      mensagens_enviadas: enviadas,
      conversas_com_entrada: Math.round(leadsNovos * 1.6),
      conversas_novas: leadsNovos,
    });

    // Clara atende o grosso; Sarah pega transbordo; Jarvis cria tarefas; Diogo pontual.
    const conversasClara = Math.round(leadsNovos * 1.2);
    const transbordos = Math.round(conversasClara * 0.25);
    const porAtor: Array<[string, Partial<LinhaAtorDia>]> = [
      ["agente:clara", { mensagens_enviadas: Math.round(enviadas * 0.62), conversas_atendidas: conversasClara, tarefas_criadas: Math.round(rnd() * 2), tarefas_concluidas: 0, leads_movidos: Math.round(conversasClara * 0.5), transbordos_recebidos: 0, devolucoes: Math.round(transbordos * 0.3) }],
      ["agente:jarvis", { mensagens_enviadas: 0, conversas_atendidas: 0, tarefas_criadas: Math.round((3 + rnd() * 5) * fds * rampa), tarefas_concluidas: 0, leads_movidos: 0, transbordos_recebidos: 0, devolucoes: 0 }],
      ["humano:sarah", { mensagens_enviadas: Math.round(enviadas * 0.3), conversas_atendidas: transbordos, tarefas_criadas: Math.round(rnd() * 3), tarefas_concluidas: Math.round((4 + rnd() * 6) * fds), leads_movidos: Math.round(transbordos * 0.8), transbordos_recebidos: transbordos, devolucoes: 0 }],
      ["humano:diogo", { mensagens_enviadas: Math.round(enviadas * 0.05), conversas_atendidas: Math.round(rnd() * 2), tarefas_criadas: 0, tarefas_concluidas: Math.round(rnd() * 2), leads_movidos: 0, transbordos_recebidos: 0, devolucoes: 0 }],
    ];
    for (const [ator, v] of porAtor) {
      if ((v.mensagens_enviadas ?? 0) + (v.conversas_atendidas ?? 0) + (v.tarefas_criadas ?? 0) + (v.tarefas_concluidas ?? 0) === 0) continue;
      atorDia.push({ dia, ator, mensagens_enviadas: 0, conversas_atendidas: 0, transbordos_recebidos: 0, devolucoes: 0, tarefas_criadas: 0, tarefas_concluidas: 0, leads_movidos: 0, ...v });
    }

    // 1ª resposta: Clara em minutos; Sarah quando transborda; algumas sem resposta (null)
    for (let c = 0; c < conversasClara; c++) {
      nConversa++;
      const id = `c0nv0000-0000-4000-8000-${String(nConversa).padStart(12, "0")}`;
      const daSarah = rnd() < 0.2;
      const semResposta = rnd() < 0.07;
      primeira.push({
        conversa_id: id,
        dia,
        respondida_por: semResposta ? null : daSarah ? "humano:sarah" : "agente:clara",
        minutos: semResposta ? null : daSarah ? Math.round(20 + rnd() * 180) : Math.round(1 + rnd() * 6),
      });
      if (!semResposta) {
        conversaAtor.push({ conversa_id: id, ator: daSarah ? "humano:sarah" : "agente:clara", ator_tipo: daSarah ? "humano" : "agente", ator_id: null, primeiro_dia: dia, ultimo_dia: dia, mensagens: Math.round(2 + rnd() * 10) });
      }
    }

    for (const e of ETAPAS.filter((x) => x.tipo === "aberto").slice(0, 5)) {
      const entradas = Math.round((e.peso / 8) * fds * rampa * (0.5 + rnd()));
      if (entradas > 0) {
        etapaDia.push({ dia, etapa: e.etapa, ator: rnd() < 0.6 ? "agente:clara" : "humano:sarah", entradas, leads_distintos: entradas });
      }
    }
  }

  const funil: LinhaFunil[] = ETAPAS.map((e) => {
    const leads = Math.round(e.peso * (5 + rnd() * 2));
    const comValor = e.ordem >= 50 ? Math.round(leads * 0.7) : Math.round(leads * 0.15);
    return { etapa: e.etapa, nome: e.nome, tipo: e.tipo, ordem: e.ordem, fora_do_board: e.tipo !== "aberto", leads, leads_com_valor: comValor, valor: comValor * (8500 + Math.round(rnd() * 4) * 750) };
  });

  return { atores: ATORES_ENSAIO, atorDia, primeira, dias, etapaDia, funil, conversaAtor };
}

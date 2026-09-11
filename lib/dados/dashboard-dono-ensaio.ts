import { gerarCanaisEnsaio, formatarE164 } from "@/lib/ensaio/fixtures/canais";
import { gerarConversasEnsaio, gerarFunilEnsaio } from "@/lib/ensaio/fixtures/conversas";
import { visaoTarefasDeEnsaio } from "./tarefas-ensaio";
import { ymdEmSaoPaulo } from "./dashboard-calculos.ts";
import { fmtMinutos, noAnterior, noAtual, type Janela, type LinhaAtorDia, type LinhaEtapaDia, type LinhaPrimeiraResposta } from "./dashboard-ceo-calculos.ts";
import {
  atencaoCanais,
  atencaoLeadsParados,
  atencaoPropostasJarvis,
  atencaoSemResposta,
  atencaoTarefasVencidas,
  heatmapVazio,
  ordenarAtencao,
  primeiraRespostaPorCanal,
  PERGUNTAS_PADRAO,
  type Atencao,
  type Heatmap,
  type JarvisDiz,
  type LinhaCanal,
  type MetaMes,
  type ObservacaoJarvisDono,
} from "./dashboard-dono-calculos.ts";
import type { EnsaioDashboard } from "./dashboard-ensaio";

/**
 * FIXTURE DE ENSAIO dos blocos NOVOS do dashboard do dono (W-D4, 10/09/2026) — só com
 * `NEXT_PUBLIC_DASHBOARD_ENSAIO=1`, nunca por padrão. Arquivo novo de propósito: a fixture que já
 * existia (`dashboard-ensaio.ts`) gera as linhas cruas das views; esta gera o que as views AINDA
 * NÃO TÊM (canais, heatmap por hora, meta do mês, tempo por etapa, o texto do Jarvis) e monta a
 * lista de atenção a partir das OUTRAS fixtures do ensaio — conversas, tarefas e funil — para o
 * número que o dono lê aqui ser o mesmo que ele encontra ao clicar.
 */

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

// ─────────────── canais ───────────────

export function canaisDeEnsaio(en: EnsaioDashboard, j: Janela, agora: Date): LinhaCanal[] {
  const canais = gerarCanaisEnsaio(agora);
  const { conversas } = gerarConversasEnsaio(agora);
  const medianas = primeiraRespostaPorCanal(en.primeira, en.conversaCanal, j);

  const conta = (canal: string, pred: (d: string) => boolean, soRespondidas: boolean) => {
    let n = 0;
    for (const p of en.primeira) {
      if (en.conversaCanal.get(p.conversa_id) !== canal || !pred(p.dia)) continue;
      if (soRespondidas && p.minutos == null) continue;
      n++;
    }
    return n;
  };

  return canais.map((c) => {
    const abertas = conversas.filter((x) => x.phone_number_id === c.canal_id && x.status !== "fechada");
    return {
      canal_id: c.canal_id,
      apelido: c.apelido,
      numero: formatarE164(c.numero_e164),
      provedor: c.provedor,
      departamento: c.departamento,
      ativo: c.ativo,
      conectado: c.provedor === "waba" ? c.ativo : c.pareamento === "pareado",
      recebidas: { atual: conta(c.canal_id, (d) => noAtual(d, j), false), anterior: conta(c.canal_id, (d) => noAnterior(d, j), false) },
      respondidas: { atual: conta(c.canal_id, (d) => noAtual(d, j), true), anterior: conta(c.canal_id, (d) => noAnterior(d, j), true) },
      semResposta: abertas.filter((x) => x.nao_lida).length,
      primeiraRespostaMin: medianas.get(c.canal_id) ?? null,
      conversasAbertas: abertas.length,
    };
  });
}

// ─────────────── heatmap hora × dia ───────────────

/** Forma de operação comercial: picos 9-11h e 14-17h em dia útil, fim de semana fraco, madrugada zero. */
export function heatmapDeEnsaio(semente = 7): Heatmap {
  const rnd = prng(semente);
  const h = heatmapVazio();
  for (let dow = 0; dow < 7; dow++) {
    const util = dow >= 1 && dow <= 5;
    for (let hora = 0; hora < 24; hora++) {
      let base = 0;
      if (hora >= 8 && hora <= 20) {
        const manha = Math.exp(-((hora - 10) ** 2) / 4);
        const tarde = Math.exp(-((hora - 15.5) ** 2) / 6);
        base = (manha * 1.0 + tarde * 0.8) * (util ? 14 : dow === 6 ? 5 : 2);
      } else if (hora >= 6 && hora < 8) base = util ? 2 : 0.5;
      else if (hora > 20 && hora <= 22) base = util ? 3 : 1.5;
      h[dow][hora] = Math.round(base * (0.7 + rnd() * 0.6));
    }
  }
  return h;
}

// ─────────────── meta do mês ───────────────

export function metaDeEnsaio(etapaDia: LinhaEtapaDia[], agora: Date): MetaMes {
  const hoje = ymdEmSaoPaulo(agora);
  const mes = hoje.slice(0, 7);
  const [ano, m] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const vendas = etapaDia.filter((l) => l.etapa === "ganho" && l.dia.startsWith(mes)).reduce((s, l) => s + l.entradas, 0);
  return { mes, metaVendas: 20, vendas, metaValor: 240_000, valor: vendas * 11_600, diasCorridos: Number(hoje.slice(8, 10)), diasNoMes };
}

/** Dias médios que um lead fica em cada etapa (o que a view `v_dashboard_etapa_dia` ainda não mede). */
export const TEMPO_ETAPA_ENSAIO: Record<string, number> = {
  incoming_leads: 0.4,
  interessado: 1.8,
  qualificado: 3.1,
  audiometria_agendada: 4.6,
  audiometria_realizada: 2.2,
  consulta_realizada: 5.9,
  teste_aparelho: 7.4,
};

// ─────────────── atenção ───────────────

export function atencaoDeEnsaio(canais: LinhaCanal[], agora: Date): Atencao {
  const agoraMs = agora.getTime();
  const { conversas } = gerarConversasEnsaio(agora);
  const { tarefas } = visaoTarefasDeEnsaio(agora);
  const funil = gerarFunilEnsaio(agora);
  const itens = ordenarAtencao([
    atencaoSemResposta(conversas, agoraMs),
    atencaoTarefasVencidas(tarefas),
    atencaoLeadsParados(funil.cards, funil.sla, agoraMs),
    atencaoCanais(canais),
    atencaoPropostasJarvis(4, [
      { nome: "Clara", n: 3 },
      { nome: "Jarvis", n: 1 },
    ]),
  ]);
  return { itens, indisponiveis: [] };
}

// ─────────────── Jarvis diz ───────────────

/**
 * O que o Jarvis diz, escrito A PARTIR dos números da tela — nunca o contrário. A FRASE é o item
 * mais grave da lista de atenção em uma sentença; as OBSERVAÇÕES são o que a lista de atenção NÃO
 * diz (a leitura do dia, a meta, o que ele mesmo fez) — os dois blocos convivem lado a lado, então
 * repetir aqui o que está ali seria ruído. Em produção quem escreve é o Jarvis (F9) com a mesma
 * leitura; este é o gabarito do que se espera dele.
 */
export function jarvisDizDeEnsaio(
  en: EnsaioDashboard,
  j: Janela,
  atencao: Atencao,
  agora: Date,
  atendimento: { fracaoAgente: number | null; primeiraResposta: { agenteMin: number | null; humanoMin: number | null } },
  meta: MetaMes,
): JarvisDiz {
  const hoje = ymdEmSaoPaulo(agora);
  const leadsHoje = en.dias.find((d) => d.dia === hoje)?.leads_novos ?? 0;
  const diasJanela = en.dias.filter((d) => noAtual(d.dia, j));
  const mediaLeads = diasJanela.length ? diasJanela.reduce((s, d) => s + d.leads_novos, 0) / diasJanela.length : 0;
  const semResposta = atencao.itens.find((i) => i.tipo === "sem_resposta");
  const vencidas = atencao.itens.find((i) => i.tipo === "tarefas_vencidas");
  const jarvisHoje: LinhaAtorDia | undefined = en.atorDia.find((l) => l.dia === hoje && l.ator === "agente:jarvis");
  const criadas = jarvisHoje?.tarefas_criadas ?? 0;
  const aceitas = Math.max(0, criadas - 2);
  const ajustadas = criadas >= 2 ? 1 : 0;

  const partes: string[] = [];
  if (semResposta) partes.push(semResposta.titulo.replace(/^(\d+) conversas?/, (m) => m.toLowerCase()));
  if (vencidas && vencidas.quebra[0]) partes.push(`${vencidas.quebra[0].rotulo} tem ${vencidas.quebra[0].quantidade} ${vencidas.quebra[0].quantidade === 1 ? "tarefa vencida" : "tarefas vencidas"}`);
  const frase =
    partes.length > 0
      ? `${partes[0].charAt(0).toUpperCase()}${partes[0].slice(1)}${partes[1] ? `, e ${partes[1]}` : ""}.`
      : "Nada gritando agora: nenhuma conversa esperando, tarefa vencida ou lead estourado.";

  const dif = Math.round(leadsHoje - mediaLeads);
  const faltam = Math.max(0, meta.metaVendas - meta.vendas);
  const observacoes: ObservacaoJarvisDono[] = [
    {
      texto:
        leadsHoje === 0
          ? `Nenhum lead novo até agora hoje; a média dos últimos ${j.dias} dias é ${mediaLeads.toFixed(1).replace(".", ",")} por dia`
          : `Entraram ${leadsHoje} leads hoje, ${dif === 0 ? "na média" : `${Math.abs(dif)} ${dif > 0 ? "acima" : "abaixo"} da média`} dos últimos ${j.dias} dias`,
      href: "/funil",
      destino: "funil",
      origem: "consultar_dashboard",
      faixa: "HOJE",
    },
    {
      texto:
        atendimento.fracaoAgente == null
          ? "Nenhuma conversa respondida no período"
          : `A Clara respondeu ${Math.round(atendimento.fracaoAgente * 100)}% das conversas em ${fmtMinutos(atendimento.primeiraResposta.agenteMin)}; quando cai para uma pessoa, a primeira resposta sobe para ${fmtMinutos(atendimento.primeiraResposta.humanoMin)}`,
      href: "/?aba=equipe",
      destino: "equipe",
      origem: "consultar_dashboard",
      faixa: "NA SEMANA",
    },
    {
      texto:
        faltam === 0
          ? `A meta do mês (${meta.metaVendas} vendas) já foi batida; hoje ele criou ${criadas} ${criadas === 1 ? "tarefa" : "tarefas"} (${aceitas} aceitas, ${ajustadas} ajustadas)`
          : `Faltam ${faltam} vendas para a meta do mês em ${meta.diasNoMes - meta.diasCorridos} dias; hoje ele criou ${criadas} ${criadas === 1 ? "tarefa" : "tarefas"} (${aceitas} aceitas, ${ajustadas} ajustadas)`,
      href: "/tarefas?origem=jarvis",
      destino: "tarefas",
      origem: "consultar_tarefas",
      faixa: null,
    },
  ];

  return { frase, observacoes, perguntas: PERGUNTAS_PADRAO, geradoEm: new Date(agora.getTime() - 7 * 60_000).toISOString() };
}

// ─────────────── carga agora por pessoa ───────────────

/**
 * Conversas abertas por dono AGORA, da fixture de /conversas — a coluna "carga" da aba Equipe.
 * `dono_atual` na fixture é o e-mail; aqui vira a chave de ator das views (`humano:<chave>`).
 */
const DONO_PARA_ATOR: Record<string, string> = {
  "sara@meescuta.com": "humano:sara",
  "anapaula@meescuta.com": "humano:ana-paula",
  "tech@meescuta.com": "humano:diogo",
};

export function cargaAgoraDeEnsaio(agora: Date): Map<string, number> {
  const { conversas } = gerarConversasEnsaio(agora);
  const out = new Map<string, number>();
  for (const c of conversas) {
    if (c.status === "fechada") continue;
    const chave = c.mode === "IA" ? "agente:clara" : c.dono_atual ? DONO_PARA_ATOR[c.dono_atual] ?? null : null;
    if (!chave) continue;
    out.set(chave, (out.get(chave) ?? 0) + 1);
  }
  return out;
}


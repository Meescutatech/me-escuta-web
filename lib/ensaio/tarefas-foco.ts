import type { CardLead } from "@/lib/dados/funil";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { conversaIdDeEnsaio } from "@/lib/dados/tarefas-ensaio";
import { ETAPAS_PADRAO } from "@/lib/dados/funil-etapas";
import { resumoDerivado, type ResumoJarvis } from "@/lib/tarefas/resumo";
import type { SinaisDoLead } from "@/lib/tarefas/prioridade";
import { gerarConversasEnsaio, gerarLeadsEnsaio } from "./fixtures/conversas";

/**
 * O QUE O MODO FOCO E O TOGGLE DA TAREFA PRECISAM VER — fixture (W-T, 10/09 noite).
 *
 * Três coisas por tarefa, todas derivadas no ensaio do mesmo lead da fixture do funil
 * (`MOLDES_LEADS`, `lead_id = 1ead0000-…-<idx+1>`):
 *
 *   1. o RESUMO DO JARVIS (lib/tarefas/resumo.ts) — escrito à mão por lead, no formato que o
 *      worker vai gravar: situação · o que viu · o que fazer e por quê. Tarefa de humano também
 *      tem (o Jarvis é o Sistema), com a terceira parte citando quem pediu;
 *   2. o FIO do lead — as últimas mensagens, para a conversa ficar AO LADO da tarefa (R8: "não
 *      quero que você abra múltiplas telas"). Leads 0-14 já têm conversa na fixture de
 *      /conversas e é dela que o fio sai; os outros da fila do dia ganham aqui um fio curto,
 *      coerente com o que o resumo diz;
 *   3. a FICHA ESSENCIAL — cidade · etapa (há quanto tempo) · aparelho · próxima consulta ·
 *      quem atende. Cidade segue a MESMA fórmula da ficha completa do W-D3 (i % 4 / i % 7),
 *      para o foco e o painel do lead falarem da mesma pessoa.
 *
 * Determinística: prazos e "há N h" derivam de `agora`; textos são fixos. No real, 1 vem de
 * `tarefa_resumida` (worker), 2 de `core.v_mensagem` pelo `conversa_id` ancorado, 3 de
 * `v_lead_card` (+ colunas que ainda não existem: aparelho e próxima consulta).
 */

export interface MensagemFoco {
  id: string;
  de: "cliente" | "nos";
  /** quem falou por nós: "Clara", "Sara", "Ana Paula" — null no cliente */
  autor: string | null;
  corpo: string;
  em: string;
  /** "texto" | "audio" | "imagem" | "documento" … — o foco desenha texto; o resto vira rótulo */
  tipo: string;
}

export interface FichaEssencial {
  cidade: string | null;
  etapa_nome: string | null;
  na_etapa_desde: string | null;
  aparelho: string | null;
  proxima_consulta: { em: string; onde: string } | null;
  valor: number | null;
  telefone: string | null;
  atende: string | null;
  idade: number | null;
}

export interface ContextoFoco {
  lead_id: string;
  lead_nome: string;
  conversa_id: string | null;
  /** por onde a resposta sai: "Oficial" (WABA) ou "Lite · Sara" */
  canal: { rotulo: string; tipo: "oficial" | "lite" };
  fio: MensagemFoco[];
  ficha: FichaEssencial;
}

const MIN = 60_000;
const H = 60 * MIN;

function idxDoLead(leadId: string | null | undefined): number | null {
  if (!leadId) return null;
  const m = /^1ead0000-0000-4000-8000-(\d{12})$/.exec(leadId);
  return m ? Number(m[1]) - 1 : null;
}

function primeiroNome(nome: string | null): string | null {
  return nome ? nome.replace(/\s*\(.*\)\s*$/, "").split(/\s+/)[0] : null;
}

function nomeEtapa(chave: string): string {
  return ETAPAS_PADRAO.find((e) => e.chave === chave)?.nome ?? chave;
}

// ───────────────────────────── 1. resumos, por lead ─────────────────────────────

interface MoldeResumo {
  situacao: string;
  visto: string | null;
  sugestao: string;
  humano: boolean;
}

/** chave = primeiro nome do lead (é como a Sara chama) + título curto para desambiguar quando o lead tem mais de uma tarefa */
const RESUMOS: Record<string, MoldeResumo> = {
  Maria: {
    situacao: "Maria está em Qualificando há 26 h; a última mensagem foi dela, ontem à noite, e ninguém marcou o exame.",
    visto: "Ela disse que decide depois do exame — e o exame não está agendado.",
    sugestao: "Ligar e oferecer dois horários de audiometria nesta semana. Agora porque a tarefa venceu ontem e cada dia sem exame é um dia a mais parada em Qualificando.",
    humano: false,
  },
  José: {
    situacao: "José está em Avaliação auditiva há 3 dias e já usou aparelho. A última mensagem foi nossa, anteontem — ele não respondeu.",
    visto: "Ele ficou de mandar a simulação da Caixa; o gerente só responde na quinta.",
    sugestao: "Sara pediu: cobrar o retorno da simulação. Adiada duas vezes — se hoje não vier, vale propor a entrada menor em vez de esperar o banco.",
    humano: true,
  },
  Antônia: {
    situacao: "Antônia entrou pelo Meta há 1 h 30 e ainda está em Novo lead, sem dono. A última mensagem foi dela, ontem à noite.",
    visto: "Ela quer entender o teste em casa e tem medo de não se adaptar.",
    sugestao: "Explicar o teste de 7 dias e propor a teleconsulta. Agora porque a pergunta está sem resposta há 14 h, e lead do Meta que pergunta como funciona costuma decidir na primeira conversa.",
    humano: false,
  },
  Waldemar: {
    situacao: "Waldemar está em Avaliação auditiva há 2 dias, teleconsulta marcada para amanhã às 14h. A última mensagem foi nossa, ontem, com o link.",
    visto: null,
    sugestao: "Rodolfo pediu: confirmar presença. Ele tem 79 anos e veio por indicação — a filha costuma acompanhar; confirmar com ela também.",
    humano: true,
  },
  Neusa: {
    situacao: "Neusa está em Proposta enviada há 4 dias, R$ 15.200 parcelado. A última mensagem foi dela, ontem.",
    visto: "Pediu para explicar por áudio como se limpa o aparelho.",
    sugestao: "Sara pediu: enviar a orientação de uso por áudio. Ela lê pouco — áudio curto, uma coisa por vez.",
    humano: true,
  },
  Geraldo: {
    situacao: "Geraldo comprou há 10 dias; o aparelho foi postado anteontem pelos Correios. A última mensagem foi nossa, com o código de rastreio.",
    visto: null,
    sugestao: "Rodolfo pediu: verificar o rastreio. O código não atualiza há 2 dias — se travou em Belo Horizonte, abrir chamado no Melhor Envio.",
    humano: true,
  },
  Irene: {
    situacao: "Irene entrou pelo Meta há 4 h e está em Novo lead, sem dono. Sem mensagem registrada — ela só preencheu o formulário.",
    visto: null,
    sugestao: "Sara pediu: retomar em setembro, como a Irene pediu no formulário. Primeiro toque por template, pelo Oficial.",
    humano: true,
  },
  Cleusa: {
    situacao: "Cleusa está em Avaliação auditiva há 15 h, com a avaliação marcada para amanhã às 9h na AudioBH. A última mensagem foi dela, ontem à noite, sem resposta nossa.",
    visto: "Perguntou onde fica a clínica e se é perto do centro.",
    sugestao: "Enviar o endereço e o mapa e confirmar o horário. Agora porque ela não atendeu ontem à tarde e a consulta é amanhã cedo — sem o endereço hoje, a chance de falta sobe.",
    humano: false,
  },
  Manoel: {
    situacao: "Manoel está em Negociação há 8 h, proposta de R$ 15.200, análise de crédito com o Diogo Fonseca. A última mensagem foi dele, hoje de manhã.",
    visto: "Perguntou se dá para parcelar sem entrada.",
    sugestao: "Rodolfo passou para Sara: ligar sobre a análise de crédito. Ele espera resposta hoje — o Levindo devolveu faixa C, então dá para apresentar a condição autorizada na ligação.",
    humano: true,
  },
  Expedito: {
    situacao: "Expedito está em Proposta enviada há 18 h, R$ 21.000 (dois aparelhos, recarregável). A última mensagem foi dele, há 5 h, sem resposta nossa.",
    visto: "Quer saber quanto o recarregável fica a mais e se compensa.",
    sugestao: "Responder com a diferença de preço e oferecer o teste com o recarregável. Agora porque proposta de dois aparelhos parada mais de um dia esfria — e ele está perguntando, não sumindo.",
    humano: false,
  },
  Elza: {
    situacao: "Elza está em Qualificando há 2 dias e meio; a audiometria da semana passada não aconteceu. A última mensagem foi nossa, anteontem.",
    visto: null,
    sugestao: "Sara pediu: reagendar a audiometria. A clínica parceira tem horário quinta e sexta de manhã.",
    humano: true,
  },
  Iolanda: {
    situacao: "Iolanda está em Negociação há 2 dias, entrada de R$ 2.400 combinada. A última mensagem foi dela, ontem, dizendo que faria o Pix.",
    visto: "Disse que faria o Pix da entrada até sexta.",
    sugestao: "Sara pediu: confirmar o pagamento da entrada. Se o Pix não cair até amanhã ao meio-dia, o financeiro segura a nota.",
    humano: true,
  },
  Jorge: {
    situacao: "Jorge está em Avaliação auditiva há 6 dias, dois aparelhos, R$ 14.200 estimados. A última mensagem foi nossa, há 3 dias.",
    visto: null,
    sugestao: "Rodolfo pediu: enviar a proposta dos dois aparelhos. A fono já mandou a indicação bilateral.",
    humano: true,
  },
  Terezinha: {
    situacao: "Terezinha comprou há 17 dias; o retorno de 30 dias vence na semana que vem. A última mensagem foi dela, na semana passada, elogiando o aparelho.",
    visto: null,
    sugestao: "Ana Paula pediu: fazer o retorno de 30 dias. Perguntar da TV e do telefone, que eram o que ela queria voltar a ouvir.",
    humano: true,
  },
  Rosângela: {
    situacao: "Rosângela usa o aparelho há 3 semanas e pediu ajuste porque apita ao mastigar. A última mensagem foi dela, anteontem.",
    visto: "Diz que apita quando come e que abaixou o volume por conta própria.",
    sugestao: "Ana Paula pediu: ajuste fino. A tarefa venceu ontem — vale um áudio hoje explicando que o apito ao mastigar é ajuste de retorno, não defeito.",
    humano: true,
  },
  Sebastião: {
    situacao: "Sebastião está em Negociação há 30 h, dois aparelhos, R$ 18.600. A audiometria foi agendada na AudioBH e ele confirmou por áudio.",
    visto: null,
    sugestao: "Sara pediu: agendar a audiometria na clínica parceira. Feita — quinta às 14h.",
    humano: true,
  },
  Marlene: {
    situacao: "Marlene está em Perdido há 8 dias, motivo preço. O segundo número do cadastro atendeu.",
    visto: null,
    sugestao: "Sara pediu: ligar no segundo número. Atendeu e prefere WhatsApp — conversa retomada.",
    humano: true,
  },
  Osvaldo: {
    situacao: "Osvaldo comprou há 5 dias; o boleto da entrada venceu e ele renegociou direto com o financeiro.",
    visto: null,
    sugestao: "Rodolfo pediu: cobrar o boleto. Saiu da fila — o financeiro assumiu.",
    humano: true,
  },
};

/** o resumo da tarefa — à mão para os leads da fixture; derivado (honesto) para o resto */
export function resumoDeEnsaio(t: TarefaVisao, lead: CardLead | null, agora: Date): ResumoJarvis {
  const agoraMs = agora.getTime();
  const geradoEm = new Date(Math.min(agoraMs - 7 * MIN, new Date(t.criado_em).getTime() + 2 * MIN)).toISOString();
  if (!t.lead_id) {
    return {
      situacao: "Tarefa interna, sem lead.",
      visto: null,
      sugestao: "Rodolfo pediu: organizar os leads sem dono do funil. Hoje são 12 em Novo lead sem ninguém.",
      gerado_em: geradoEm,
      humano: true,
    };
  }
  const chave = primeiroNome(t.lead_nome) ?? "";
  const m = RESUMOS[chave];
  if (m) return { ...m, gerado_em: geradoEm };
  const criadoPor = t.historico?.[0]?.texto.replace(/^criada por\s+/i, "") ?? null;
  return resumoDerivado(
    t,
    {
      etapa_nome: lead ? nomeEtapa(lead.etapa) : null,
      na_etapa_desde: lead?.entrou_etapa_em ?? null,
      ultima_mensagem: lead?.ultima_mensagem ?? null,
      atende: lead?.responsavel?.nome ?? null,
    },
    agoraMs,
    criadoPor && criadoPor !== "criada" ? criadoPor.charAt(0).toUpperCase() + criadoPor.slice(1) : null,
  );
}

/** as tarefas com o resumo preenchido — o que a página de ensaio entrega à tela */
export function comResumosDeEnsaio(tarefas: TarefaVisao[], agora: Date = new Date()): TarefaVisao[] {
  const leads = new Map(gerarLeadsEnsaio(agora).map((l) => [l.lead_id, l]));
  return tarefas.map((t) => (t.resumo ? t : { ...t, resumo: resumoDeEnsaio(t, t.lead_id ? (leads.get(t.lead_id) ?? null) : null, agora) }));
}

// ─────────────────── os SINAIS da priorização (W-T, 11/09) ───────────────────

/**
 * O que a ordem "Mais urgente primeiro" precisa saber do LEAD por trás da tarefa — etapa, valor e
 * há quanto tempo ele está esperando resposta (`lib/tarefas/prioridade.ts`).
 *
 * ⚠️ **Isto é ensaio, e a leitura real ainda não traz nada disto.** Em produção `sinais` chega
 * vazio e o peso cai para vencida → hoje → prioridade → prazo, que é a ordem que a tela já tinha.
 * O caminho real são duas leituras que ainda não existem: etapa e valor saem de `core.v_lead_card`
 * (existem, é só ler pelo `lead_id` da tarefa), e a espera sai da última mensagem de entrada sem
 * resposta em `core.v_mensagem` — essa é a cara, porque é por conversa.
 *
 * A espera só conta quando a ÚLTIMA mensagem do fio é do cliente: se nós falamos por último, o
 * lead não está esperando — está pensando, e contar isso como dívida encheria a fila de urgência
 * falsa.
 */
export function sinaisDeEnsaio(tarefas: TarefaVisao[], agora: Date = new Date()): Record<string, SinaisDoLead> {
  const leads = gerarLeadsEnsaio(agora);
  const contextos = contextoFocoEnsaio(tarefas, agora);
  const agoraMs = agora.getTime();
  const saida: Record<string, SinaisDoLead> = {};
  for (const t of tarefas) {
    const i = idxDoLead(t.lead_id);
    const lead = i == null ? null : leads[i];
    if (!lead) continue;
    const ctx = contextos[t.id];
    const ultima = ctx?.fio.length ? ctx.fio[ctx.fio.length - 1] : null;
    const esperando = ultima && ultima.de === "cliente" ? (agoraMs - new Date(ultima.em).getTime()) / H : null;
    saida[t.id] = {
      etapa: lead.etapa,
      etapa_nome: nomeEtapa(lead.etapa),
      valor: lead.valor ?? null,
      horas_sem_resposta: esperando != null && esperando > 0 ? esperando : null,
    };
  }
  return saida;
}

// ───────────────────────────── 2. fios curtos ─────────────────────────────

interface MoldeMsgFoco {
  de: "cliente" | "nos";
  autor?: string;
  /** minutos atrás */
  ha: number;
  corpo: string;
  tipo?: string;
}

/** por ÍNDICE do lead na fixture do funil — só os que não têm conversa em /conversas (idx ≥ 15) */
const FIOS: Record<number, { canal: ContextoFoco["canal"]; msgs: MoldeMsgFoco[] }> = {
  // Elza Moreira
  19: {
    canal: { rotulo: "Oficial", tipo: "oficial" },
    msgs: [
      { de: "nos", autor: "Sara", ha: 4 * 24 * 60, corpo: "Dona Elza, marquei sua audiometria na Clínica Otoaudio, quinta às 10h. O endereço é Rua Tupinambás, 340, Centro. Consegue ir?" },
      { de: "cliente", ha: 4 * 24 * 60 - 40, corpo: "Consigo sim minha filha, meu neto me leva" },
      { de: "nos", autor: "Sara", ha: 2 * 24 * 60 + 300, corpo: "Bom dia! Passando para lembrar do exame amanhã às 10h 😊" },
      { de: "cliente", ha: 2 * 24 * 60 + 60, corpo: "Ai moça, meu neto teve um imprevisto e não vai poder me levar amanhã. Tem outro dia?" },
      { de: "nos", autor: "Sara", ha: 2 * 24 * 60, corpo: "Sem problema, dona Elza! Vou ver os horários com a clínica e te falo." },
    ],
  },
  // Cleusa Martins
  23: {
    canal: { rotulo: "Oficial", tipo: "oficial" },
    msgs: [
      { de: "nos", autor: "Sara", ha: 15 * 60, corpo: "Dona Cleusa, ficou confirmado: sua avaliação é amanhã às 9h na AudioBH. Leve um documento com foto, tá?" },
      { de: "cliente", ha: 14 * 60 + 20, corpo: "Tá bom" },
      { de: "nos", autor: "Sara", ha: 6 * 60 + 30, corpo: "Tentei te ligar agora há pouco para combinar os detalhes, mas não consegui. Pode falar?" },
      { de: "cliente", ha: 60 * 9 - 30, corpo: "onde fica a clínica? é perto do centro?" },
      { de: "cliente", ha: 60 * 9 - 28, corpo: "minha filha vai me levar mas ela não conhece" },
    ],
  },
  // Jorge Nascimento
  24: {
    canal: { rotulo: "Oficial", tipo: "oficial" },
    msgs: [
      { de: "cliente", ha: 6 * 24 * 60, corpo: "Boa tarde, fiz a consulta com a Dra. Ana Paula hoje. Ela falou que preciso dos dois aparelhos" },
      { de: "nos", autor: "Rodolfo", ha: 6 * 24 * 60 - 30, corpo: "Boa tarde, Sr. Jorge! Isso, a indicação foi bilateral. Vou montar a proposta com os dois e te mando aqui." },
      { de: "cliente", ha: 6 * 24 * 60 - 25, corpo: "Certo, fico no aguardo. Tem como parcelar?" },
      { de: "nos", autor: "Rodolfo", ha: 3 * 24 * 60, corpo: "Tem sim! Até 12x. Estou finalizando os valores, te mando até amanhã." },
    ],
  },
  // Expedito Araújo
  28: {
    canal: { rotulo: "Oficial", tipo: "oficial" },
    msgs: [
      { de: "nos", autor: "Sara", ha: 18 * 60, corpo: "Seu Expedito, segue a proposta dos dois aparelhos que a fono indicou: R$ 21.000 nos dois, com o teste de 7 dias em casa incluído.", tipo: "documento" },
      { de: "cliente", ha: 17 * 60, corpo: "Recebi. Vou mostrar pra minha esposa" },
      { de: "cliente", ha: 5 * 60, corpo: "o recarregável compensa? quanto fica a mais?" },
      { de: "cliente", ha: 5 * 60 - 2, corpo: "ela achou que pilha ia dar trabalho" },
    ],
  },
  // Iolanda Freitas
  29: {
    canal: { rotulo: "Oficial", tipo: "oficial" },
    msgs: [
      { de: "nos", autor: "Sara", ha: 2 * 24 * 60, corpo: "Dona Iolanda, fechamos então: entrada de R$ 2.400 e o restante em 10x. Te mando a chave Pix para a entrada." },
      { de: "nos", autor: "Sara", ha: 2 * 24 * 60 - 1, corpo: "Pix CNPJ: 45.123.456/0001-90 — Me Escuta Aparelhos Auditivos" },
      { de: "cliente", ha: 26 * 60, corpo: "Recebi. Vou fazer o pix até sexta, quando cai minha aposentadoria" },
      { de: "nos", autor: "Sara", ha: 25 * 60, corpo: "Perfeito! Assim que cair a gente já libera o aparelho para a programação 😊" },
    ],
  },
  // Manoel Dias
  30: {
    canal: { rotulo: "Oficial", tipo: "oficial" },
    msgs: [
      { de: "cliente", ha: 9 * 60, corpo: "Bom dia. A moça da fono falou que o aparelho fica 15 mil e pouco. Dá pra parcelar sem entrada?" },
      { de: "nos", autor: "Sara", ha: 8 * 60 + 40, corpo: "Bom dia, Sr. Manoel! Vou verificar com o nosso financeiro as condições e te retorno ainda hoje, pode ser?" },
      { de: "cliente", ha: 8 * 60 + 30, corpo: "Pode. Fico esperando" },
    ],
  },
  // Rosângela Pinto
  31: {
    canal: { rotulo: "Lite · Ana Paula", tipo: "lite" },
    msgs: [
      { de: "cliente", ha: 2 * 24 * 60 + 120, corpo: "Dra, o aparelho tá apitando quando eu como. É normal?" },
      { de: "cliente", ha: 2 * 24 * 60 + 118, corpo: "abaixei o volume mas aí não escuto direito" },
      { de: "nos", autor: "Ana Paula", ha: 2 * 24 * 60, corpo: "Oi Rosângela! Isso é ajuste, não defeito. Vou marcar um ajuste fino com você — pode ser por vídeo?" },
      { de: "cliente", ha: 2 * 24 * 60 - 15, corpo: "Pode sim" },
    ],
  },
};

function fioDaConversa(conversaId: string, agora: Date): { fio: MensagemFoco[]; canal: ContextoFoco["canal"] } | null {
  const { conversas, mensagens } = gerarConversasEnsaio(agora);
  const c = conversas.find((x) => x.id === conversaId);
  const msgs = mensagens.get(conversaId);
  if (!c || !msgs) return null;
  const lite = !c.phone_number_id || String(c.phone_number_id).startsWith("lite:");
  const fio: MensagemFoco[] = msgs
    .filter((m) => !m.programada_para)
    .map((m) => ({
      id: m.id,
      de: m.direcao === "entrada" ? "cliente" : "nos",
      autor: m.direcao === "entrada" ? null : (m.autor_nome ?? (m.autor === "clara" ? "Clara" : "Sara")),
      corpo: m.corpo ?? "",
      em: m.criado_em,
      tipo: m.tipo_conteudo,
    }));
  return { fio, canal: lite ? { rotulo: c.numero_apelido ?? "Lite", tipo: "lite" } : { rotulo: "Oficial", tipo: "oficial" } };
}

// ───────────────────────────── 3. ficha essencial ─────────────────────────────

function cidadeDe(i: number): string {
  return i % 4 === 0 ? "Belo Horizonte" : i % 7 === 0 ? "Betim" : "Contagem";
}

function aparelhoDe(lead: CardLead): string | null {
  const ordem = ETAPAS_PADRAO.find((e) => e.chave === lead.etapa)?.ordem ?? 0;
  const tags = lead.tags ?? [];
  if (lead.etapa === "ganho") return tags.includes("2 aparelhos") ? "Phonak Audéo L90-R · bilateral" : "Signia Pure Charge&Go 7AX";
  if (ordem < 3) return null;
  if (tags.includes("recarregável")) return "Bilateral · RIC recarregável";
  return tags.includes("2 aparelhos") ? "Bilateral · RIC" : "Unilateral · RIC";
}

const CONSULTAS: Record<number, { emHoras: number; onde: string }> = {
  23: { emHoras: 10, onde: "AudioBH · avaliação" },
  3: { emHoras: 15, onde: "teleconsulta · Ana Paula" },
  1: { emHoras: 50, onde: "teleconsulta · Ana Paula" },
  24: { emHoras: 72, onde: "teleconsulta · Ana Paula" },
};

function fichaDe(lead: CardLead, i: number, agora: Date): FichaEssencial {
  const consulta = CONSULTAS[i];
  const t = agora.getTime();
  const proxima = consulta
    ? { em: new Date(Math.floor((t + consulta.emHoras * H) / H) * H).toISOString(), onde: consulta.onde }
    : lead.compromisso_em
      ? { em: lead.compromisso_em, onde: "compromisso marcado" }
      : null;
  return {
    cidade: cidadeDe(i),
    etapa_nome: nomeEtapa(lead.etapa),
    na_etapa_desde: lead.entrou_etapa_em,
    aparelho: aparelhoDe(lead),
    proxima_consulta: proxima,
    valor: lead.valor,
    telefone: lead.telefone,
    atende: lead.responsavel?.nome ?? null,
    idade: lead.idade,
  };
}

// ───────────────────────────── o contexto por tarefa ─────────────────────────────

export function contextoFocoEnsaio(tarefas: TarefaVisao[], agora: Date = new Date()): Record<string, ContextoFoco> {
  const leads = gerarLeadsEnsaio(agora);
  const t = agora.getTime();
  const saida: Record<string, ContextoFoco> = {};
  for (const tarefa of tarefas) {
    const i = idxDoLead(tarefa.lead_id);
    if (i == null) continue;
    const lead = leads[i];
    if (!lead) continue;
    const conversaId = tarefa.conversa_id ?? conversaIdDeEnsaio(i);
    let fio: MensagemFoco[] = [];
    let canal: ContextoFoco["canal"] = { rotulo: "Oficial", tipo: "oficial" };
    const daConversa = conversaId ? fioDaConversa(conversaId, agora) : null;
    if (daConversa) {
      fio = daConversa.fio;
      canal = daConversa.canal;
    } else if (FIOS[i]) {
      canal = FIOS[i].canal;
      fio = FIOS[i].msgs.map((m, k) => ({
        id: `f0c0${String(i).padStart(4, "0")}-${String(k + 1).padStart(4, "0")}`,
        de: m.de,
        autor: m.de === "nos" ? (m.autor ?? "Sara") : null,
        corpo: m.corpo,
        em: new Date(t - m.ha * MIN).toISOString(),
        tipo: m.tipo ?? "texto",
      }));
    }
    saida[tarefa.id] = {
      lead_id: lead.lead_id,
      lead_nome: lead.nome ?? tarefa.lead_nome ?? "Lead",
      conversa_id: conversaId,
      canal,
      fio,
      ficha: fichaDe(lead, i, agora),
    };
  }
  return saida;
}

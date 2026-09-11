import type { GrupoFicha } from "@/lib/dados/ficha-calculos";
import type { CardLead } from "@/lib/dados/funil";

/**
 * A FICHA COMPLETA DO LEAD (W-D3 v4, 10/09 — Diogo às 23:45: "preciso ter TODOS os dados
 * originais de produção aí, fazem parte do processo comercial").
 *
 * Os slugs são os de `core.lead_campo` em produção (medidos pelo Diogo), agrupados na ordem que
 * ele pediu. Em produção quem entrega grupos e valores é `lerPainelLead` (config `ficha_lead` +
 * projeção `lead_campo`) — o painel lê o MESMO `painel.ficha` que o `FichaKommo` lia. Este
 * arquivo só existe para o ensaio ter a mesma anatomia com valores verossímeis, por lead, e com
 * lacunas de propósito: o vendedor precisa ver o que falta preencher.
 *
 * Tipos: `texto`, `texto_longo`, `numero`, `booleano`, `selecao` (opções), `data`, `data_hora`,
 * `url`; `outro` para o que não tem editor (endereço em objeto `linha_0…`, arquivo `.nhax`).
 */

const c = (slug: string, nome: string, tipo: GrupoFicha["campos"][number]["tipo"], opcoes: string[] = [], editavel = true) => ({
  slug,
  nome,
  tipo,
  opcoes,
  editavel,
});

export const GRUPOS_FICHA_COMPLETA: GrupoFicha[] = [
  {
    chave: "identificacao",
    nome: "Identificação",
    campos: [
      c("nome_completo", "Nome completo", "texto"),
      c("data_de_nascimento", "Data de nascimento", "data"),
      c("sexo_paciente", "Sexo", "selecao", ["Feminino", "Masculino"]),
      c("cpf", "CPF", "texto"),
      c("rg", "RG", "texto"),
      c("e_mail", "E-mail", "texto"),
      c("endereco_completo_com_cep", "Endereço", "outro", [], false),
      c("cidade", "Cidade", "texto"),
      c("estado", "Estado", "selecao", ["MG", "SP", "RJ", "ES", "BA", "GO", "DF"]),
      c("e_de_bh", "É de BH", "booleano"),
      c("cidade_grande_capital", "Cidade grande / capital", "booleano"),
    ],
  },
  {
    chave: "quem_fala",
    nome: "Quem fala",
    campos: [
      c("e_paciente", "É o próprio paciente", "booleano"),
      c("quem_e_paciente", "Quem é o paciente", "selecao", ["Mãe", "Pai", "Esposa", "Marido", "Filha", "Filho", "Amiga", "Amigo", "Avó", "Avô", "Outro"]),
    ],
  },
  {
    chave: "audicao",
    nome: "Audição e aparelho",
    campos: [
      c("usa_aasi", "Usa aparelho (AASI)", "booleano"),
      c("ja_testou_aasi", "Já testou aparelho", "booleano"),
      c("origem_aasi", "Origem do aparelho", "selecao", ["Comprou", "Ganhou", "SUS", "Emprestado", "Outro"]),
      c("interesse_aasi", "Interesse (1–5)", "selecao", ["1", "2", "3", "4", "5"]),
      c("indicacao_aasi", "Indicação de aparelho", "texto"),
      c("audiometria", "Audiometria", "selecao", ["Sim", "Não"]),
      c("audiometria_parceiro", "Audiometria no parceiro", "texto"),
      c("hora_audiometria", "Audiometria em", "data_hora"),
    ],
  },
  {
    chave: "consulta",
    nome: "Consulta",
    campos: [
      c("tipo_consulta", "Tipo de consulta", "selecao", ["Teleconsulta", "Presencial"]),
      c("aceita_teleconsulta", "Aceita teleconsulta", "booleano"),
      c("aderencia_tele", "Aderência à tele", "selecao", ["Alta", "Média", "Baixa"]),
      c("forma_agenda", "Forma de agenda", "selecao", ["Ligação", "WhatsApp", "Presencial"]),
      c("hora_consulta", "Consulta em", "data_hora"),
      c("consulta_realizada", "Consulta realizada", "booleano"),
      c("feme", "Fono (FEME)", "texto"),
      c("score_teleconsulta", "Score da teleconsulta", "numero"),
    ],
  },
  {
    chave: "comercial",
    nome: "Comercial",
    campos: [
      c("orcamento", "Orçamento (R$)", "numero"),
      c("condicao_financeira", "Condição financeira", "selecao", ["Boa", "Média", "Limitada"]),
      c("capacidade_de_pagamento", "Capacidade de pagamento (1–5)", "selecao", ["1", "2", "3", "4", "5"]),
      c("desejo", "Desejo", "texto_longo"),
      c("plano", "Plano", "selecao", ["Plano Bilateral", "Plano Unilateral", "Sem plano"]),
      c("observacoes_internas", "Observações internas", "texto_longo"),
      c("pasta_do_drive", "Pasta do Drive", "url"),
    ],
  },
  {
    chave: "aparelho_vendido",
    nome: "Aparelho vendido",
    campos: [
      c("modelo", "Modelo", "texto"),
      c("no_de_serie_od", "Nº de série OD", "texto"),
      c("no_de_serie_oe", "Nº de série OE", "texto"),
      c("receptor_od", "Receptor OD", "texto"),
      c("receptor_oe", "Receptor OE", "texto"),
      c("acessorios", "Acessórios", "texto"),
      c("programacao", "Programação", "outro", [], false),
    ],
  },
  {
    chave: "teste",
    nome: "Teste",
    campos: [c("inicio_do_teste", "Início do teste", "data"), c("fim_do_teste", "Fim do teste", "data"), c("teste_finalizado", "Teste finalizado", "booleano")],
  },
];

const ORDEM_ETAPA: Record<string, number> = { novo: 0, qualificando: 1, avaliacao: 2, proposta: 3, negociacao: 4, ganho: 5, perdido: 2 };

function indice(leadId: string): number {
  const n = Number(leadId.slice(-4));
  return Number.isFinite(n) ? n : 0;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Valores verossímeis por lead, DETERMINÍSTICOS (o mesmo lead abre sempre igual) e com lacunas
 * que crescem conforme a etapa recua: lead novo tem só o que a Clara já perguntou; ganho tem
 * até o nº de série. Quem preencheu é o processo, não a fixture.
 */
export function valoresFichaCompletaEnsaio(lead: CardLead, agora: Date = new Date()): Record<string, unknown> {
  const i = indice(lead.lead_id);
  const etapa = ORDEM_ETAPA[lead.etapa] ?? 0;
  const t = agora.getTime();
  const familiar = (lead.tags ?? []).includes("familiar decide") || /\(m[ãa]e:/i.test(lead.nome ?? "");
  const nome = lead.nome ?? "";
  const feminino = /a\b|e\b/.test(nome.split(" ")[0]) && !/jos[eé]|geraldo|waldemar|sebasti[ãa]o|francisco|osvaldo|benedito|nelson|arlindo|jorge|l[aá]zaro|expedito|manoel|ot[aá]vio|djalma|h[eé]lio|valdir|ademir|raimundo/i.test(nome);
  const nasc = lead.idade ? new Date(agora.getFullYear() - lead.idade, (i * 7) % 12, ((i * 13) % 27) + 1) : null;
  const primeiro = nome.split(" ")[0];
  const v: Record<string, unknown> = {
    nome_completo: nome.replace(/\s*\(.*\)\s*$/, "") || null,
    data_de_nascimento: nasc ? ymd(nasc) : null,
    sexo_paciente: lead.idade ? (feminino ? "Feminino" : "Masculino") : null,
    cpf: etapa >= 3 ? `${String(100 + i).slice(-3)}.${String(400 + i * 3).slice(-3)}.${String(700 + i * 7).slice(-3)}-${String(10 + (i % 80)).padStart(2, "0")}` : null,
    rg: etapa >= 4 ? `MG-${String(10_000_000 + i * 4567).slice(0, 2)}.${String(i * 4567).padStart(3, "0").slice(0, 3)}.${String(i * 91).padStart(3, "0").slice(0, 3)}` : null,
    e_mail: etapa >= 2 && i % 3 !== 0 ? `${primeiro.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${1950 + (i % 30)}@gmail.com` : null,
    endereco_completo_com_cep:
      etapa >= 2
        ? { linha_0: `${["Rua das Acácias", "Av. Amazonas", "Rua Padre Eustáquio", "Rua Tupinambás", "Av. João César de Oliveira"][i % 5]}, ${120 + i * 17}`, linha_1: `${["Eldorado", "Centro", "Padre Eustáquio", "Santa Efigênia", "Cidade Industrial"][i % 5]} — ${i % 4 === 0 ? "Belo Horizonte" : "Contagem"} / MG`, linha_2: `CEP 3${String(2000 + i * 31).padStart(4, "0")}-${String(100 + i).slice(-3)}` }
        : null,
    cidade: i % 4 === 0 ? "Belo Horizonte" : i % 7 === 0 ? "Betim" : "Contagem",
    estado: "MG",
    e_de_bh: i % 4 === 0,
    cidade_grande_capital: true,
    e_paciente: !familiar,
    quem_e_paciente: familiar ? (i % 3 === 2 ? "Pai" : "Mãe") : null,
    usa_aasi: (lead.tags ?? []).includes("já usou aparelho"),
    ja_testou_aasi: (lead.tags ?? []).includes("já usou aparelho") || etapa >= 4,
    origem_aasi: (lead.tags ?? []).includes("já usou aparelho") ? ["Comprou", "SUS", "Ganhou"][i % 3] : null,
    interesse_aasi: etapa >= 1 ? String(Math.min(5, 2 + etapa)) : null,
    indicacao_aasi: etapa >= 2 ? [(lead.tags ?? []).includes("2 aparelhos") ? "Bilateral · RIC" : "Unilateral · RIC", "Bilateral · BTE", "Bilateral · RIC recarregável"][i % 3] : null,
    audiometria: etapa >= 1 ? (i % 5 === 0 ? "Não" : "Sim") : null,
    audiometria_parceiro: etapa >= 2 && i % 5 !== 0 ? ["UBS Eldorado", "Clínica Otoaudio", "Hospital Municipal de Contagem", "Posto Padre Eustáquio"][i % 4] : null,
    hora_audiometria: etapa >= 2 && i % 5 !== 0 ? new Date(t - (20 + i) * 86_400_000).toISOString() : null,
    tipo_consulta: etapa >= 2 ? (i % 3 === 0 ? "Presencial" : "Teleconsulta") : null,
    aceita_teleconsulta: etapa >= 1 ? i % 3 !== 0 : null,
    aderencia_tele: etapa >= 2 ? ["Alta", "Média", "Baixa"][i % 3] : null,
    forma_agenda: etapa >= 2 ? ["WhatsApp", "Ligação", "Presencial"][i % 3] : null,
    hora_consulta: etapa >= 2 ? (lead.compromisso_em ?? new Date(t + ((i % 5) + 1) * 86_400_000 + 14 * 3_600_000).toISOString()) : null,
    consulta_realizada: etapa >= 3,
    feme: etapa >= 2 ? [`Contagem - Ana Paula Ferreira`, `Belo Horizonte - Daniela Matias`, `Contagem - Ana Paula Ferreira`][i % 3] : null,
    score_teleconsulta: etapa >= 3 ? 60 + ((i * 7) % 35) : null,
    orcamento: etapa >= 3 ? lead.valor : null,
    condicao_financeira: etapa >= 3 ? ["Boa", "Média", "Limitada"][i % 3] : null,
    capacidade_de_pagamento: etapa >= 3 ? String(2 + (i % 4)) : null,
    desejo: etapa >= 1 ? ["Voltar a ouvir a televisão sem incomodar a família", "Entender o neto no telefone", "Participar das conversas na igreja", "Ouvir o médico sem pedir para repetir"][i % 4] : null,
    plano: etapa >= 3 ? ((lead.tags ?? []).includes("2 aparelhos") ? "Plano Bilateral" : i % 2 ? "Plano Bilateral" : "Plano Unilateral") : null,
    observacoes_internas: etapa >= 2 ? ["Prefere contato à tarde. A filha acompanha as decisões.", "Já comparou com concorrente; sensível a preço.", "Vem de indicação — tratar como prioridade.", null][i % 4] : null,
    pasta_do_drive: etapa >= 3 ? `https://drive.google.com/drive/folders/1mE${String(i * 7919).padStart(6, "0")}` : null,
    modelo: etapa >= 5 ? ["Phonak Audéo L90-R", "Signia Pure Charge&Go 7AX", "Oticon Real 1"][i % 3] : null,
    no_de_serie_od: etapa >= 5 ? `2${String(340_000 + i * 977).slice(-6)}` : null,
    no_de_serie_oe: etapa >= 5 && (i % 2 === 0 || (lead.tags ?? []).includes("2 aparelhos")) ? `2${String(340_001 + i * 977).slice(-6)}` : null,
    receptor_od: etapa >= 5 ? ["M · 2", "P · 3", "M · 3"][i % 3] : null,
    receptor_oe: etapa >= 5 && (i % 2 === 0 || (lead.tags ?? []).includes("2 aparelhos")) ? ["M · 2", "P · 3", "M · 3"][i % 3] : null,
    acessorios: etapa >= 5 ? ["Carregador + estojo", "Carregador, estojo e TV Connector", "Estojo desumidificador"][i % 3] : null,
    programacao: etapa >= 5 ? { arquivo: `${primeiro.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-${ymd(new Date(t - 10 * 86_400_000))}.nhax` } : null,
    inicio_do_teste: etapa >= 4 ? ymd(new Date(t - (12 + (i % 5)) * 86_400_000)) : null,
    fim_do_teste: etapa >= 4 ? ymd(new Date(t - (5 + (i % 5)) * 86_400_000)) : null,
    teste_finalizado: etapa >= 5 ? true : etapa >= 4 ? false : null,
  };
  return v;
}

/** Quantos campos do grupo têm valor — para o cabeçalho "4 de 11 preenchidos". */
export function preenchidosDoGrupo(grupo: GrupoFicha, valores: Record<string, unknown>): { preenchidos: number; total: number } {
  const total = grupo.campos.length;
  const preenchidos = grupo.campos.filter((c) => {
    const v = valores[c.slug];
    return v != null && v !== "";
  }).length;
  return { preenchidos, total };
}

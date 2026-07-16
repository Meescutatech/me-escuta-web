import type { CardLead } from "./funil";

/**
 * Detalhe do lead exibido no drawer (spec Design/card-drawer.html — Croqui).
 * Tipos client-safe. O gerador `detalheMock` sintetiza o detalhe a partir do CardLead
 * enquanto a 0009 (core.tarefa/anotacao/anexo + histórico por lead) não sobe. A leitura real
 * do histórico vem de core.evento por lead_id via server action (ver actions.ts). TODO(spec).
 */

export type TipoResp = "dm" | "sara" | "fono";
export type TipoAnexo = "pdf" | "img" | "aud";
export type TipoEvento = "in" | "out" | "prop" | "appr" | "stage";

export interface Tarefa {
  id: string;
  titulo: string;
  prazo: string | null; // texto amigável ("hoje, 16h", "amanhã")
  prazoNivel?: "soon" | "late" | null;
  responsavel: { tipo: TipoResp; nome: string };
  concluida: boolean;
}

export interface Anotacao {
  id: string;
  autor: string;
  autorTipo: TipoResp | "clara";
  texto: string; // pode conter <b>
  quando: string;
  ia?: boolean;
}

export interface Anexo {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  meta: string;
}

export interface EventoHistorico {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  corpo: string; // pode conter <b>
  quando: string;
}

export interface CondicaoCredito {
  texto: string; // pode conter <b>
  ok: boolean;
}

export interface AnaliseLevindo {
  faixa: string; // A–E
  score: number; // 0–100
  diagnostico: string; // pode conter <b>
  condicoes: CondicaoCredito[];
  validador: string;
  rodadoHa: string;
}

export interface DetalheLead {
  cidade: string | null;
  tarefas: Tarefa[];
  anotacoes: Anotacao[];
  anexos: Anexo[];
  historico: EventoHistorico[];
  levindo: AnaliseLevindo; // sempre disponível; `levindoRodado` decide auto-exibir vs "Acionar Levindo"
  levindoRodado: boolean;
}

// ─────────────────────────────── gerador mock ───────────────────────────────

const CIDADES = ["Belo Horizonte/MG", "Contagem/MG", "Juiz de Fora/MG", "São Paulo/SP", "Rio de Janeiro/RJ"];

const ORIGEM_TXT: Record<string, string> = {
  wa: "WhatsApp",
  ig: "Instagram",
  meta: "Meta Ads",
  ind: "Indicação",
};

/** Detalhe rico e plausível para a demo, personalizado com os dados do próprio card. */
export function detalheMock(lead: CardLead): DetalheLead {
  const resp = lead.responsavel ?? { tipo: "dm" as TipoResp, nome: "Diogo ME" };
  const cidade = CIDADES[Math.abs(hash(lead.lead_id)) % CIDADES.length];
  const primeiroNome = (lead.nome ?? "a paciente").split(/\s+/)[0];

  // Levindo já rodou (auto-exibe) na negociação/proposta ou quando há proposta do Levindo;
  // nas demais etapas fica disponível via botão "Acionar Levindo".
  const levindoRodado =
    lead.etapa === "negociacao" || lead.etapa === "proposta" || lead.proposta?.agente === "lev";

  const levindo: AnaliseLevindo = {
    faixa: "B",
    score: 72,
    diagnostico:
      "Faixa <b>B</b> · score <b>72/100</b>. Bureau limpo, sem restrições. Comportamento de pagamento bom no histórico do DW. <b>Recomenda parcelamento com entrada</b>.",
    condicoes: [
      { texto: "<b>Boleto em até 12×</b> com entrada de 20%", ok: true },
      { texto: "Pix à vista com <b>5% de desconto</b>", ok: true },
      { texto: "Boleto sem entrada — <b>não autorizado</b> nesta faixa", ok: false },
    ],
    validador: resp.nome,
    rodadoHa: "2h",
  };

  return {
    cidade,
    levindo,
    levindoRodado,
    tarefas: [
      { id: "t1", titulo: "Confirmar condição de pagamento com a paciente", prazo: "hoje, 16h", prazoNivel: "soon", responsavel: resp, concluida: false },
      { id: "t2", titulo: "Enviar link de assinatura do contrato (ClickSign)", prazo: "amanhã", prazoNivel: null, responsavel: resp, concluida: false },
      { id: "t3", titulo: "Realizar teleconsulta com a fono", prazo: "concluída ontem", prazoNivel: null, responsavel: { tipo: "fono", nome: "Fono Ana" }, concluida: true },
    ],
    anotacoes: [
      { id: "n1", autor: "Clara · resumo automático", autorTipo: "clara", ia: true, quando: "propõe · valide", texto: `${primeiroNome} relatou <b>dificuldade de escuta em ambientes com ruído</b> e uso de aparelho antigo há 6 anos. Demonstrou interesse e perguntou sobre parcelamento. Bom perfil para fechamento.` },
      { id: "n2", autor: "Fono Ana", autorTipo: "fono", quando: "ontem, 14:20", texto: "Perda auditiva <b>moderada bilateral</b>. Indicado par de AASI intra-auricular. Paciente adaptável, mora com a filha que ajuda no manuseio." },
      { id: "n3", autor: resp.nome, autorTipo: resp.tipo, quando: "ontem, 15:05", texto: "Filha é o contato de decisão. Pediu pra falar sobre valores só depois da consulta. Sensível a preço." },
      { id: "n4", autor: "Sara", autorTipo: "sara", quando: "3 dias atrás", texto: "Assumi da Clara pra tirar dúvida sobre garantia. Respondida, devolvi pra régua." },
    ],
    anexos: [
      { id: "a1", nome: `audiometria_${primeiroNome.toLowerCase()}.pdf`, tipo: "aud", meta: "Exame · 480 KB · enviado pela Fono Ana ontem" },
      { id: "a2", nome: "documento_identidade.jpg", tipo: "img", meta: "Imagem · 1,2 MB · enviado pela paciente há 2 dias" },
      { id: "a3", nome: "comprovante_residencia.pdf", tipo: "pdf", meta: "Documento · 210 KB · enviado há 2 dias" },
    ],
    historico: [
      ...(levindoRodado ? [{ id: "h0", tipo: "prop" as TipoEvento, titulo: "Levindo propôs análise de crédito", corpo: `Faixa <b>B</b> · score 72 · aguardando validação de ${resp.nome}`, quando: "há 2h" }] : []),
      { id: "h1", tipo: "stage", titulo: "Etapa alterada", corpo: "Proposta enviada <b>→</b> Análise de crédito", quando: "há 2h" },
      { id: "h2", tipo: "out", titulo: "Mensagem enviada", corpo: 'Clara: "Enviei os detalhes do modelo indicado pela fono 💙"', quando: "ontem 15:40" },
      { id: "h3", tipo: "appr", titulo: "Sugestão aprovada", corpo: `${resp.nome} aprovou a proposta de resposta da Clara`, quando: "ontem 15:05" },
      { id: "h4", tipo: "in", titulo: "Mensagem recebida", corpo: 'Paciente: "E dá pra parcelar? Minha filha vai me ajudar"', quando: "ontem 14:52" },
      { id: "h5", tipo: "stage", titulo: "Teleconsulta realizada", corpo: "Fono Ana · perda moderada bilateral · par de AASI indicado", quando: "ontem 14:20" },
      { id: "h6", tipo: "in", titulo: "Lead recebido", corpo: `Entrada via ${ORIGEM_TXT[lead.origem ?? "wa"] ?? "WhatsApp"}`, quando: "3 dias atrás" },
    ],
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

import {
  diasDoPeriodo,
  somarDias,
  type CustoCru,
  type EntradaVisao,
  type EtapaConfig,
  type EtapaLeadCru,
  type FonteVocabulario,
  type Periodo,
  type ToqueCru,
} from "./marketing-calculos.ts";

/**
 * FIXTURE DE ENSAIO — so entra quando `NEXT_PUBLIC_MARKETING_ENSAIO=1`. NUNCA por padrao.
 *
 * Producao tem zero linhas em `core.captacao` ate o app Meta sair do modo de desenvolvimento
 * (BLOCO A · A1). Sem isto, ninguem consegue ver o layout com dado. A fixture e determinista
 * (mesma semente, mesma tela) e passa pela MESMA `montarVisao` da leitura real — o ensaio
 * prova a tela, nao uma segunda tela.
 *
 * 60 dias · 3 campanhas Meta · 2 Google · cidades da segmentacao · organico (indicacao,
 * Instagram, WhatsApp direto) · custo diario por campanha · etapa atual por lead.
 */

export const DIAS_ENSAIO = 60;

/** PRNG determinista (mulberry32). */
function semente(s: number) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VOCABULARIO_ENSAIO: FonteVocabulario[] = [
  { chave: "meta_leadads", rotulo: "Meta Lead Ads", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "whatsapp_ctwa", rotulo: "Anuncio clique-para-WhatsApp", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "google_ads", rotulo: "Google Ads", ativo: true, pago_organico: "pago", plataforma: "google" },
  { chave: "indicacao", rotulo: "Indicacao", ativo: true, pago_organico: "organico", plataforma: null },
  { chave: "instagram", rotulo: "Instagram (perfil)", ativo: true, pago_organico: "organico", plataforma: null },
  { chave: "whatsapp_direto", rotulo: "WhatsApp direto", ativo: true, pago_organico: "organico", plataforma: null },
  { chave: "landing", rotulo: "Landing page", ativo: true, pago_organico: null, plataforma: null },
];

export const ETAPAS_ENSAIO: EtapaConfig[] = [
  { chave: "novo", nome: "Novo lead", ordem: 1, tipo: "aberto" },
  { chave: "qualificando", nome: "Qualificando", ordem: 2, tipo: "aberto" },
  { chave: "qualificado", nome: "Qualificado", ordem: 40, tipo: "aberto" },
  { chave: "avaliacao", nome: "Avaliacao auditiva", ordem: 50, tipo: "aberto" },
  { chave: "audiometria_realizada", nome: "Audiometria realizada", ordem: 70, tipo: "aberto" },
  { chave: "proposta", nome: "Proposta enviada", ordem: 80, tipo: "aberto" },
  { chave: "negociacao", nome: "Negociacao", ordem: 85, tipo: "aberto" },
  { chave: "ganho", nome: "Ganho", ordem: 90, tipo: "ganho" },
  { chave: "perdido", nome: "Perdido", ordem: 91, tipo: "perdido" },
];

interface CampanhaEnsaio {
  plataforma: "meta" | "google";
  fonte: string;
  id: string;
  nome: string;
  cidades: string[];
  anuncios: Array<{ id: string; nome: string }>;
  /** leads por dia (media) e custo diario (media). */
  leadsDia: number;
  custoDia: number;
  /** Qualidade: chance de chegar a cada marco. */
  qualificado: number;
  consulta: number;
  venda: number;
}

const CAMPANHAS: CampanhaEnsaio[] = [
  {
    plataforma: "meta",
    fonte: "meta_leadads",
    id: "120210001",
    nome: "Aparelho auditivo · Campinas",
    cidades: ["Campinas", "Valinhos"],
    anuncios: [
      { id: "ad-2001", nome: "Depoimento Dona Marta" },
      { id: "ad-2002", nome: "Teste auditivo gratuito" },
      { id: "ad-2003", nome: "Parcelamento em 24x" },
    ],
    leadsDia: 2.4,
    custoDia: 180,
    qualificado: 0.55,
    consulta: 0.3,
    venda: 0.09,
  },
  {
    plataforma: "meta",
    fonte: "whatsapp_ctwa",
    id: "120210002",
    nome: "Clique para WhatsApp · Jundiai",
    cidades: ["Jundiai"],
    anuncios: [
      { id: "ad-2101", nome: "Fale com a Sara" },
      { id: "ad-2102", nome: "Zumbido? Vamos conversar" },
    ],
    leadsDia: 1.6,
    custoDia: 95,
    qualificado: 0.45,
    consulta: 0.2,
    venda: 0.05,
  },
  {
    plataforma: "meta",
    fonte: "meta_leadads",
    id: "120210003",
    nome: "Remarketing · quem visitou",
    cidades: ["Campinas", "Jundiai", "Sorocaba"],
    anuncios: [{ id: "ad-2201", nome: "Ultima chance da condicao" }],
    leadsDia: 0.5,
    custoDia: 60,
    qualificado: 0.7,
    consulta: 0.45,
    venda: 0.18,
  },
  {
    plataforma: "google",
    fonte: "google_ads",
    id: "g-8801",
    nome: "Pesquisa · aparelho auditivo preco",
    cidades: ["Campinas", "Sorocaba"],
    anuncios: [
      { id: "g-ad-1", nome: "Aparelho auditivo a partir de" },
      { id: "g-ad-2", nome: "Avaliacao sem custo" },
    ],
    leadsDia: 1.1,
    custoDia: 140,
    qualificado: 0.65,
    consulta: 0.4,
    venda: 0.14,
  },
  {
    plataforma: "google",
    fonte: "google_ads",
    id: "g-8802",
    nome: "Marca · me escuta",
    cidades: [],
    anuncios: [{ id: "g-ad-3", nome: "Me Escuta oficial" }],
    leadsDia: 0.4,
    custoDia: 25,
    qualificado: 0.75,
    consulta: 0.5,
    venda: 0.25,
  },
];

const ORGANICO = [
  { fonte: "indicacao", leadsDia: 0.9, qualificado: 0.8, consulta: 0.55, venda: 0.3 },
  { fonte: "instagram", leadsDia: 0.7, qualificado: 0.4, consulta: 0.2, venda: 0.06 },
  { fonte: "whatsapp_direto", leadsDia: 0.5, qualificado: 0.5, consulta: 0.3, venda: 0.1 },
  { fonte: "landing", leadsDia: 0.3, qualificado: 0.5, consulta: 0.25, venda: 0.08 },
];

function poisson(rnd: () => number, media: number): number {
  const l = Math.exp(-media);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rnd();
  } while (p > l);
  return k - 1;
}

function etapaDoLead(rnd: () => number, q: number, c: number, v: number, diasAtras: number): string {
  // Lead muito recente ainda nao andou.
  if (diasAtras < 2) return rnd() < 0.5 ? "novo" : "qualificando";
  const r = rnd();
  if (r < v) return "ganho";
  if (r < c) return rnd() < 0.5 ? "audiometria_realizada" : "proposta";
  if (r < q) return "qualificado";
  if (rnd() < 0.35 && diasAtras > 10) return "perdido";
  return rnd() < 0.5 ? "novo" : "qualificando";
}

export interface Ensaio {
  toques: ToqueCru[];
  custos: CustoCru[];
  etapasLeads: EtapaLeadCru[];
  inicioSerie: string;
}

/** Gera 60 dias terminando em `periodo.fim` (exclusivo). Mesma semente, mesmo resultado. */
export function gerarEnsaio(periodo: Periodo, sementeN = 27): Ensaio {
  const rnd = semente(sementeN);
  const fim = periodo.fim;
  const ini = somarDias(fim, -DIAS_ENSAIO);
  const dias = diasDoPeriodo(ini, fim);
  const toques: ToqueCru[] = [];
  const custos: CustoCru[] = [];
  const etapasLeads: EtapaLeadCru[] = [];
  let n = 0;

  dias.forEach((dia, i) => {
    const diasAtras = dias.length - 1 - i;
    const fimDeSemana = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
    const fator = fimDeSemana ? 0.55 : 1 + 0.15 * Math.sin(i / 6);

    for (const c of CAMPANHAS) {
      // Remarketing so nos ultimos 25 dias; campanha de marca some no meio.
      if (c.id === "120210003" && diasAtras > 25) continue;
      if (c.id === "g-8802" && diasAtras > 40 && diasAtras < 50) continue;
      const custo = Math.round(c.custoDia * fator * (0.8 + rnd() * 0.4) * 100) / 100;
      const cliques = Math.round(custo / (1.4 + rnd()));
      custos.push({
        dia,
        plataforma: c.plataforma,
        campanha_id: c.id,
        campanha_nome: c.nome,
        custo,
        impressoes: cliques * (18 + Math.round(rnd() * 20)),
        cliques,
        ingerido_em: `${somarDias(dia, 1)}T06:10:00-03:00`,
      });
      const qtd = poisson(rnd, c.leadsDia * fator);
      for (let k = 0; k < qtd; k++) {
        n += 1;
        const leadId = `ensaio-${String(n).padStart(4, "0")}`;
        const an = c.anuncios[Math.floor(rnd() * c.anuncios.length)];
        const cidade = c.cidades.length ? c.cidades[Math.floor(rnd() * c.cidades.length)] : null;
        const hora = 8 + Math.floor(rnd() * 13);
        const capturadoEm = `${dia}T${String(hora).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00-03:00`;
        toques.push({
          lead_id: leadId,
          fonte: c.fonte,
          plataforma: c.plataforma,
          campanha_id: c.id,
          campanha_nome: c.nome,
          anuncio_id: an.id,
          anuncio_nome: an.nome,
          utm: { source: c.plataforma, medium: "cpc", campaign: c.nome, content: an.nome, term: null, cidade, cidade_procedencia: cidade ? "segmentacao" : null },
          clids: c.plataforma === "meta" ? { fbclid: `fb.${n}` } : { gclid: `g.${n}` },
          hierarquia_estado: "resolvida",
          capturado_em: capturadoEm,
          criado_em: capturadoEm,
        });
        etapasLeads.push({ lead_id: leadId, etapa: etapaDoLead(rnd, c.qualificado, c.consulta, c.venda, diasAtras) });
      }
    }

    for (const o of ORGANICO) {
      const qtd = poisson(rnd, o.leadsDia * (fimDeSemana ? 0.7 : 1));
      for (let k = 0; k < qtd; k++) {
        n += 1;
        const leadId = `ensaio-${String(n).padStart(4, "0")}`;
        const hora = 7 + Math.floor(rnd() * 14);
        const capturadoEm = `${dia}T${String(hora).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00-03:00`;
        toques.push({
          lead_id: leadId,
          fonte: o.fonte,
          plataforma: null,
          campanha_id: null,
          campanha_nome: null,
          anuncio_id: null,
          anuncio_nome: null,
          utm: null,
          clids: null,
          hierarquia_estado: "nao_aplicavel",
          capturado_em: capturadoEm,
          criado_em: capturadoEm,
        });
        etapasLeads.push({ lead_id: leadId, etapa: etapaDoLead(rnd, o.qualificado, o.consulta, o.venda, diasAtras) });
      }
    }
  });

  return { toques, custos, etapasLeads, inicioSerie: `${ini}T08:00:00-03:00` };
}

/** A entrada pronta para `montarVisao`, ja recortada no periodo pedido. */
export function entradaDeEnsaio(periodo: Periodo, agora: Date = new Date()): EntradaVisao {
  const e = gerarEnsaio(periodo);
  const iniIso = `${periodo.ini}T00:00:00-03:00`;
  const fimIso = `${periodo.fim}T00:00:00-03:00`;
  const toques = e.toques.filter((t) => t.capturado_em! >= iniIso && t.capturado_em! < fimIso);
  const custos = e.custos.filter((c) => c.dia >= periodo.ini && c.dia < periodo.fim);
  return {
    periodo,
    toques,
    custos,
    etapasLeads: e.etapasLeads,
    etapas: ETAPAS_ENSAIO,
    parcial: false,
    leituraFalhou: false,
    ensaio: true,
    inicioSerie: e.inicioSerie,
    custoLinhasTotal: e.custos.length,
    vocabulario: VOCABULARIO_ENSAIO,
    flagAtiva: null,
    agora,
  };
}

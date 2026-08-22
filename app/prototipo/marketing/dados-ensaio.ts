import {
  montarVisao,
  periodoDaUrl,
  type CustoCru,
  type FonteVocabulario,
  type ToqueCru,
  type VisaoMarketing,
} from "@/lib/dados/marketing-calculos";

/**
 * OS DADOS DO ENSAIO — inventados, e este arquivo existe para que eles nunca saiam daqui.
 *
 * Produção tem ZERO linhas em `core.captacao` e ZERO em `core.custo_midia` (medido 22/08), e vai
 * continuar assim até a T4 capturar e as credenciais de mídia chegarem. Sem uma fixture, a única
 * tela conferível seria a vazia — e o desenho das quatro fatias iria para revisão sem ninguém
 * nunca ter visto uma barra desenhada.
 *
 * As proporções vêm das medições da spec, não de um gerador: a Meta é 68% dos leads vivos, o
 * Google 15%, e há uma fatia sem canal nenhum (11,2%, M28). Dado bonito e equilibrado esconderia
 * justamente os baldes que a tela existe para mostrar, então a fixture tem buraco de propósito:
 * campanha com gasto e zero lead, resolução que falhou, toque sem plataforma, ingestão parada.
 */

const VOCABULARIO: FonteVocabulario[] = [
  { chave: "meta_leadads", rotulo: "Meta Lead Ads", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "whatsapp_ctwa", rotulo: "Anúncio click-to-WhatsApp", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "google_ads", rotulo: "Google Ads", ativo: true, pago_organico: "pago", plataforma: "google" },
  { chave: "indicacao", rotulo: "Indicação", ativo: true, pago_organico: "organico", plataforma: null },
  { chave: "landing", rotulo: "Landing page", ativo: true, pago_organico: null, plataforma: null },
];

/**
 * As proporções vêm das medições da spec, não de um gerador: Meta 68% dos leads vivos, Google
 * 15%, e uma fatia sem canal (11,2%, M28). O ensaio serve para ver a tela no formato REAL do
 * problema — um dado bonito e equilibrado esconderia justamente os baldes que ela existe para
 * mostrar.
 */
const CAMPANHAS = [
  { plataforma: "meta", id: "23851", nome: "Meta · Aparelho auditivo · SP capital", cidade: "São Paulo", peso: 34 },
  { plataforma: "meta", id: "23852", nome: "Meta · Teste auditivo grátis · ABC", cidade: "Santo André", peso: 20 },
  { plataforma: "meta", id: "23853", nome: "Meta · Remarketing · 60+", cidade: "São Paulo", peso: 14 },
  { plataforma: "google", id: "9911", nome: "Google · Aparelho auditivo preço", cidade: "Campinas", peso: 12 },
  { plataforma: "google", id: "9912", nome: "Google · Audiometria perto de mim", cidade: "São Paulo", peso: 6 },
];

const ANUNCIOS = ["Depoimento Dona Cida 30s", "Antes e depois · estático", "Carrossel modelos", "Vídeo consultório"];

function construirToques(fim: string): ToqueCru[] {
  const toques: ToqueCru[] = [];
  const base = new Date(`${fim}T12:00:00Z`).getTime();
  let i = 0;

  for (const c of CAMPANHAS) {
    for (let k = 0; k < c.peso; k++) {
      i += 1;
      // espalha ao longo dos últimos 26 dias, com um dia seco no meio para a série ter relevo
      const diasAtras = 1 + ((i * 7) % 26);
      const quando = new Date(base - diasAtras * 86400_000 - (i % 9) * 3600_000);
      const ctwa = c.plataforma === "meta" && i % 3 === 0;
      toques.push({
        lead_id: `lead-${i}`,
        fonte: c.plataforma === "google" ? "google_ads" : ctwa ? "whatsapp_ctwa" : "meta_leadads",
        plataforma: c.plataforma,
        campanha_id: c.id,
        campanha_nome: c.nome,
        anuncio_id: `ad-${(i % ANUNCIOS.length) + 1}`,
        anuncio_nome: ANUNCIOS[i % ANUNCIOS.length],
        utm: { cidade: c.cidade },
        clids: ctwa ? { ctwa_clid: `ctwa-${i}` } : c.plataforma === "google" ? { gclid: `g-${i}` } : null,
        hierarquia_estado: "resolvida",
        capturado_em: quando.toISOString(),
        criado_em: quando.toISOString(),
      });
    }
  }

  // O balde que a T4 existe para fechar: a resolução tentou e FALHOU. Sem `hierarquia_estado`
  // ele seria indistinguível dos legítimos abaixo.
  for (let k = 0; k < 9; k++) {
    i += 1;
    const quando = new Date(base - (2 + k) * 86400_000);
    toques.push({
      lead_id: `lead-${i}`,
      fonte: "whatsapp_ctwa",
      plataforma: "meta",
      campanha_id: null,
      campanha_nome: null,
      anuncio_id: null,
      anuncio_nome: null,
      utm: null,
      clids: { ctwa_clid: `ctwa-orfao-${k}` },
      hierarquia_estado: "falhou",
      capturado_em: quando.toISOString(),
      criado_em: quando.toISOString(),
    });
  }

  // Indicação: sem campanha e correto — não havia anúncio a resolver.
  for (let k = 0; k < 7; k++) {
    i += 1;
    const quando = new Date(base - (3 + k * 2) * 86400_000);
    toques.push({
      lead_id: `lead-${i}`,
      fonte: "indicacao",
      plataforma: null,
      campanha_id: null,
      campanha_nome: null,
      anuncio_id: null,
      anuncio_nome: null,
      utm: null,
      clids: null,
      hierarquia_estado: "nao_aplicavel",
      capturado_em: quando.toISOString(),
      criado_em: quando.toISOString(),
    });
  }

  // Landing: a fonte que a config não classifica (recebe pago E orgânico pela mesma chave).
  for (let k = 0; k < 5; k++) {
    i += 1;
    const quando = new Date(base - (4 + k * 3) * 86400_000);
    toques.push({
      lead_id: `lead-${i}`,
      fonte: "landing",
      plataforma: null,
      campanha_id: "lp-organica",
      campanha_nome: "Landing (sem plataforma resolvida)",
      anuncio_id: null,
      anuncio_nome: null,
      utm: { cidade: "Campinas" },
      clids: null,
      hierarquia_estado: "resolvida",
      capturado_em: quando.toISOString(),
      criado_em: quando.toISOString(),
    });
  }

  // MULTI-TOQUE: 9 pessoas que voltaram por um segundo caminho. Sem elas, `toques` e `leads`
  // dariam o mesmo numero na tela e ninguem veria a tela distinguir as duas coisas — que e o
  // edge_case "1 lead, 2 captacoes" da spec, e a razao de a tela contar leads DISTINTOS.
  for (let k = 0; k < 9; k++) {
    const original = toques[k * 5];
    if (!original) break;
    const quando = new Date(new Date(original.capturado_em!).getTime() + 36 * 3600_000);
    toques.push({
      ...original,
      fonte: "whatsapp_ctwa",
      plataforma: "meta",
      campanha_id: CAMPANHAS[2].id,
      campanha_nome: CAMPANHAS[2].nome,
      anuncio_id: "ad-1",
      anuncio_nome: ANUNCIOS[0],
      clids: { ctwa_clid: `ctwa-retorno-${k}` },
      capturado_em: quando.toISOString(),
      criado_em: quando.toISOString(),
    });
  }

  return toques.sort((a, b) => (b.capturado_em ?? "").localeCompare(a.capturado_em ?? ""));
}

function construirCustos(fim: string): CustoCru[] {
  const custos: CustoCru[] = [];
  const base = new Date(`${fim}T12:00:00Z`).getTime();
  const ingerido = new Date(base - 3 * 86400_000).toISOString(); // ingestão parada há 3 dias

  for (const c of CAMPANHAS.slice(0, 4)) {
    for (let d = 1; d <= 26; d++) {
      const dia = new Date(base - d * 86400_000).toISOString().slice(0, 10);
      custos.push({
        dia,
        plataforma: c.plataforma,
        campanha_id: c.id,
        campanha_nome: c.nome,
        custo: Number((18 + (c.peso % 7) * 4 + (d % 5) * 3).toFixed(2)),
        impressoes: 900 + d * 11,
        cliques: 20 + (d % 9),
        ingerido_em: ingerido,
      });
    }
  }

  // Campanha com gasto e ZERO lead casado — o balde que a D21 existe para tornar visível, e o
  // que um `left join` a partir dos toques apagaria em silêncio.
  for (let d = 1; d <= 10; d++) {
    custos.push({
      dia: new Date(base - d * 86400_000).toISOString().slice(0, 10),
      plataforma: "meta",
      campanha_id: "23899",
      campanha_nome: "Meta · Institucional (pausada)",
      custo: 52.4,
      impressoes: 4100,
      cliques: 12,
      ingerido_em: ingerido,
    });
  }

  return custos;
}

/** Os quatro estados que a tela precisa saber distinguir, e que dado real ainda não produz. */
export type Cenario = "com-dado" | "sem-dado-no-periodo" | "antes-da-serie" | "serie-nao-iniciada";

export const CENARIOS: Cenario[] = ["com-dado", "sem-dado-no-periodo", "antes-da-serie", "serie-nao-iniciada"];

export function visaoDeEnsaio(cenario: Cenario, agora: Date, params: { p?: string; de?: string; ate?: string } = {}): VisaoMarketing {
  const periodo = periodoDaUrl(params, agora);
  const base = new Date(`${periodo.fim}T12:00:00Z`).getTime();
  const comDado = cenario === "com-dado";
  const toques = comDado ? construirToques(periodo.fim) : [];
  const custos = comDado ? construirCustos(periodo.fim) : [];

  // O que separa os três vazios é UMA coisa: quando a série começou em relação ao recorte.
  const inicioSerie =
    cenario === "serie-nao-iniciada"
      ? null
      : cenario === "antes-da-serie"
        ? new Date(base + 10 * 86400_000).toISOString() // a série começa DEPOIS do fim do recorte
        : new Date(base - 40 * 86400_000).toISOString();

  return montarVisao({
    periodo,
    toques,
    custos,
    parcial: false,
    leituraFalhou: false,
    leadsSemData: comDado ? 3 : 0,
    // 118 leads no período contra ~98 com atribuição: a diferença é o buraco dos sem-canal.
    leadsNoPeriodo: cenario === "serie-nao-iniciada" ? 44 : comDado ? 118 : 0,
    inicioSerie,
    ultimaCaptacao: toques[0]?.capturado_em ?? null,
    custoLinhasTotal: custos.length,
    ultimoCusto: custos[0]?.ingerido_em ?? null,
    vocabulario: VOCABULARIO,
    flagAtiva: comDado ? true : null,
    agora,
  });
}

/** Todos os cenários de uma vez — é o que a ferramenta de conferência renderiza. */
export function cenariosDeEnsaio(agora: Date): Record<Cenario, VisaoMarketing> {
  return Object.fromEntries(CENARIOS.map((c) => [c, visaoDeEnsaio(c, agora)])) as Record<Cenario, VisaoMarketing>;
}

import {
  MARCOS,
  ROTULO_BALDE,
  ROTULO_MARCO,
  ROTULO_PLATAFORMA,
  SEM_CAMPANHA,
  brl,
  ddmm,
  inteiro,
  nosDoNivel,
  pct,
  type NivelOrigem,
  type NoOrigem,
  type VisaoMarketing,
} from "@/lib/dados/marketing-calculos";

/**
 * Como a resposta chega ao Fernando: texto PT-BR, não JSON cru.
 *
 * 🔴 A REGRA QUE ORGANIZA ESTE ARQUIVO, e ela tem incidente atrás: **leitura que falhou nunca
 * pode virar zero.** Em 03/09/2026 a tela imprimiu "qualificado 0 / consulta 0 / venda 0" numa
 * janela de 90 dias em que o SQL dava 5 / 2 / 1 — a conclusão OPOSTA, com toda a confiança. O
 * banner de erro até acendia; ninguém olha o banner quando a tabela ao lado mostra número.
 *
 * Aqui isso é pior que na tela, porque quem lê é um modelo de linguagem, que vai RESUMIR o
 * número e passar adiante sem o banner. Por isso o `cabecalho()` vem em TODA resposta, e diz em
 * palavras o que está incerto — o formatador nunca entrega tabela sem contexto de confiança.
 *
 * `brl`, `pct` e `inteiro` já devolvem "—" para `null`; a rigor a defesa começa neles.
 */

/** Uma linha por vez, sem tabela markdown: o cliente pode ser um terminal estreito. */
function linha(rotulo: string, valor: string): string {
  return `${rotulo.padEnd(28, ".")} ${valor}`;
}

/**
 * O estado da leitura, em português. Sempre presente. Quando algo está incerto, ele aparece
 * ANTES dos números — a ordem importa para quem lê de cima para baixo.
 */
export function cabecalho(v: VisaoMarketing): string {
  const avisos: string[] = [];

  if (v.leituraFalhou) {
    avisos.push(
      "⚠️ ALGUMA LEITURA FALHOU. Os campos que aparecem como '—' NÃO são zero: são desconhecidos. " +
        "Não conclua ausência a partir deles.",
    );
  }
  if (v.parcial) {
    avisos.push("⚠️ AMOSTRA PARCIAL: a leitura bateu no teto de linhas. Os totais estão subestimados.");
  }
  if (v.ensaio) {
    avisos.push("⚠️ MODO ENSAIO: estes números são de fixture, não do banco.");
  }

  switch (v.estado) {
    case "serie_nao_iniciada":
      avisos.push("ℹ️ A série de captação ainda não começou: não há nenhum toque registrado no sistema.");
      break;
    case "antes_da_serie":
      avisos.push(
        "ℹ️ Este período é ANTERIOR ao início da medição. Vazio aqui significa 'ainda não medíamos', não 'não houve lead'.",
      );
      break;
    case "sem_dado_no_periodo":
      avisos.push("ℹ️ A medição já estava ligada, e mesmo assim não houve nenhum toque neste período.");
      break;
    case "com_dado":
      break;
  }

  switch (v.estadoCusto) {
    case "sem_ingestao":
      avisos.push(
        "ℹ️ CUSTO indisponível: nenhuma linha de gasto foi ingerida ainda. Gasto e custo por lead aparecem como '—'.",
      );
      break;
    case "sem_linhas_no_periodo":
      avisos.push("ℹ️ Há custo ingerido no sistema, mas nenhuma linha cai neste período.");
      break;
    case "ingerido":
      break;
  }

  if (!v.vocabularioDisponivel) {
    avisos.push(
      "⚠️ O vocabulário de canais não pôde ser lido — a separação pago/orgânico pode estar incompleta.",
    );
  }
  if (v.flagAtiva === false) {
    avisos.push("⚠️ O módulo de marketing está DESLIGADO na configuração do sistema.");
  }

  const topo = `Período: ${v.periodo.rotulo} (${v.periodo.ini} até ${ddmm(v.periodo.fim)}, fim exclusivo)`;
  return avisos.length === 0 ? topo : `${topo}\n\n${avisos.join("\n")}`;
}

export function resumo(v: VisaoMarketing): string {
  return [
    linha("Leads no período", inteiro(v.resumo.leads)),
    linha("Fração paga", pct(v.resumo.fracaoPaga)),
    linha("Gasto em mídia", brl(v.resumo.gasto)),
    linha("Custo por lead (pagos)", brl(v.resumo.cpl)),
  ].join("\n");
}

/** A árvore, indentada. `SEM_CAMPANHA` vira um rótulo que explica o que é. */
export function arvore(nos: NoOrigem[], profundidade = 0): string {
  const saida: string[] = [];
  for (const n of nos) {
    const rotulo = n.chave === SEM_CAMPANHA ? "(sem campanha identificada)" : n.rotulo;
    const partes = [`${"  ".repeat(profundidade)}• ${rotulo}`, `${inteiro(n.leads)} leads`];
    if (n.fracao != null) partes.push(pct(n.fracao));
    if (n.gasto != null) partes.push(`gasto ${brl(n.gasto)}`);
    if (n.cpl != null) partes.push(`CPL ${brl(n.cpl)}`);
    if (n.cidades.length > 0) partes.push(`cidades: ${n.cidades.join(", ")}`);
    saida.push(partes.join(" · "));
    if (n.filhos.length > 0) saida.push(arvore(n.filhos, profundidade + 1));
  }
  return saida.join("\n");
}

export function nivel(v: VisaoMarketing, alvo: NivelOrigem): string {
  const nos = alvo === "balde" ? v.arvore : nosDoNivel(v.arvore, alvo);
  if (nos.length === 0) return "(nenhuma origem neste nível no período)";
  return arvore(
    // no nível pedido não se desce mais: a pergunta era esse nível
    nos.map((n) => ({ ...n, filhos: [] })),
  );
}

export function campanhas(v: VisaoMarketing): string {
  if (v.campanhas.length === 0) {
    return "(nenhuma campanha identificada no período — veja a cobertura para saber se é ausência de anúncio ou de identificador)";
  }
  return v.campanhas
    .map((c) => {
      const partes = [
        `• ${c.rotulo}`,
        ROTULO_PLATAFORMA[c.plataforma],
        `${inteiro(c.leads)} leads`,
        `gasto ${brl(c.gasto)}`,
        `CPL ${brl(c.cpl)}`,
      ];
      if (c.cidades.length > 0) partes.push(`cidades: ${c.cidades.join(", ")}`);
      return partes.join(" · ");
    })
    .join("\n");
}

export function funil(v: VisaoMarketing): string {
  const nomes = MARCOS.map((m) => `${ROTULO_MARCO[m]}=${v.marcos.nome[m] ?? "(sem etapa no funil)"}`).join(" · ");
  const linhas = v.funil.map((l) => {
    const marcos = MARCOS.map((m) => `${ROTULO_MARCO[m]} ${inteiro(l.marcos[m])} (${pct(l.taxas[m])})`).join(" · ");
    return `• ${l.rotulo} — ${inteiro(l.leads)} leads · ${marcos} · perdidos ${inteiro(l.perdidos)}`;
  });
  return [
    `Marcos lidos da configuração do funil: ${nomes}`,
    "Cada marco é 'chegou até', lido da etapa ATUAL do lead — não 'está em'.",
    "",
    ...(linhas.length > 0 ? linhas : ["(nenhuma origem com lead no período)"]),
  ].join("\n");
}

export function serie(v: VisaoMarketing): string {
  if (v.serie.length === 0) return "(período sem dias)";
  const linhas = v.serie.map(
    (p) =>
      `${p.rotulo}: total ${inteiro(p.total)} · meta ${inteiro(p.meta)} · google ${inteiro(p.google)} · orgânico ${inteiro(p.organico)} · outros ${inteiro(p.outros)}`,
  );
  return linhas.join("\n");
}

/**
 * A cobertura: quantos leads têm identificador de mídia. É o requisito **D1** do checklist do
 * Fernando, e o antídoto do que aconteceu — 97,2% dos leads sem identificador por 36 dias, e
 * ninguém viu.
 *
 * Aqui a leitura é feita sobre a árvore já montada, então usa exatamente a mesma classificação
 * da tela: um lead está "identificado" quando caiu num nó de campanha que não é `SEM_CAMPANHA`.
 *
 * ⚠️ ESTAS TRÊS LINHAS JÁ SE CONTRADISSERAM COM A ÁRVORE, e o defeito era daqui. A versão
 * anterior rotulava os leads sem campanha como "em plataforma, sem campanha" — mas o nó
 * `SEM_CAMPANHA` existe embaixo de QUALQUER plataforma, inclusive `sem_plataforma`, e a árvore
 * mostrava os mesmos 34 leads como "Sem plataforma". Pior: a terceira linha era calculada por
 * SUBTRAÇÃO das outras duas, então dava 0 sempre, por construção — uma linha que não media nada
 * e parecia medir. Agora cada linha é lida do seu próprio nível da árvore, e a terceira é um
 * RECORTE da segunda (por isso vem indentada, e não soma com ela).
 */
export function cobertura(v: VisaoMarketing): string {
  const campanhasNos = nosDoNivel(v.arvore, "campanha");
  const comCampanha = campanhasNos.filter((n) => n.chave !== SEM_CAMPANHA).reduce((s, n) => s + n.leads, 0);
  const semCampanha = campanhasNos.filter((n) => n.chave === SEM_CAMPANHA).reduce((s, n) => s + n.leads, 0);
  const total = v.resumo.leads;
  // Lido do nível de PLATAFORMA, não por subtração — é um subconjunto de `semCampanha`.
  const semPlataforma = nosDoNivel(v.arvore, "plataforma")
    .filter((n) => n.chave === "sem_plataforma")
    .reduce((s, n) => s + n.leads, 0);

  const porBalde = v.arvore
    .map((b) => `  ${ROTULO_BALDE[b.balde]}: ${inteiro(b.leads)} (${pct(b.fracao)})`)
    .join("\n");

  return [
    linha("Leads no período", inteiro(total)),
    linha("Com campanha identificada", `${inteiro(comCampanha)} (${pct(total > 0 ? comCampanha / total : null)})`),
    linha("Sem campanha identificada", `${inteiro(semCampanha)} (${pct(total > 0 ? semCampanha / total : null)})`),
    linha("  destes, sem nem plataforma", `${inteiro(semPlataforma)} (${pct(total > 0 ? semPlataforma / total : null)})`),
    "",
    "Por balde:",
    porBalde || "  (nenhum)",
    "",
    "Ler assim: 'sem campanha identificada' é lead que chegou mas cuja origem o sistema não",
    "conseguiu resolver abaixo do nível da plataforma. É esse número que precisa cair.",
  ].join("\n");
}

/** Junta cabeçalho e corpo. Toda ferramenta responde por aqui — ninguém devolve tabela nua. */
export function responder(v: VisaoMarketing, titulo: string, corpo: string): string {
  return `## ${titulo}\n\n${cabecalho(v)}\n\n${corpo}\n\n(gerado em ${v.geradoEm})`;
}

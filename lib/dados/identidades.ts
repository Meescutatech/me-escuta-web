import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Leitura do DE-PARA DO KOMMO (R18 · M3).
 *
 * Este de-para não é um conserto de dado: é o PRIMEIRO PASSO DO DESLIGAMENTO DO KOMMO (D3-dado).
 * Cada linha decide de quem são leads reais — um dos IDs carrega 355 deles, 62% do acervo — e a
 * decisão alimenta um backfill IRREVERSÍVEL (ledger append-only, sem delete).
 *
 * Por isso os dois contratos abaixo têm exigências que uma tela de configuração normal não tem:
 *   1. TRÊS ESTADOS, não dois. `vinculado` / `descartado` / `sem_decisao` — e o terceiro é a
 *      AUSÊNCIA de linha no banco. Colapsar `descartado` e `sem_decisao` faria "ainda não decidi"
 *      parecer "decidi que não tem dono", e o backfill rodaria sobre meia decisão.
 *   2. O PESO ao lado da decisão. Sem `leads`, escolher é cego: um ID com 355 e outro com 2
 *      parecem iguais numa lista.
 *   3. A COBERTURA como número, não como impressão — é o que autoriza ou BARRA o backfill.
 */

export type EstadoDePara = "vinculado" | "descartado" | "sem_decisao";

export interface LinhaDePara {
  idExterno: string;
  leads: number;
  idInterno: string | null;
  pessoaNome: string | null;
  pessoaEmail: string | null;
  estado: EstadoDePara;
  vinculadoEm: string | null;
}

export interface CoberturaDePara {
  leadsTotal: number;
  deIdVinculado: number;
  deIdDescartado: number;
  deIdSemLinha: number;
  semDonoOriginal: number;
  /** a soma dos quatro fecha em leadsTotal? É isto que libera o backfill. */
  fecha: boolean;
  /** houve leitura de verdade? `false` distingue "acervo vazio" de "não consegui ler". */
  lido: boolean;
}

/**
 * Uma linha por ID do Kommo PRESENTE NO ACERVO — não só os já decididos.
 *
 * A view parte da UNIÃO (`core.lead` ∪ `core.identidade_externa`) exatamente para que o ID sem
 * decisão apareça. Se ela partisse de `identidade_externa`, o que falta seria o que some da tela —
 * e o que falta é justamente o que bloqueia o backfill.
 */
export async function lerIdentidadesExternas(): Promise<LinhaDePara[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("v_de_para_kommo")
    .select("id_externo, leads, id_interno, pessoa_nome, pessoa_email, estado, vinculado_em")
    .order("leads", { ascending: false });

  if (error) throw new Error(`de-para: falha ao ler o acervo — ${error.message}`);

  return (data ?? []).map((l) => ({
    idExterno: String(l.id_externo),
    leads: Number(l.leads ?? 0),
    idInterno: (l.id_interno as string | null) ?? null,
    pessoaNome: (l.pessoa_nome as string | null) ?? null,
    pessoaEmail: (l.pessoa_email as string | null) ?? null,
    estado: l.estado as EstadoDePara,
    vinculadoEm: (l.vinculado_em as string | null) ?? null,
  }));
}

/**
 * Os quatro números do portão do backfill, e se eles fecham.
 *
 * `lido: false` existe porque **vazio e erro são telas diferentes** e a diferença importa aqui
 * mais que em qualquer outro lugar do produto: um erro de leitura que devolvesse quatro zeros
 * faria `fecha` dar `true` por vacuidade — e a tela liberaria o passo irreversível justamente
 * quando ela não conseguiu medir nada. É o ARB-R17-30 na fronteira da interface.
 */
export async function lerCoberturaDePara(): Promise<CoberturaDePara> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("v_cobertura_de_para")
    .select("leads_total, de_id_vinculado, de_id_descartado, de_id_sem_linha, sem_dono_original")
    .single();

  const vazio: CoberturaDePara = {
    leadsTotal: 0,
    deIdVinculado: 0,
    deIdDescartado: 0,
    deIdSemLinha: 0,
    semDonoOriginal: 0,
    fecha: false, // NUNCA true sem leitura: ver o comentário acima
    lido: false,
  };
  if (error || !data) return vazio;

  const c = {
    leadsTotal: Number(data.leads_total ?? 0),
    deIdVinculado: Number(data.de_id_vinculado ?? 0),
    deIdDescartado: Number(data.de_id_descartado ?? 0),
    deIdSemLinha: Number(data.de_id_sem_linha ?? 0),
    semDonoOriginal: Number(data.sem_dono_original ?? 0),
  };

  return {
    ...c,
    // Duas condições, e as duas são necessárias:
    //   · a soma fecha (nenhuma categoria escapou da contagem);
    //   · nenhum ID sem linha (nenhuma decisão pendente).
    // A primeira sozinha ficaria verde com o acervo inteiro indeciso, porque `de_id_sem_linha`
    // também entra na soma.
    fecha:
      c.leadsTotal > 0 &&
      c.deIdVinculado + c.deIdDescartado + c.deIdSemLinha + c.semDonoOriginal === c.leadsTotal &&
      c.deIdSemLinha === 0,
    lido: true,
  };
}

/** Membros ativos elegíveis a receber um vínculo. Lista VAZIA é estado de negócio, não erro. */
export async function lerElegiveisVinculo(): Promise<Array<{ id: string; nome: string; email: string }>> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("v_membro")
    .select("id, nome, email, ativo")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) throw new Error(`de-para: falha ao ler membros — ${error.message}`);
  return (data ?? []).map((u) => ({
    id: String(u.id),
    nome: String(u.nome ?? u.email ?? "(sem nome)"),
    email: String(u.email ?? ""),
  }));
}

export interface LeadsSemResponsavel {
  /** leads sem `dono_id` **e** sem `dono` legado — os órfãos de verdade. */
  orfaos: number;
  /** leads com `dono` do Kommo e `dono_id` nulo — NÃO são órfãos: são acervo aguardando o de-para. */
  aguardandoDePara: number;
  /** houve leitura? `false` distingue "nenhum órfão" de "não consegui contar". */
  lido: boolean;
}

/**
 * A faixa "Sem responsável" do /funil.
 *
 * DUAS CONTAGENS, e separá-las é o ponto inteiro desta função. Neste schema "sem responsável" tem
 * duas colunas (D3-dado item 3):
 *   `dono`    — text, DE ONDE VEIO (`kommo:13200916`). Procedência histórica.
 *   `dono_id` — uuid, QUEM É hoje.
 * Os 574 leads importados do Kommo têm `dono` preenchido e `dono_id` NULO, porque
 * `core.ator_usuario_id` não resolve `kommo:` — de propósito. Contá-los como órfãos faria a faixa
 * gritar 574 no dia 1 sobre leads que TÊM dono conhecido, só não traduzido; e a resposta certa
 * para eles não é "atribua alguém", é "termine o de-para".
 *
 * Foi exatamente essa confusão que produziu o E-182 no rodízio. Aqui ela aparece como duas linhas
 * diferentes na tela, com dois caminhos de saída diferentes.
 */
export async function lerLeadsSemResponsavel(): Promise<LeadsSemResponsavel> {
  const supabase = criarClienteServidor();
  const [orfaosRes, aguardandoRes] = await Promise.all([
    supabase
      .schema("core")
      .from("lead")
      .select("lead_id", { count: "exact", head: true })
      .is("dono_id", null)
      .is("dono", null),
    supabase
      .schema("core")
      .from("lead")
      .select("lead_id", { count: "exact", head: true })
      .is("dono_id", null)
      .like("dono", "kommo:%"),
  ]);

  if (orfaosRes.error || aguardandoRes.error) {
    // ZERO POR FALHA DE LEITURA É PIOR QUE NÃO MOSTRAR NADA: a faixa some, e sumiço lê-se como
    // "não há lead sem responsável" — que é a conclusão oposta à verdade quando a leitura falhou.
    return { orfaos: 0, aguardandoDePara: 0, lido: false };
  }

  return {
    orfaos: orfaosRes.count ?? 0,
    aguardandoDePara: aguardandoRes.count ?? 0,
    lido: true,
  };
}

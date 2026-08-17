/**
 * R23 · Trilha E (RF-15.5) — O QUE O PAINEL **NÃO** ESTÁ MEDINDO.
 *
 * Lógica PURA, sem I/O — mesma disciplina do resto de `dashboard-calculos.ts`.
 *
 * ── por que este arquivo existe ──────────────────────────────────────────────────────────────
 * No Kommo o campo Venda é R$ 0 em 12 das 13 etapas. Quem abre aquele funil lê treze zeros e
 * conclui que a operação não vende — quando o que aconteceu é que ninguém preenche o campo. O
 * zero não mentiu sozinho: mentiu porque estava no mesmo lugar, com a mesma cara, que um número
 * medido. A regra que sai daí, e que vale para o nosso painel: **um número que não foi medido não
 * pode ocupar o lugar de um número medido.**
 *
 * Isso é diferente do `null → "—"` que o painel já faz. O travessão diz "esta leitura falhou
 * agora"; a lacuna diz "esta pergunta não tem resposta no ledger, e não vai ter hoje". São duas
 * verdades diferentes, e o operador precisa das duas separadas: uma se resolve recarregando a
 * página, a outra não.
 *
 * Cada lacuna carrega o PORQUÊ. Uma lista de coisas ausentes sem o motivo vira decoração — o
 * motivo é o que permite alguém decidir se aquilo importa, e é o que impede a lacuna de virar
 * folclore ("acho que o painel não mede vendas") quando ninguém lembrar mais da causa.
 */

export type OrigemLacuna =
  /** Fora do escopo desta rodada por decisão — a spec cortou. */
  | "fora-de-escopo"
  /** O dado não existe no ledger: ninguém emite o evento, ou a coluna nunca foi preenchida. */
  | "dado-ausente"
  /** A fonte existe mas o app não a alcança (ex.: schema fora da Data API). */
  | "fonte-inalcancavel";

export interface Lacuna {
  titulo: string;
  /** Por que não está medido — em uma frase, no idioma da operação. */
  porque: string;
  origem: OrigemLacuna;
}

/** O que o painel precisa saber do mundo para decidir quais lacunas anunciar. */
export interface ContextoLacunas {
  /** `criado_em` do lead mais novo do ledger — a data da IMPORTAÇÃO, não a do Kommo. */
  ultimoLeadCriadoEm: string | null;
  /** A view de saúde do fluxo respondeu? (false enquanto a migration 0180 não estiver aplicada) */
  saudeFluxoDisponivel: boolean;
  /** Houve alguma decisão humana sobre sugestão? Sem nenhuma, a precisão não é régua, é ruído. */
  decisoesDeSugestao: number | null;
  /** O instante da leitura, para dizer há quanto tempo o ledger parou. */
  agora: Date;
}

/** Dias inteiros entre um instante e agora; null se a data não existe ou não parseia. */
export function diasDesde(iso: string | null, agora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86400_000));
}

/**
 * Acima disto, "0 novos hoje" deixou de ser notícia sobre a operação e virou notícia sobre a
 * ingestão. Uma semana é a folga que cobre um fim de semana longo sem alarme falso.
 */
export const DIAS_LEDGER_PARADO = 7;

/**
 * As lacunas do painel, dado o estado real da leitura.
 *
 * As duas primeiras são fixas — a spec cortou F16 e F17 do escopo (RF-15.5) e a decisão precisa
 * aparecer na tela, não só no documento. As demais são DERIVADAS do que foi medido: só entram na
 * lista quando são verdade naquele instante, porque uma lacuna que aparece mesmo depois de
 * resolvida ensina o operador a ignorar a lista inteira.
 */
export function lacunasDoPainel(ctx: ContextoLacunas): Lacuna[] {
  const lacunas: Lacuna[] = [
    {
      titulo: "Valor por etapa",
      porque:
        "Cortado desta rodada (F16). O campo de valor só é preenchido no fechamento — somar por " +
        "etapa hoje mostraria R$ 0 em quase todo o funil, que é o erro que o Kommo comete.",
      origem: "fora-de-escopo",
    },
    {
      titulo: "Atribuição de origem",
      porque: "Cortada desta rodada (F17). De onde veio o lead ainda não é rastreado até a venda.",
      origem: "fora-de-escopo",
    },
  ];

  // ── derivadas ──
  const diasParado = diasDesde(ctx.ultimoLeadCriadoEm, ctx.agora);
  if (diasParado != null && diasParado >= DIAS_LEDGER_PARADO) {
    lacunas.push({
      titulo: "Leads novos",
      porque:
        `Nenhum lead entrou no ledger há ${diasParado} dias. Os contadores de "novos hoje" e ` +
        `"últimos 7 dias" leem a data de IMPORTAÇÃO do lead, não a data em que ele surgiu — ` +
        `enquanto a ingestão estiver parada, o zero deles é sobre a importação, não sobre a operação.`,
      origem: "dado-ausente",
    });
    lacunas.push({
      titulo: "Funil do mês (agendadas · realizadas · testes · vendas)",
      porque:
        "Não é reproduzível a partir do ledger: o lead guarda só a data em que foi importado, e o " +
        "evento de criação não traz a data original. Sem ela não há recorte de mês nem coorte — o " +
        "que existe é o retrato de agora, por etapa.",
      origem: "dado-ausente",
    });
  }

  if (!ctx.saudeFluxoDisponivel) {
    lacunas.push({
      titulo: "Saúde do fluxo",
      porque:
        "A fonte existe (ops.v_saude_fluxo) mas ainda não está exposta à API — a migration 0180 " +
        "cria a passagem. Lag e falhas ficam sem leitura até lá; zero aqui pareceria saúde.",
      origem: "fonte-inalcancavel",
    });
  }

  if (ctx.decisoesDeSugestao === 0) {
    lacunas.push({
      titulo: "Precisão por agente",
      porque:
        "Nenhuma sugestão foi decidida ainda. Precisão sem decisão não é 0% — é pergunta sem resposta.",
      origem: "dado-ausente",
    });
  }

  return lacunas;
}

import type { LeadsSemResponsavel } from "@/lib/dados/identidades";
import { cn } from "@/lib/utils";

/**
 * "Sem responsável" do /funil (R18 · M3) — desde F5 (27/08), UM CHIP ao lado do contador, não
 * duas faixas de parágrafo acima do board.
 *
 * POR QUE CHIP E NÃO FILTRO — a diferença que decide se o item foi entregue: já existe
 * `SEM_RESPONSAVEL = "__sem__"` em `funil-filtros.ts`. Aquilo é FILTRO, e filtro depende de
 * alguém lembrar de ligá-lo. Este chip é VISÍVEL SEM NINGUÉM LIGAR NADA — só ficou do tamanho
 * do que diz. Os dois parágrafos de antes empurravam o board para baixo todo dia, e texto que
 * se lê todo dia deixa de ser lido.
 *
 * TRÊS ESTADOS, e nenhum deles é "não mostrar":
 *   · não lido  — a contagem falhou. Dizer isso é obrigatório: chip ausente lê-se como zero.
 *   · zero      — não ocupa lugar: silêncio é a resposta certa (mesma regra do "sem próxima ação").
 *   · > 0       — um número, com o caminho de saída de CADA categoria no tooltip e no link:
 *                 órfão → Membros (lotar alguém); aguardando de-para → Identidades externas
 *                 (o dono do Kommo existe, só não foi traduzido — atribuir à mão apagaria isso).
 */
export function ChipSemResponsavel({ dados }: { dados: LeadsSemResponsavel }) {
  if (!dados.lido) {
    return (
      <span
        role="alert"
        className="inline-flex items-center gap-1.5 rounded-full border border-vermelho-bd bg-vermelho-bg px-2.5 py-0.5 text-[11.5px] font-medium text-vermelho"
        title="A contagem de leads sem responsável falhou. Isto não quer dizer que não haja nenhum."
      >
        sem responsável: não contado
      </span>
    );
  }

  const { orfaos, aguardandoDePara } = dados;
  if (orfaos === 0 && aguardandoDePara === 0) return null;

  const partes: string[] = [];
  if (orfaos > 0) partes.push(`${orfaos} sem responsável — lote alguém em Membros ou atribua pelo card`);
  if (aguardandoDePara > 0)
    partes.push(`${aguardandoDePara} aguardando de-para — têm dono no Kommo, ainda sem conta aqui; resolva em Identidades externas`);
  const tooltip = partes.join(". ") + ".";

  // o link vai para onde a MAIOR fila se resolve; o tooltip explica as duas
  const href = orfaos >= aguardandoDePara ? "/configuracoes/membros" : "/configuracoes/identidades";
  const total = orfaos + aguardandoDePara;

  return (
    <a
      href={href}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors",
        "border-amarelo-bd bg-amarelo-bg text-amarelo hover:border-amarelo",
      )}
    >
      <span className="font-mono tabular-nums">{total}</span>
      <span>sem responsável</span>
      {aguardandoDePara > 0 && orfaos > 0 && (
        <span className="font-mono text-[10.5px] tabular-nums opacity-80">
          {orfaos}+{aguardandoDePara}
        </span>
      )}
      <span className="sr-only">. {tooltip}</span>
    </a>
  );
}

/** @deprecated F5: virou `ChipSemResponsavel`; mantido só para o import antigo não quebrar. */
export const FaixaSemResponsavel = ChipSemResponsavel;

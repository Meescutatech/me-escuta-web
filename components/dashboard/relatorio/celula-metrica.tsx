import { cn } from "@/lib/utils";
import type { BarraMetrica, TomMetrica } from "./formato";

export type { BarraMetrica, TomMetrica };

/** Largura fixa do trilho — barras de linhas diferentes só se comparam quando começam e terminam no mesmo lugar. */
export const LARGURA_TRILHO = 92;

/** Altura da linha quando a célula carrega valor + barra. */
export const ALTURA_LINHA_METRICA = 52;

const COR_BARRA: Record<TomMetrica, string> = {
  bom: "var(--chart-1)",
  atencao: "var(--chart-4)",
  ruim: "var(--chart-5)",
  neutro: "var(--chart-2)",
};

/** Só os extremos recebem cor no número; o meio fica neutro para eles aparecerem. */
const COR_TEXTO: Record<TomMetrica, string> = {
  bom: "text-success-ink",
  atencao: "text-foreground",
  ruim: "text-danger-ink",
  neutro: "text-foreground",
};

/**
 * Trilho da barra. **Sem marca de meta**: a referência é sempre um número que existe nos dados
 * (a média da própria equipe, o maior valor do recorte) e aparece escrita no rodapé da tabela.
 */
export function TrilhoMetrica({ barra, titulo }: { barra: BarraMetrica; titulo?: string }) {
  return (
    <span data-slot="trilho-metrica" className="block h-[5px] overflow-hidden rounded-full bg-muted" style={{ width: LARGURA_TRILHO }} title={titulo}>
      <span
        className="block h-full rounded-full transition-[width]"
        style={{ width: `${Math.max(barra.fracao * 100, barra.fracao > 0 ? 2 : 0)}%`, backgroundColor: COR_BARRA[barra.tom] }}
      />
    </span>
  );
}

/**
 * Célula numérica das tabelas de pessoa/canal: o número em cima, a barra embaixo, tudo à direita.
 */
export function CelulaMetrica({
  valor,
  tom = "neutro",
  secundario,
  barra,
  tituloBarra,
}: {
  valor: string;
  tom?: TomMetrica;
  /** Número menor à esquerda do principal (uma fração, um percentual). */
  secundario?: string;
  barra?: BarraMetrica | null;
  tituloBarra?: string;
}) {
  return (
    <span data-slot="celula-metrica" className="flex w-full flex-col items-end gap-1.5">
      <span className="flex items-baseline gap-1.5">
        {secundario ? <span className="text-ui-11 text-muted-foreground tabular-nums">{secundario}</span> : null}
        <span className={cn("text-ui-13 font-medium tabular-nums", COR_TEXTO[tom])}>{valor}</span>
      </span>
      {barra ? <TrilhoMetrica barra={barra} titulo={tituloBarra} /> : null}
    </span>
  );
}

"use client";

import { cn } from "@/lib/utils";

/*
 * W-D6 (10/09) · "Pré-venda · Pós-venda · Todos" — o recorte do admin sobre o funil inteiro.
 *
 * É um SEGMENTED CONTROL discreto (trilho `bg-hover`, segmento ativo em branco com hairline), sem
 * ícone e sem badge, no idioma dos chips do cabeçalho do board. Não confundir com o seletor de
 * departamento do header: aquele é ESCOPO (troca o mundo, D6-f, sem "Todos" de propósito); este é
 * FILTRO de quem já vê tudo — por isso "Todos" existe aqui e não lá, e por isso o componente só
 * monta para `admin`/`owner`. Para `membro` ele SOME: a Sara já está dentro de Pré-venda pelo
 * escopo, e um seletor com uma opção só seria affordance morto.
 *
 * O padrão do trilho é o `TabsList variant="default"` do preset (rounded + bg-muted + p-[3px]),
 * reduzido para a altura dos chips vizinhos (28px).
 */
export interface OpcaoSegmento {
  chave: string | null;
  rotulo: string;
}

export const SEGMENTOS_DEPARTAMENTO: OpcaoSegmento[] = [
  { chave: "pre_venda", rotulo: "Pré-venda" },
  { chave: "pos_venda", rotulo: "Pós-venda" },
  { chave: null, rotulo: "Todos" },
];

export function SegmentoDepartamento({
  valor,
  onChange,
  opcoes = SEGMENTOS_DEPARTAMENTO,
}: {
  valor: string | null;
  onChange: (chave: string | null) => void;
  opcoes?: OpcaoSegmento[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Recorte por departamento"
      className="flex h-[30px] items-center gap-px rounded-[7px] bg-hover p-[3px]"
    >
      {opcoes.map((o) => {
        const ativo = o.chave === valor;
        return (
          <button
            key={o.rotulo}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.chave)}
            className={cn(
              "h-full rounded-[5px] px-2.5 text-[12.5px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50",
              ativo
                ? "bg-branco font-medium text-tinta shadow-[0_1px_2px_rgba(31,35,40,.08)]"
                : "text-suave hover:text-tinta",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/**
 * KIT R10 traduzido para os tokens R9 do `tailwind.config.ts`. As três telas (F9, F12, F14) usam
 * ESTAS peças — é o que as mantém sendo um sistema só em vez de três telas parecidas.
 *
 * Por que Tailwind e não o CSS do mockup colado: o repositório inteiro já é Tailwind sobre os
 * tokens R9, e os mesmos valores existem nomeados (`laranja`, `navy`, `tinta`, `linha`, `hover`,
 * `board`, `suave`, `mute`, `verde`, `vermelho`, `amarelo`). Onde o kit usa um tom que não tem
 * token exato (os `-cl` das faixas), o valor entra literal — igual ao mockup, byte a byte.
 *
 * Regras do kit que estas peças carregam:
 *  · a hairline `--linha` é a ÚNICA borda; sombra só em menu aberto;
 *  · UM acento: laranja = ação e foco · navy = identidade e estado ativo;
 *  · verde/vermelho/âmbar SÓ semântica;
 *  · dado de máquina em mono, número que muda em `tabular-nums`.
 */

import type { ReactNode } from "react";

export function Cabecalho({
  titulo,
  contador,
  descricao,
  acoes,
  voltar,
}: {
  titulo: ReactNode;
  contador?: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  voltar?: ReactNode;
}) {
  return (
    <div className="mb-[18px]">
      {voltar}
      <div className="flex items-baseline gap-3">
        <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">{titulo}</h1>
        {contador ? (
          <span className="ml-auto font-mono text-[12.5px] tabular-nums text-suave">{contador}</span>
        ) : null}
      </div>
      {descricao ? <p className="mt-1 text-[13px] text-suave">{descricao}</p> : null}
      {acoes ? <div className="mt-3.5 flex items-center gap-2.5">{acoes}</div> : null}
      <hr className="mt-3.5 h-px border-0 bg-linha" />
    </div>
  );
}

export type TomFaixa = "erro" | "info" | "ok" | "ambar";

const TOM: Record<TomFaixa, string> = {
  erro: "bg-[#FBEFED] text-vermelho",
  info: "bg-[#EAECF5] text-navy",
  ok: "bg-[#EDF5F0] text-verde",
  ambar: "bg-[#FBF3E2] text-amarelo",
};

/**
 * Faixa de estado. Não há toast neste app, de propósito: recado que some sozinho é recado que
 * ninguém leu. `role="alert"` só no tom de erro — anunciar informação em voz alta atrapalha.
 */
export function Faixa({
  tom,
  children,
  acao,
}: {
  tom: TomFaixa;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={`mb-3 flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px] ${TOM[tom]}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {acao ? <span className="ml-auto whitespace-nowrap font-medium underline">{acao}</span> : null}
    </div>
  );
}

export const BTN = {
  primario:
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-laranja px-3 text-[13px] font-semibold text-white hover:bg-laranja-esc disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-laranja",
  secundario:
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-linha bg-branco px-3 text-[13px] font-medium text-tinta hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-branco",
  texto:
    "inline-flex h-8 items-center justify-center whitespace-nowrap px-1 text-[13px] font-medium text-suave hover:text-tinta hover:underline disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:no-underline",
  acento:
    "inline-flex h-8 items-center justify-center whitespace-nowrap px-1 text-[13px] font-medium text-laranja-esc hover:underline disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:no-underline",
  mini: "inline-flex h-6 items-center whitespace-nowrap rounded-md border border-linha bg-branco px-2 text-[12.5px] text-tinta hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45",
  perigo:
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-linha bg-branco px-3 text-[13px] font-medium text-vermelho hover:bg-[#FBEFED] disabled:cursor-not-allowed disabled:opacity-45",
};

export const ENTRADA =
  "h-8 w-full rounded-md border border-linha bg-branco px-2.5 text-[13.5px] placeholder:text-mute focus:border-navy focus:outline-none focus:ring-2 focus:ring-[#EAECF5]";
export const AREA =
  "w-full resize-y rounded-md border border-linha bg-branco px-2.5 py-2 text-[13.5px] leading-normal placeholder:text-mute focus:border-navy focus:outline-none focus:ring-2 focus:ring-[#EAECF5]";

export function Secao({
  rotulo,
  contador,
  children,
  rodape,
}: {
  rotulo: string;
  contador?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="flex items-center gap-2.5 border-b border-linha pb-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-mute">{rotulo}</span>
        {contador !== undefined ? (
          <span className="ml-auto font-mono text-[11.5px] tabular-nums text-suave">{contador}</span>
        ) : null}
      </div>
      {children}
      {rodape ? <div className="flex justify-end px-2 pt-2.5">{rodape}</div> : null}
    </section>
  );
}

/** Linha-fantasma do carregando: copia o BOX MODEL da linha real, para o dado não empurrar nada. */
export function Fantasma({ larguras }: { larguras: number[] }) {
  return (
    <div aria-hidden="true" className="flex h-12 items-center gap-3 border-b border-linha px-2">
      {larguras.map((l, i) => (
        <i
          key={i}
          style={{ width: l }}
          className="block h-[9px] animate-pulse rounded-[3px] bg-hover"
        />
      ))}
    </div>
  );
}

export function BlocoVazio({
  titulo,
  apoio,
  acao,
}: {
  titulo: string;
  apoio?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <h2 className="text-[14px] font-medium text-tinta">{titulo}</h2>
      {apoio ? <p className="mb-4 mt-1 text-[13px] text-suave">{apoio}</p> : null}
      {acao}
    </div>
  );
}

/**
 * Barra de publicação: aparece SÓ quando há alteração não publicada. Fica `sticky` no rodapé da
 * coluna, e é a única superfície do app que segue o olho — porque é a única que responde "o que
 * acontece se eu sair agora".
 */
export function BarraPublicacao({ texto, acoes }: { texto: ReactNode; acoes: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-8 mt-6 flex items-center gap-3 border-t border-linha bg-branco px-8 py-3 text-[13px] text-suave max-md:-mx-4 max-md:px-4">
      <span>{texto}</span>
      <div className="ml-auto flex items-center gap-2.5">{acoes}</div>
    </div>
  );
}

export function Dialogo({
  titulo,
  children,
  acoes,
  largura = 440,
  aoFechar,
}: {
  titulo: ReactNode;
  children?: ReactNode;
  acoes: ReactNode;
  largura?: number;
  aoFechar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(31,35,40,.28)] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: largura }}
        className="w-full rounded-[10px] bg-branco p-5 shadow-forte"
      >
        <h2 className="mb-1.5 text-[15px] font-semibold text-tinta">{titulo}</h2>
        {children}
        <div className="mt-4 flex items-center justify-end gap-2.5">{acoes}</div>
      </div>
    </div>
  );
}

export function Chip({
  tom = "neutro",
  children,
}: {
  tom?: "neutro" | "navy" | "ambar" | "laranja";
  children: ReactNode;
}) {
  const cor =
    tom === "navy"
      ? "bg-[#EAECF5] text-navy border-transparent"
      : tom === "ambar"
        ? "bg-[#FBF3E2] text-amarelo border-transparent"
        : tom === "laranja"
          ? "bg-laranja-cl text-laranja-esc border-transparent"
          : "bg-board text-suave border-linha";
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium ${cor}`}>
      {children}
    </span>
  );
}

/** Data curta em PT-BR a partir de ISO. Entrada ilegível devolve traço — nunca "Invalid Date". */
export function dataCurta(iso: string | null | undefined): string {
  const t = Date.parse((iso ?? "").trim());
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function dataHora(iso: string | null | undefined): string {
  const t = Date.parse((iso ?? "").trim());
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

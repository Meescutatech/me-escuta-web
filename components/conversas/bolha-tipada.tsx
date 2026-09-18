"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  FileArchiveIcon,
  FileIcon,
  MapPinIcon,
  PlayIcon,
  UserRoundIcon,
} from "lucide-react";
import { obterUrlMidia } from "@/app/(app)/conversas/actions";
import { nomeDoDocumento, temDocumentoBaixavel } from "@/lib/conversas/midia";
import { cn } from "@/lib/utils";
import type { Mensagem } from "@/lib/dados/conversas";

/**
 * BOLHAS TIPADAS (W-D2, 10/09) — o que a `ConteudoBolha` do inbox não desenhava: vídeo,
 * documento, figurinha, botões/lista, localização, contato, mais a CITAÇÃO no topo da bolha, os
 * chips de REAÇÃO colados embaixo e a bolha PROGRAMADA (ainda não enviada).
 *
 * Arquitetura roubada do LiderHub `message-bubble/bodies.tsx` (um corpo por tipo, caixa de mídia
 * fixa, chip de opção escolhida com ícone Check, citação `border-l-2` que salta para a original) e
 * `message-reaction-chips.tsx` (chip `rounded-full border px-2 py-1 text-xs`, `reactedByMe`).
 *
 * Só desenha quando o campo tipado existe na `Mensagem`. Sem ele, o inbox mantém o rótulo antigo
 * ("Documento recebido").
 *
 * EXCEÇÃO, e é o conserto do B1 (18/09/2026): `BolhaDocumento` NÃO depende mais do campo tipado.
 * Ela lê a projeção real (`midia_caminho`/`midia_mime`), que é o que o runtime preenche, e baixa de
 * verdade. Antes disto ela exigia `m.documento` — populado APENAS em `lib/ensaio/fixtures` — e o
 * botão de download não tinha `onClick`: parecia um download e não era um.
 */

export const CAIXA_MIDIA = "w-[260px] max-w-full";

// ─────────────────────────── citação ───────────────────────────

export function BolhaCitada({ citada, saida }: { citada: NonNullable<Mensagem["citada"]>; saida: boolean }) {
  return (
    <button
      type="button"
      disabled={!citada.id}
      onClick={() => {
        if (!citada.id) return;
        document.getElementById(`msg-${citada.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className={cn(
        "mb-1.5 flex w-full max-w-full flex-col rounded-md border-l-2 px-2.5 py-1.5 text-left",
        saida ? "border-navy/50 bg-branco/60" : "border-laranja/60 bg-board",
        citada.id ? "cursor-pointer hover:bg-hover/60" : "cursor-default",
      )}
      aria-label={`Respondendo a ${citada.autor}: ${citada.corpo}`}
    >
      <span className={cn("text-[0.7rem] font-semibold", saida ? "text-navy" : "text-laranja-esc")}>{citada.autor}</span>
      <span className="line-clamp-2 text-[0.78rem] leading-snug text-suave">{citada.corpo}</span>
    </button>
  );
}

// ─────────────────────────── reações ───────────────────────────

export function ReacoesChips({ reacoes, saida }: { reacoes: NonNullable<Mensagem["reacoes"]>; saida: boolean }) {
  if (reacoes.length === 0) return null;
  const agrupadas = new Map<string, { qtd: number; minha: boolean }>();
  for (const r of reacoes) {
    const g = agrupadas.get(r.emoji) ?? { qtd: 0, minha: false };
    g.qtd++;
    if (r.de === "nos") g.minha = true;
    agrupadas.set(r.emoji, g);
  }
  return (
    <div className={cn("-mt-2 flex gap-1 px-1", saida ? "justify-end" : "justify-start")}>
      {Array.from(agrupadas.entries()).map(([emoji, g]) => (
        <span
          key={emoji}
          title={g.minha ? "sua reação" : "reação do cliente"}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-branco px-1.5 py-px text-[0.78rem] leading-tight shadow-[0_1px_2px_rgba(31,35,40,.06)]",
            g.minha ? "border-laranja/40 bg-laranja-cl" : "border-linha",
          )}
        >
          <span aria-hidden>{emoji}</span>
          {g.qtd > 1 && <span className="text-[0.66rem] tabular-nums text-suave">{g.qtd}</span>}
          <span className="sr-only">{g.minha ? "você reagiu com" : "cliente reagiu com"} {emoji}</span>
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────── programada ───────────────────────────

export function RotuloProgramada({ quando }: { quando: string }) {
  const d = new Date(quando);
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const dia = mesmoDia(d, hoje) ? "hoje" : mesmoDia(d, amanha) ? "amanhã" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <span className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-amarelo">
      <ClockIcon className="size-3" />
      sai {dia} às {hora}
    </span>
  );
}

// ─────────────────────────── corpos por tipo ───────────────────────────

export function BolhaVideo({ m }: { m: Mensagem }) {
  const [tocando, setTocando] = useState(false);
  const dur = m.duracao_s ? `${Math.floor(m.duracao_s / 60)}:${String(m.duracao_s % 60).padStart(2, "0")}` : null;
  return (
    <span className={cn("flex flex-col gap-1.5", CAIXA_MIDIA)}>
      <button
        type="button"
        onClick={() => setTocando((v) => !v)}
        className="group relative block aspect-video w-full overflow-hidden rounded-[9px] bg-navy"
        aria-label={tocando ? "Pausar vídeo" : "Reproduzir vídeo"}
      >
        {m.midia_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.midia_url} alt="" className={cn("size-full object-cover transition-opacity", tocando && "opacity-60")} />
        ) : null}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-11 place-items-center rounded-full bg-branco/90 text-navy shadow-forte transition-transform group-hover:scale-105">
            {tocando ? <span className="h-3.5 w-3 border-x-[3px] border-navy" aria-hidden /> : <PlayIcon className="ml-0.5 size-5 fill-current" />}
          </span>
        </span>
        {dur && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-tinta/70 px-1.5 py-px font-mono text-[0.66rem] tabular-nums text-branco">
            {dur}
          </span>
        )}
      </button>
      {m.corpo && <span className="text-[0.84rem] leading-relaxed">{m.corpo}</span>}
    </span>
  );
}

const ICONE_FAMILIA: Array<[RegExp, typeof FileIcon, string]> = [
  [/pdf/, FileTextIcon, "PDF"],
  [/sheet|excel|csv/, FileSpreadsheetIcon, "Planilha"],
  [/zip|rar|7z|compressed/, FileArchiveIcon, "Arquivo compactado"],
  [/word|document/, FileTextIcon, "Documento"],
];

/**
 * BOLHA DE DOCUMENTO — a única bolha de mídia que BAIXA em vez de tocar ou mostrar.
 *
 * Conserta os 15 documentos do canal OFICIAL junto com os do Lite: os dois estavam no mesmo buraco,
 * e é por isso que a fono não abria o PDF por canal nenhum.
 *
 * Três estados, e nenhum deles mente:
 *   · sem `midia_caminho` — não renderiza; o inbox mantém "Documento recebido". A guarda funcionando.
 *   · assinando a URL — o botão fica desabilitado e diz que está preparando. Âncora sem `href` é
 *     um link que não navega, e um link que não navega é o defeito que estamos consertando.
 *   · pronto — âncora de verdade, com `download`, que salva o arquivo.
 */
export function BolhaDocumento({ m }: { m: Mensagem }) {
  const baixavel = temDocumentoBaixavel(m);
  const caminho = m.midia_caminho?.trim() ?? "";
  // O nome do campo tipado (ensaio) ganha do derivado; na projeção real ele não existe e o nome sai
  // do caminho — `<id>.pdf` (D-B1-c: sem migration para o nome original, por enquanto).
  const nome = m.documento?.nome ?? nomeDoDocumento(caminho);
  const mime = m.documento?.mime ?? m.midia_mime ?? "";
  const [Icone, familia] = ICONE_FAMILIA.find(([re]) => re.test(mime))?.slice(1) as [typeof FileIcon, string] | undefined ?? [FileIcon, "Arquivo"];

  const [url, setUrl] = useState<string | null>(m.midia_url ?? null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!baixavel) return;
    let vivo = true;
    setErro(false);
    // Pré-assinada no servidor pelo batch da thread (`caminhosParaAssinar`): usa direto, sem uma
    // server action por bolha — que o React roda em SÉRIE no cliente.
    if (m.midia_url) {
      setUrl(m.midia_url);
      return;
    }
    setUrl(null);
    obterUrlMidia(caminho)
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.url) setUrl(r.url);
        else setErro(true);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [baixavel, caminho, m.midia_url]);

  // Sem caminho não há o que baixar: o inbox mantém o rótulo honesto. Ver o cabeçalho.
  if (!baixavel && !m.documento) return null;

  const conteudo = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-hover text-suave">
        <Icone className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.84rem] font-medium text-tinta">{nome}</span>
        <span className="block text-[0.7rem] text-mute">
          {erro
            ? "não deu pra preparar o download — reabra a conversa"
            : !url && baixavel
              ? "preparando o download…"
              : [familia, m.documento?.tamanho].filter(Boolean).join(" · ")}
        </span>
      </span>
      <DownloadIcon className={cn("size-4 shrink-0", url ? "text-suave" : "text-mute")} />
    </>
  );

  const caixa = "flex w-full items-center gap-2.5 rounded-[9px] border border-linha bg-branco/70 px-2.5 py-2 text-left";

  return (
    <span className={cn("flex flex-col gap-1.5", CAIXA_MIDIA)}>
      {url ? (
        <a
          href={url}
          download={nome}
          // A signed URL é de outra origem; sem isto o navegador pode abrir no lugar de salvar.
          rel="noopener"
          className={cn(caixa, "transition-colors hover:bg-branco focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy")}
          aria-label={`Baixar ${nome}`}
        >
          {conteudo}
        </a>
      ) : (
        <span className={cn(caixa, "opacity-70")} aria-busy={!erro} aria-label={erro ? `${nome}: download indisponível` : `Preparando ${nome}`}>
          {conteudo}
        </span>
      )}
      {m.corpo && <span className="text-[0.84rem] leading-relaxed">{m.corpo}</span>}
    </span>
  );
}

export function BolhaFigurinha({ m }: { m: Mensagem }) {
  return m.midia_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.midia_url} alt="Figurinha" className="size-[120px] object-contain" />
  ) : (
    <span className="text-[0.76rem] italic text-mute">figurinha</span>
  );
}

export function BolhaInterativa({ m }: { m: Mensagem }) {
  const i = m.interativo!;
  // resposta do cliente: um chip com a opção escolhida
  if (i.escolhida && i.opcoes.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-linha bg-branco px-2 py-1 text-[0.84rem] text-tinta">
        <CheckIcon className="size-3.5 text-verde" />
        <span className="sr-only">Opção escolhida: </span>
        {i.escolhida}
      </span>
    );
  }
  // mensagem com botões: pergunta + lista de opções
  return (
    <span className="flex flex-col gap-2">
      {m.corpo && <span>{m.corpo}</span>}
      <span className="flex flex-col gap-1">
        {i.opcoes.map((o) => (
          <span
            key={o}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-center text-[0.82rem] font-medium",
              i.escolhida === o ? "border-verde-bd bg-verde-bg text-verde" : "border-linha bg-branco text-navy",
            )}
          >
            {o}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Localização (Diogo, 22:40): NÃO desenha mapa — o mapa seria fixture, e mapa falso mente. Pino,
 * nome, endereço e o link "abrir no mapa", que é o que o WhatsApp entrega de verdade.
 */
export function BolhaLocalizacao({ m }: { m: Mensagem }) {
  const l = m.localizacao!;
  return (
    <span className={cn("flex items-start gap-2", CAIXA_MIDIA)}>
      <MapPinIcon className="mt-0.5 size-4 shrink-0 text-suave" strokeWidth={2} />
      <span className="min-w-0 flex-1">
        {l.nome && <span className="block text-[0.84rem] font-medium text-tinta">{l.nome}</span>}
        <span className="block text-[0.78rem] leading-snug text-suave">{l.endereco}</span>
        <a
          href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-block text-[0.76rem] font-medium text-navy underline-offset-2 hover:underline"
        >
          abrir no mapa
        </a>
      </span>
    </span>
  );
}

/** Contato (Diogo, 22:40): uma linha — nome, telefone e "salvar" como texto. */
export function BolhaContato({ m }: { m: Mensagem }) {
  const c = m.contato!;
  return (
    <span className={cn("flex items-center gap-2", CAIXA_MIDIA)}>
      <UserRoundIcon className="size-4 shrink-0 text-suave" strokeWidth={2} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.84rem] font-medium text-tinta">{c.nome}</span>
        <span className="block font-mono text-[0.74rem] tabular-nums text-suave">{c.telefone}</span>
      </span>
      <button type="button" className="shrink-0 text-[0.76rem] font-medium text-navy underline-offset-2 hover:underline">
        salvar
      </button>
    </span>
  );
}

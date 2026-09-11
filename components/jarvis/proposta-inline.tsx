"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";
import { linhaDoEstado, prazoUrgente, tempoDesde, textoDoOriginal, textoPrazo } from "./partes";
import {
  ROTULO_MOTIVO,
  ROTULO_PRAZO,
  ehPrazoCurto,
  type AjusteProposta,
  type MotivoDescarte,
  type Pessoa,
  type PrazoCurto,
  type PropostaJarvis,
} from "./tipos";

/**
 * A NOTA DO JARVIS NO FIO — a escolhida (Diogo, 10/09/2026 22:40: arco + sem lateral; "bem
 * minimalista, clean — ele é o Sistema").
 *
 * Quieta e tipográfica, referência Linear / Fin / Notion AI. O arco é a assinatura — o nome
 * "Jarvis" não se repete ao lado dele. Cinco linhas, cada uma com um tamanho:
 *
 *   ◠ sugere uma tarefa · Maria Aparecida · há 12 min     12px, muted, uma linha
 *   Ligar para Maria e confirmar a audiometria de sexta   15px, medium, foreground
 *   o porquê, com o trecho do paciente em itálico          13px, muted  (+ "ver no fio")
 *   Hoje · Sara                                            12px, muted
 *   [Aceitar]  Ajustar  Descartar                          Button sm · texto muted
 *
 * Fundo `muted/30`, hairline `border/60`, raio md. Sem rótulo em caixa alta, sem lateral, sem
 * selo. Estados decididos (aceita / ajustada / descartada / feita) COLAPSAM numa linha —
 * "Aceita por Sara · 14:32 · ver tarefa" — que abre a proposta original ao clique. Quem decide
 * é sempre pessoa.
 */

export interface PropostaInlineProps {
  proposta: PropostaJarvis;
  /** mostra o nome do lead no cabeçalho (fora do fio, em /tarefas) */
  mostrarLead?: boolean;
  responsaveis?: Pessoa[];
  onIrAoTrecho?: (mensagemId: string | null) => void;
  hrefTrecho?: string | null;
  hrefTarefa?: string | null;
  onAceitar?: (proposta: PropostaJarvis, ajuste: AjusteProposta | null) => void;
  onDescartar?: (proposta: PropostaJarvis, motivo: MotivoDescarte, observacao: string | null) => void;
  somenteLeitura?: boolean;
  modoInicial?: "ver" | "ajustar" | "descartar";
  onVoltar?: () => void;
  agoraMs?: number;
  className?: string;
  /** aceitas e IGNORADAS — a escolha do Diogo travou arco + sem lateral; ficam para não quebrar quem já passa */
  marca?: string;
  variante?: string;
}

const CAIXA = "rounded-md border border-border/60 bg-muted/30";
const LINK = "text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline";

export function PropostaJarvisInline({
  proposta: p,
  mostrarLead = false,
  responsaveis = [],
  onIrAoTrecho,
  hrefTrecho,
  hrefTarefa,
  onAceitar,
  onDescartar,
  somenteLeitura = false,
  modoInicial = "ver",
  onVoltar,
  agoraMs,
  className,
}: PropostaInlineProps) {
  const [modo, setModo] = useState<"ver" | "ajustar" | "descartar">(modoInicial);
  const [ajuste, setAjuste] = useState<AjusteProposta>({});
  const [motivo, setMotivo] = useState<MotivoDescarte | null>(null);
  const [observacao, setObservacao] = useState("");
  const [aberta, setAberta] = useState(false);
  const mov = useMovimento();

  const agora = agoraMs ?? Date.now();
  const fazer = ajuste.fazer ?? p.fazer;
  const prazo = ajuste.prazo === undefined ? p.prazo : ajuste.prazo;
  const responsavelId = ajuste.responsavel_id === undefined ? p.responsavel_id : ajuste.responsavel_id;
  const responsavelNome = ajuste.responsavel_nome === undefined ? p.responsavel_nome : ajuste.responsavel_nome;
  const houveAjuste =
    fazer.trim() !== p.fazer.trim() || (prazo ?? null) !== (p.prazo ?? null) || (responsavelId ?? null) !== (p.responsavel_id ?? null);

  // ── decidida: uma linha, que abre a proposta original ao clique ────────────────────────────
  if (p.estado !== "proposta") {
    const feitaOuAceita = p.estado !== "descartada";
    const original = textoDoOriginal(p);
    return (
      <div className={cn(CAIXA, "px-3 py-2", className)} aria-label={`Proposta do Jarvis — ${linhaDoEstado(p)}`}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted-foreground">
          <MarcaJarvis tamanho={16} />
          {feitaOuAceita && <CheckIcon className="size-3.5 text-success-ink" strokeWidth={2.25} aria-hidden />}
          <span>{linhaDoEstado(p)}</span>
          {feitaOuAceita && hrefTarefa && (
            <>
              <span aria-hidden>·</span>
              <a href={hrefTarefa} className={LINK}>
                ver tarefa
              </a>
            </>
          )}
          <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className={cn(LINK, "ml-auto")}>
            {aberta ? "fechar" : "ver proposta"}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {aberta && (
            <motion.div key="proposta" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
              <div className="mt-2 border-t border-border/60 pt-2">
                <p className={cn("text-[13.5px] font-medium leading-snug text-foreground", p.estado === "descartada" && "text-muted-foreground line-through")}>{p.fazer}</p>
                {original && <p className="mt-0.5 text-[12px] text-muted-foreground">{original}</p>}
                <p className="mt-1 text-[12.5px] leading-normal text-muted-foreground">
                  {p.por_que}
                  {p.trecho && <em> “{p.trecho}”</em>}
                </p>
                {p.observacao_descarte && <p className="mt-1 text-[12px] text-muted-foreground">motivo: {p.observacao_descarte}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── proposta: as cinco linhas ───────────────────────────────────────────────────────────────
  const editando = modo === "ajustar";
  const acoes = !somenteLeitura;

  return (
    <article className={cn(CAIXA, "px-3 py-2.5", className)} aria-label="Proposta do Jarvis esperando decisão">
      <header className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
        <MarcaJarvis tamanho={16} rotulo="Jarvis" />
        <span>sugere uma tarefa</span>
        {mostrarLead && p.lead_nome && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate text-foreground">{p.lead_nome}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <time dateTime={p.criado_em} className="shrink-0">
          {tempoDesde(p.criado_em, agora)}
        </time>
      </header>

      {editando ? (
        <input
          autoFocus
          value={fazer}
          onChange={(e) => setAjuste((a) => ({ ...a, fazer: e.target.value }))}
          aria-label="Ajustar o que fazer"
          maxLength={160}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[15px] font-medium leading-snug text-foreground outline-none focus:border-ring"
        />
      ) : (
        <p className="mt-1.5 text-[15px] font-medium leading-snug text-foreground">{fazer}</p>
      )}

      <p className="mt-1 text-[13px] leading-normal text-muted-foreground">
        {p.por_que}
        {p.trecho && (
          <>
            {" "}
            <em>“{p.trecho}”</em>
            {(hrefTrecho || onIrAoTrecho) && (
              <>
                {" "}
                {hrefTrecho ? (
                  <a href={hrefTrecho} className={LINK}>
                    ver no fio
                  </a>
                ) : (
                  <button type="button" onClick={() => onIrAoTrecho?.(p.trecho_mensagem_id ?? null)} className={LINK}>
                    ver no fio
                  </button>
                )}
              </>
            )}
          </>
        )}
      </p>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
        {editando ? (
          <span role="radiogroup" aria-label="Prazo" className="inline-flex items-center gap-1.5">
            {(Object.keys(ROTULO_PRAZO) as PrazoCurto[]).map((k, i) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                <button
                  type="button"
                  role="radio"
                  aria-checked={prazo === k}
                  onClick={() => setAjuste((a) => ({ ...a, prazo: k }))}
                  className={cn("underline-offset-[3px] hover:text-foreground", prazo === k && "font-medium text-foreground underline")}
                >
                  {ROTULO_PRAZO[k]}
                </button>
              </span>
            ))}
            {!ehPrazoCurto(prazo) && prazo && <span>({textoPrazo(prazo)})</span>}
          </span>
        ) : (
          <span className={cn(prazoUrgente(prazo, agora) && "font-medium text-foreground")}>{textoPrazo(prazo)}</span>
        )}
        <span aria-hidden>·</span>
        {editando && responsaveis.length > 0 ? (
          <select
            value={responsavelId ?? ""}
            onChange={(e) => {
              const r = responsaveis.find((x) => x.id === e.target.value);
              setAjuste((a) => ({ ...a, responsavel_id: e.target.value || null, responsavel_nome: r?.nome.split(" ")[0] ?? null }));
            }}
            aria-label="Responsável"
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[12px] text-foreground outline-none focus:border-ring"
          >
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        ) : (
          <span>{responsavelNome ?? "sem responsável"}</span>
        )}
      </p>

      {acoes && modo !== "descartar" && (
        <footer className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
          <Button
            size="sm"
            onClick={() => {
              onAceitar?.(p, houveAjuste ? { fazer, prazo, responsavel_id: responsavelId, responsavel_nome: responsavelNome } : null);
              setModo("ver");
            }}
          >
            {editando && houveAjuste ? "Aceitar com ajustes" : "Aceitar"}
          </Button>
          {editando ? (
            <button
              type="button"
              onClick={() => {
                setAjuste({});
                onVoltar ? onVoltar() : setModo("ver");
              }}
              className={LINK}
            >
              Cancelar
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setModo("ajustar")} className={LINK}>
                Ajustar
              </button>
              <button type="button" onClick={() => setModo("descartar")} className={LINK}>
                Descartar
              </button>
            </>
          )}
        </footer>
      )}

      {acoes && modo === "descartar" && (
        <footer className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-muted-foreground">
          <span>Por quê?</span>
          <span role="radiogroup" aria-label="Motivo do descarte" className="inline-flex flex-wrap items-center gap-1.5">
            {(Object.keys(ROTULO_MOTIVO) as MotivoDescarte[]).map((m, i) => (
              <span key={m} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                <button
                  type="button"
                  role="radio"
                  aria-checked={motivo === m}
                  onClick={() => setMotivo(m)}
                  className={cn("underline-offset-[3px] hover:text-foreground", motivo === m && "font-medium text-foreground underline")}
                >
                  {ROTULO_MOTIVO[m]}
                </button>
              </span>
            ))}
          </span>
          {motivo === "outro" && (
            <input
              autoFocus
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="em uma frase"
              aria-label="Motivo em uma frase"
              className="min-w-[180px] flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          )}
          <span className="inline-flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!motivo}
              onClick={() => {
                if (!motivo) return;
                onDescartar?.(p, motivo, observacao.trim() || null);
                setModo("ver");
              }}
            >
              Confirmar
            </Button>
            <button type="button" onClick={() => (onVoltar ? onVoltar() : setModo("ver"))} className={LINK}>
              Voltar
            </button>
          </span>
        </footer>
      )}
    </article>
  );
}

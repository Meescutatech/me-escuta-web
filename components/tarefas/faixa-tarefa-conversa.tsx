"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClockIcon, CheckIcon, ChevronDownIcon, SkipForwardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MarcaJarvis } from "@/components/jarvis/marca";
import { useMovimento } from "@/components/jarvis/movimento";
import { presetsAdiar } from "@/lib/tarefas/adiar";
import type { ConversaEmFoco, EstadoPrazo } from "@/lib/tarefas/foco";
import type { ResumoJarvis } from "@/lib/tarefas/resumo";
import { horaSP } from "@/lib/tarefas/resumo";
import { cn } from "@/lib/utils";
import { textoPrazoFoco } from "./item-lista-foco";

/*
 * A FAIXA DA TAREFA DENTRO DA CONVERSA (W-T para o W-D3, 11/09).
 *
 * No modo foco cada conversa é uma tarefa, e esta é a faixa que diz QUAL — uma linha no topo do
 * fio, 44px fechada: o título, o prazo com cor, e as três saídas (Concluir · Adiar · Pular). O
 * resumo do Jarvis fica colapsado atrás do chevron.
 *
 * ── A regra de layout, que é o pedido do Diogo ("sem layout shift") ───────────────────────────
 * Aberta, a faixa NÃO empurra o fio: ela cresce em OVERLAY sobre as primeiras mensagens
 * (`absolute` dentro de um pai `relative`), com fundo opaco e uma sombra fina. Empurrar o fio
 * moveria a última mensagem — justamente a que a pessoa está lendo para decidir. A altura fechada
 * é fixa, então entrar e sair do modo foco também não desloca nada.
 *
 * Como montar, no topo do painel da conversa:
 *
 *   <div className="relative z-20">
 *     <FaixaTarefaConversa linha={…} agoraMs={…} onConcluir={…} onAdiar={…} onPular={…} />
 *   </div>
 *
 * O pai precisa de `relative` e de um z acima do fio; a faixa reserva os 44px fechados por conta
 * própria (`min-h-[44px]` no trilho), e a parte expandida sai fora do fluxo.
 */

const TOM: Record<EstadoPrazo, string> = {
  vencida: "font-medium text-vermelho",
  hoje: "text-suave",
  futura: "text-mute",
};

export function FaixaTarefaConversa({
  linha,
  agoraMs,
  rotuloTipo,
  onConcluir,
  onAdiar,
  onPular,
  onVerNoFio,
  className,
}: {
  linha: ConversaEmFoco;
  agoraMs: number;
  rotuloTipo?: string | null;
  /** concluir exige resultado — a faixa coleta e devolve; `false` = não fechou (o motivo é seu) */
  onConcluir: (resultado: string) => Promise<boolean>;
  onAdiar: (prazoIso: string, motivo: string) => Promise<boolean>;
  /** "agora não, hoje sim": tira do foco sem tocar no prazo. Sem evento (ver lib/tarefas/foco.ts) */
  onPular: () => void;
  onVerNoFio?: () => void;
  className?: string;
}) {
  const mov = useMovimento();
  const [aberta, setAberta] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [resultado, setResultado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const presets = presetsAdiar(agoraMs);
  const { tarefa } = linha;
  const temDetalhe = !!linha.resumo || !!linha.resumoJarvis;

  async function concluir() {
    if (ocupado) return;
    if (!resultado.trim()) {
      setErro("descreva o resultado para concluir");
      campo.current?.focus();
      return;
    }
    setOcupado(true);
    const ok = await onConcluir(resultado.trim());
    setOcupado(false);
    if (ok) {
      setConcluindo(false);
      setResultado("");
      setErro(null);
    } else setErro("não foi possível concluir");
  }

  async function adiar(prazoIso: string, motivo: string) {
    setOcupado(true);
    const ok = await onAdiar(prazoIso, motivo);
    setOcupado(false);
    if (!ok) setErro("não foi possível adiar");
  }

  return (
    <div className={cn("relative", className)}>
      {/* o TRILHO: altura fixa, é o que garante zero deslocamento ao entrar/sair do foco */}
      <div className="flex min-h-[44px] items-center gap-2 border-b border-linha bg-branco px-4">
        {tarefa.doJarvis && <MarcaJarvis tamanho={16} rotulo="Criada pelo Jarvis" className="shrink-0 text-mute" />}
        <button
          type="button"
          onClick={() => temDetalhe && setAberta((v) => !v)}
          className={cn("flex min-w-0 flex-1 items-baseline gap-2 text-left", temDetalhe && "cursor-pointer")}
          aria-expanded={temDetalhe ? aberta : undefined}
        >
          <span className="min-w-0 truncate text-[13.5px] font-medium text-tinta">{tarefa.titulo}</span>
          <span className={cn("shrink-0 text-[12px] tabular-nums", TOM[tarefa.estado])}>{textoPrazoFoco(tarefa.prazo, tarefa.estado, agoraMs)}</span>
          {rotuloTipo && <span className="hidden shrink-0 text-[12px] text-mute sm:inline">{rotuloTipo}</span>}
          {temDetalhe && <ChevronDownIcon className={cn("size-3.5 shrink-0 text-mute transition-transform", aberta && "rotate-180")} aria-hidden />}
        </button>

        {concluindo ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              ref={campo}
              autoFocus
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void concluir();
                if (e.key === "Escape") {
                  setConcluindo(false);
                  setErro(null);
                }
              }}
              placeholder="Resultado — o que aconteceu?"
              aria-label="Resultado da tarefa (obrigatório)"
              className="h-7 w-[260px] rounded-md border border-linha-forte bg-branco px-2 text-[12.5px] outline-none focus:border-laranja"
            />
            <Button size="xs" onClick={() => void concluir()} disabled={ocupado}>
              {ocupado ? "…" : "Concluir"}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="xs" onClick={() => setConcluindo(true)} className="text-suave hover:text-tinta">
              <CheckIcon aria-hidden />
              Concluir
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="xs" disabled={ocupado} className="text-suave hover:text-tinta" />}>
                <CalendarClockIcon aria-hidden />
                Adiar
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {presets.map((p) => (
                  <DropdownMenuItem key={p.chave} onClick={() => void adiar(p.prazoIso, p.motivo)}>
                    {p.rotulo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="xs" onClick={onPular} className="text-mute hover:text-tinta">
              <SkipForwardIcon aria-hidden />
              Pular
            </Button>
          </div>
        )}
      </div>
      {erro && <p className="absolute left-4 top-[44px] z-10 text-[11.5px] font-medium text-vermelho">{erro}</p>}

      {/* EXPANDIDO — em overlay: o fio não desce, e a última mensagem fica onde estava */}
      <AnimatePresence initial={false}>
        {aberta && temDetalhe && (
          <motion.div
            key="detalhe"
            variants={mov.abrir}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-x-0 top-full z-20 overflow-hidden border-b border-linha bg-branco shadow-[0_6px_18px_rgba(31,35,40,.07)]"
          >
            <div className="px-4 py-3">
              {linha.resumo ? <ResumoFino resumo={linha.resumo} onVerNoFio={onVerNoFio} /> : <p className="max-w-[76ch] text-[13px] leading-snug text-suave">{linha.resumoJarvis}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A versão FINA do resumo (o completo é `components/tarefas/resumo-jarvis.tsx`, da lista): aqui a
 * conversa está logo abaixo, então o trecho citado não se repete — quem quiser o trecho rola o
 * fio. Ficam a situação e o que fazer, que é o que a conversa não diz.
 */
function ResumoFino({ resumo, onVerNoFio }: { resumo: ResumoJarvis; onVerNoFio?: () => void }) {
  return (
    <div className="flex max-w-[80ch] gap-2.5">
      <MarcaJarvis tamanho={16} rotulo="Resumo do Jarvis" className="mt-px shrink-0 text-mute" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <p className="text-tinta">{resumo.situacao}</p>
        {resumo.visto && (
          <p className="mt-1 text-suave">
            {resumo.visto}
            {onVerNoFio && (
              <>
                {" "}
                <button type="button" onClick={onVerNoFio} className="text-[0.92em] text-mute underline-offset-[3px] hover:text-tinta hover:underline">
                  ver no fio
                </button>
              </>
            )}
          </p>
        )}
        <p className="mt-1 text-tinta">{resumo.sugestao}</p>
        <p className="mt-1.5 text-[11px] text-mute">
          {resumo.humano ? "contexto resumido" : "resumiu"} às {horaSP(resumo.gerado_em)}
        </p>
      </div>
    </div>
  );
}

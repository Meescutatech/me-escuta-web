"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContextoTela, PapelUsuario } from "@/lib/jarvis/contrato";
import type { AcaoResposta } from "@/lib/jarvis/resposta-tipos";
import { sugestoesDaTela, useJarvis, type ContextoJarvisTela } from "@/lib/jarvis/contexto";
import { useConversaJarvis } from "@/lib/jarvis/usar-conversa";
import { useMovimento } from "./movimento";
import { RespostaBlocos } from "./resposta";

/**
 * A SUPERFÍCIE DO JARVIS (W-JX, 11/09/2026) — pergunta em cima, resposta embaixo, uma linguagem só.
 *
 * É o MESMO componente nas três molduras, e essa é a mudança da rodada: overlay ⌘K sobre qualquer
 * tela, painel lateral do header, e a página `/jarvis` em tela cheia. Antes cada uma tinha o seu
 * desenho — e a página era chat de bolhas, que o Diogo reprovou ("continua puro GPT").
 *
 * Duas medidas:
 *   `coluna` — uma coluna só (overlay, painel). As perguntas prontas viram lista abaixo do campo.
 *   `pagina` — largura útil: resposta em ~760px à esquerda, perguntas e histórico à direita.
 *
 * ESPERA HONESTA (pesquisa 11/09 §3, Slack e Linear): enquanto pensa existe um botão **parar** e,
 * passados 10 s, a linha diz "ainda trabalhando". Spinner mudo sem prazo é o que faz parecer
 * travado.
 *
 * AÇÕES: `abrir` navega, `filtrar` aplica o filtro NA ROTA EM QUE A PESSOA JÁ ESTÁ (é o que separa
 * copiloto de chat), `criar_tarefa` confirma aqui mesmo. ⚠️ Em produção `criar_tarefa` ainda não
 * existe: o chat do Jarvis é somente leitura por guardrail e a criação vive no worker — em ensaio
 * a ação é real na tela e nada é gravado. Está no STATUS o que falta.
 */

const LINK = "underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:underline";

export interface SuperficieJarvisProps {
  usuarioId: string;
  papel: PapelUsuario;
  /** o contexto rico da tela (do provedor) — escolhe as sugestões e a resposta específica */
  contexto: ContextoJarvisTela;
  /** o contexto no formato do contrato do runtime */
  contratoTela: ContextoTela;
  ensaio: boolean;
  medida?: "coluna" | "pagina";
  sugestoes?: string[];
  perguntaInicial?: string | null;
  enviarAoAbrir?: boolean;
  autoFoco?: boolean;
  /** chamada depois de navegar/filtrar — o overlay usa para se fechar */
  aoSair?: () => void;
  className?: string;
}

export function SuperficieJarvis({
  usuarioId,
  papel,
  contexto,
  contratoTela,
  ensaio,
  medida = "coluna",
  sugestoes,
  perguntaInicial = null,
  enviarAoAbrir = false,
  autoFoco = true,
  aoSair,
  className,
}: SuperficieJarvisProps) {
  const router = useRouter();
  const mov = useMovimento();
  const motor = useConversaJarvis({ usuarioId, contexto: contratoTela, ensaio, contextoTela: contexto });
  const { texto, setTexto, historico, atual, atualId, verRegistro, vivo, pronto, perguntar, limpar, cancelar } = motor;
  const campo = useRef<HTMLTextAreaElement>(null);
  const [demorando, setDemorando] = useState(false);
  const [feito, setFeito] = useState<{ texto: string; href?: string | null } | null>(null);
  // digitar FILTRA as perguntas prontas (debounce curto — é filtro local, não rede)
  const [peneira, setPeneira] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPeneira(texto), 200);
    return () => clearTimeout(t);
  }, [texto]);

  // "ainda trabalhando" depois de 10 s — prazo explícito, nunca espera muda
  useEffect(() => {
    if (!vivo) {
      setDemorando(false);
      return;
    }
    const t = setTimeout(() => setDemorando(true), 10_000);
    return () => clearTimeout(t);
  }, [vivo]);

  // `?pergunta=` / pergunta vinda do dock — uma vez só
  const aplicada = useRef(false);
  useEffect(() => {
    if (!pronto || !perguntaInicial || aplicada.current) return;
    aplicada.current = true;
    if (enviarAoAbrir) perguntar(perguntaInicial);
    else {
      setTexto(perguntaInicial);
      campo.current?.focus();
    }
  }, [pronto, perguntaInicial, enviarAoAbrir, perguntar, setTexto]);

  useEffect(() => {
    if (autoFoco) campo.current?.focus();
  }, [autoFoco]);

  function aoAcao(a: AcaoResposta) {
    if (a.tipo === "abrir" && a.href) {
      router.push(a.href);
      aoSair?.();
      return;
    }
    if (a.tipo === "filtrar" && a.filtro) {
      router.push(`${contexto.rota}?${a.filtro}`);
      aoSair?.();
      return;
    }
    if (a.tipo === "criar_tarefa") {
      setFeito({ texto: a.detalhe ? `Tarefa criada: ${a.detalhe}` : "Tarefa criada", href: "/tarefas" });
    }
  }

  const prontas = sugestoes ?? sugestoesDaTela(contexto, contratoTela, papel);
  const naoRespondeu = !atual;

  const Campo = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        perguntar(texto);
      }}
      className="border-b border-border/60 pb-2.5 transition-colors focus-within:border-foreground/40"
    >
      <label htmlFor="jarvis-campo" className="sr-only">
        Pergunte ao Jarvis
      </label>
      <textarea
        id="jarvis-campo"
        ref={campo}
        value={texto}
        rows={1}
        onChange={(e) => {
          setTexto(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            perguntar(texto);
          }
        }}
        aria-label="Pergunte ao Jarvis"
        placeholder="Pergunte sobre esta tela, o funil, a equipe ou o marketing"
        aria-busy={vivo}
        className={cn(
          "w-full resize-none bg-transparent font-medium leading-snug tracking-[-0.01em] text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70",
          medida === "pagina" ? "text-[20px]" : "text-[17px]",
        )}
      />
    </form>
  );

  /*
   * AS PERGUNTAS BROTAM DA PÍLULA (referência `animated-search-bar` do 21st.dev, 11/09): cada uma
   * entra de baixo para cima, com escala e desfoque curtos, uma depois da outra — como se saíssem
   * de dentro do campo que acabou de se abrir. A referência usa `y (i+1)*50`, `scale .3` e
   * `blur 10px`; aqui isso ficaria histriônico numa tela densa de 12,5px, então a física é a mesma
   * e a amplitude é um quarto. O filtro `gooey` em SVG da referência NÃO entrou: sobre o nosso
   * fundo claro ele borra o próprio texto que a lista existe para mostrar (ver STATUS).
   */
  const filtradas = peneira.trim()
    ? prontas.filter((q) => q.toLowerCase().includes(peneira.trim().toLowerCase()))
    : prontas;

  const Prontas = filtradas.length > 0 && (
    <div>
      <p className="text-[12px] text-muted-foreground">{peneira.trim() ? "Talvez você queira perguntar" : "Pergunte"}</p>
      <ul role="listbox" aria-label="Perguntas sugeridas para esta tela" className="mt-1 space-y-0.5">
        <AnimatePresence initial={false}>
          {filtradas.map((q, i) => (
            <motion.li
              key={q}
              role="option"
              aria-selected={false}
              initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 12 + i * 2, scale: 0.96, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={mov.reduzido ? { duration: 0.15 } : { type: "spring", duration: 0.5, bounce: 0.3, delay: i * 0.05 }}
            >
              <button type="button" onClick={() => perguntar(q)} className={cn("text-left text-[12.5px] text-foreground", LINK)}>
                {q}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );

  const Anteriores = historico.length > 0 && (
    <div>
      <p className="text-[12px] text-muted-foreground">Anteriores</p>
      <ul className="mt-1 space-y-0.5">
        {historico.slice(0, medida === "coluna" ? 4 : 20).map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => verRegistro(h.id)}
              aria-current={h.id === atualId ? "true" : undefined}
              title={h.pergunta}
              className={cn("block w-full truncate text-left text-[12.5px] leading-snug", h.id === atualId ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {h.pergunta}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={limpar} className={cn("mt-1.5 text-[11.5px] text-muted-foreground", LINK)}>
        limpar
      </button>
    </div>
  );

  const Resposta = (
    <div className="min-w-0">
      {atual ? (
        <>
          <div className="mb-2 flex items-baseline gap-3">
            <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">{atual.pergunta}</p>
            {vivo && (
              <button type="button" onClick={cancelar} className={cn("shrink-0 text-[11.5px] text-muted-foreground", LINK)}>
                parar
              </button>
            )}
          </div>
          <RespostaBlocos resposta={atual.resposta} vivo={vivo && atual.id === historico[0]?.id} onAcao={aoAcao} />
          {demorando && vivo && (
            <p role="status" className="mt-2 text-[11.5px] text-muted-foreground">
              Ainda trabalhando — a consulta está demorando mais que o normal.
            </p>
          )}
          <AnimatePresence initial={false}>
            {feito && (
              <motion.p
                key={feito.texto}
                variants={mov.abrir}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3 text-[12.5px] text-muted-foreground"
              >
                <CheckIcon className="size-3.5 shrink-0 text-success-ink" aria-hidden />
                <span className="min-w-0 flex-1">{feito.texto}</span>
                {feito.href && (
                  <Link href={feito.href} onClick={aoSair} className={cn("shrink-0 text-foreground", LINK)}>
                    ver
                  </Link>
                )}
              </motion.p>
            )}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );

  if (medida === "pagina") {
    return (
      <div className={cn("w-full px-6 py-6", className)}>
        {Campo}
        <div className="mt-5 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,760px)_minmax(220px,1fr)]">
          <div className="min-w-0">
            {naoRespondeu ? (
              <p className="text-[13.5px] leading-normal text-muted-foreground">
                Uma pergunta por vez. A resposta vem com o que foi consultado, o link para onde se resolve e o que dá para fazer daqui.
              </p>
            ) : (
              Resposta
            )}
          </div>
          <aside className="min-w-0 space-y-6" aria-label="Perguntas">
            {Prontas}
            {Anteriores}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="px-4 pb-3 pt-3">{Campo}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {naoRespondeu ? <div className="space-y-5 pt-1">{Prontas}{Anteriores}</div> : Resposta}
      </div>
    </div>
  );
}

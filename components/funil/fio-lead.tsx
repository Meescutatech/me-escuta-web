"use client";

import { useEffect, useRef } from "react";
import type { Mensagem } from "@/lib/dados/conversas";
import { montarBlocos, motivoErroEnvio } from "@/lib/conversas/thread";
import { textoDaBolha } from "@/lib/conversas/texto-da-bolha";
import { ehAudio, temFigurinhaVisivel, temImagemVisivel, temVideoVisivel } from "@/lib/conversas/midia";
import { BolhaAudio } from "@/components/conversas/bolha-audio";
import { BolhaImagem } from "@/components/conversas/bolha-imagem";
import {
  BolhaCitada,
  BolhaContato,
  BolhaDocumento,
  BolhaFigurinha,
  BolhaInterativa,
  BolhaLocalizacao,
  BolhaVideo,
  ReacoesChips,
  RotuloProgramada,
} from "@/components/conversas/bolha-tipada";
import { EstadoEntregaIcone } from "@/components/conversas/estado-entrega";
import { cn } from "@/lib/utils";

/*
 * W-D6 (10/09) · O FIO DA CONVERSA EM LEITURA, dentro do drawer do lead (card G6).
 *
 * O botão "Abrir conversa" do drawer empurrava a pessoa para /conversas e a tirava do funil. A
 * pergunta que ela tinha ("o que ele disse por último? ela mandou a foto do exame?") cabe numa aba.
 * Este componente é a THREAD do inbox sem o composer: mesmas bolhas tipadas (`bolha-tipada.tsx`,
 * `bolha-audio.tsx`, `bolha-imagem.tsx`), mesma gramática de rajada (`montarBlocos`), mesmos
 * separadores de dia. O que NÃO tem, e é decisão: não responde. O composer, a janela de 24h e o
 * seletor de número moram em /conversas; duplicá-los aqui seria dois lugares para o mesmo envio.
 * O rodapé oferece o atalho "Responder", que abre a conversa certa (`?c=<id>`).
 *
 * Por que não `components/suporte/fio-conversa.tsx`, que o pedido citou: aquele fio é de
 * COMENTÁRIOS de chamado (autor + carimbo + texto), não de mensagens de WhatsApp — não sabe
 * desenhar áudio, foto, documento, botão, citação nem reação. Reusar as bolhas é reusar o que a
 * conversa realmente tem.
 */

function hhmm(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function ehFigurinha(m: Mensagem): boolean {
  // Espelho do inbox: a regra é a de lá (tipo + caminho), não `midia_url`. Ver `temFigurinhaVisivel`.
  return temFigurinhaVisivel(m);
}

/** Espelho de `ConteudoBolha` do inbox (privado lá). Degradação honesta para tipo sem mídia. */
function Conteudo({ m }: { m: Mensagem }) {
  const tipo = (m.tipo_conteudo ?? "text").toLowerCase();
  // texto e template: a regra é a MESMA do inbox, numa função só — o espelho divergiu uma vez
  // (template virava `Mensagem (template)` aqui depois do conserto de 21/09 no inbox).
  const texto = textoDaBolha(m.tipo_conteudo, m.corpo);
  if (texto) {
    return texto.tipo === "corpo" ? <>{texto.texto}</> : <span className="italic opacity-70">{texto.texto}</span>;
  }
  if (m.interativo) return <BolhaInterativa m={m} />;
  if (m.documento) return <BolhaDocumento m={m} />;
  if (m.localizacao) return <BolhaLocalizacao m={m} />;
  if (m.contato) return <BolhaContato m={m} />;
  if (temVideoVisivel(m)) return <BolhaVideo m={m} />;
  if (ehFigurinha(m)) return <BolhaFigurinha m={m} />;
  if (ehAudio(tipo)) return <BolhaAudio m={m} />;
  if (temImagemVisivel(m)) return <BolhaImagem m={m} />;
  const rotulo =
    tipo === "image" || tipo === "imagem"
      ? "Foto recebida"
      : tipo === "document" || tipo === "documento"
        ? "Documento recebido"
        : tipo === "video"
          ? "Vídeo recebido"
          : tipo === "sticker" || tipo === "figurinha"
            ? "Figurinha"
            : tipo === "location" || tipo === "localizacao"
              ? "Localização recebida"
              : tipo === "contacts" || tipo === "contato"
                ? "Contato recebido"
                : tipo === "reaction" || tipo === "reacao"
                  ? "Reação"
                  : `Mensagem (${tipo})`;
  return (
    <span className="flex flex-col gap-1">
      <span className="font-medium">{rotulo}</span>
      {m.corpo ? <span className="text-[0.84rem] text-suave">{m.corpo}</span> : null}
    </span>
  );
}

export function FioLead({
  mensagens,
  nomeLead,
  autoRolar = true,
}: {
  mensagens: Mensagem[];
  nomeLead: string;
  /**
   * Abrir no presente é a decisão certa quando o fio é O ASSUNTO da tela (o drawer do funil) — daí
   * o default. Quando ele é um fio IRMÃO dentro da conversa de outro número, não: a caixa tem
   * altura fixa, rolar ao fim come os primeiros pixels e a primeira bolha fica cortada atrás do
   * cabeçalho. Medido em 16/09 na tela viva — `scrollTop 61 de 61`.
   */
  autoRolar?: boolean;
}) {
  const fimRef = useRef<HTMLDivElement>(null);
  const blocos = montarBlocos(mensagens);

  // abre no PRESENTE: a última mensagem é a resposta à pergunta que trouxe a pessoa aqui. Rola o
  // contêiner de rolagem mais próximo (o da aba), nunca a página nem o corpo do drawer — senão as
  // abas e o botão de responder somem para cima.
  useEffect(() => {
    if (!autoRolar) return;
    const el = fimRef.current;
    if (!el) return;
    let pai: HTMLElement | null = el.parentElement;
    while (pai && getComputedStyle(pai).overflowY !== "auto" && getComputedStyle(pai).overflowY !== "scroll") pai = pai.parentElement;
    if (!pai) return;
    const rolar = () => {
      pai!.scrollTop = pai!.scrollHeight;
    };
    rolar();
    // foto e vídeo carregam depois e empurram o fim para baixo — rola de novo quando assentar
    const t = setTimeout(rolar, 350);
    return () => clearTimeout(t);
  }, [mensagens, autoRolar]);

  if (mensagens.length === 0) {
    return <p className="py-6 text-center text-[13px] text-mute">Sem mensagens nesta conversa.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {blocos.map((bloco, bi) => (
        <div key={bi} className="flex flex-col gap-3">
          <span className="sticky top-0 z-10 my-0.5 self-center rounded-full border border-linha bg-branco px-2.5 py-0.5 text-[0.7rem] text-mute">
            {bloco.dia}
          </span>
          {blocos[bi].grupos.map((grupo, gi) => {
            const saida = grupo.falante !== "cliente";
            return (
              <div
                key={gi}
                className={cn("flex max-w-[78%] flex-col gap-[3px]", saida ? "self-end items-end" : "self-start items-start")}
              >
                {grupo.itens.map((m, mi) => {
                  const primeira = mi === 0;
                  const ultima = mi === grupo.itens.length - 1;
                  const falhou = m.status_entrega === "falhou" || m.falha_local;
                  const figurinha = ehFigurinha(m);
                  const programada = !!m.programada_para;
                  return (
                    <div key={m.id} className={cn("flex flex-col gap-[3px]", saida ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words text-[0.84rem] leading-relaxed",
                          figurinha
                            ? "p-0"
                            : cn(
                                "px-3 py-2",
                                saida
                                  ? "rounded-[12px] rounded-br-[4px] bg-bolha-out text-tinta"
                                  : "rounded-[12px] rounded-bl-[4px] border border-linha bg-bolha-in text-tinta",
                                saida && !primeira && "rounded-tr-[4px]",
                                !saida && !primeira && "rounded-tl-[4px]",
                                falhou && "border border-vermelho-bd bg-vermelho-bg",
                                programada && "border border-dashed border-amarelo-bd bg-amarelo-bg/60",
                              ),
                        )}
                      >
                        {m.citada && !figurinha && <BolhaCitada citada={m.citada} saida={saida} />}
                        <Conteudo m={m} />
                      </div>
                      {m.reacoes && m.reacoes.length > 0 && <ReacoesChips reacoes={m.reacoes} saida={saida} />}
                      {falhou ? (
                        <div className="px-1 text-[0.68rem] text-vermelho">
                          não entregue{motivoErroEnvio(m.erro_codigo) ? ` · ${motivoErroEnvio(m.erro_codigo)}` : m.erro_codigo ? ` · erro ${m.erro_codigo}` : ""}
                        </div>
                      ) : programada ? (
                        <div className="px-1 text-[0.66rem] tabular-nums text-mute">
                          <RotuloProgramada quando={m.programada_para!} />
                          <span className="ml-1.5">· ainda não enviada</span>
                        </div>
                      ) : ultima ? (
                        <div className="px-1 text-[0.66rem] tabular-nums text-mute">
                          {saida && grupo.falante === "clara" && <b className="font-medium text-laranja">Clara</b>}
                          {saida && grupo.falante === "sara" && <b className="font-medium text-navy">{m.autor_nome ?? "Equipe"}</b>}
                          {!saida && <b className="font-medium text-suave">{nomeLead.split(" ")[0]}</b>}
                          {" · "}
                          {hhmm(m.criado_em)}
                          {saida && (
                            <span className="ml-1.5">
                              <EstadoEntregaIcone estado={m.status_entrega} />
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
      <div ref={fimRef} aria-hidden />
    </div>
  );
}

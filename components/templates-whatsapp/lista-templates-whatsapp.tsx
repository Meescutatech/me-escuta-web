"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ReguaTemplate } from "@/components/regua-template";
import {
  exigeFaixa,
  podeGerirTemplatesWhatsapp,
  rotuloRecategorizacao,
  TETO_TEMPLATES_NAO_VERIFICADO,
  TETO_TEMPLATES_VERIFICADO,
  tituloLegivel,
  type TemplateWhatsapp,
} from "@/lib/templates-whatsapp";
import type { Papel } from "@/lib/membros";
import { arquivarTemplateWhatsapp, submeterTemplateWhatsapp } from "@/app/(app)/configuracoes/templates-whatsapp/actions";
import { cn } from "@/lib/utils";

/*
 * Configurações › Templates de WhatsApp — o inventário (Design/templates-hsm-r22.html, tela 1).
 *
 * Rota IRMÃ E SEPARADA de `/configuracoes/templates`, que é resposta rápida e já está em
 * produção. Fundir as duas telas fundiria os dois conceitos de novo, e o custo de separar agora
 * é zero (SPEC-B §8).
 *
 * O que distingue esta tela de um CRUD é que **metade do ciclo de vida não é nossa**: quem
 * aprova, pausa e recategoriza é a Meta. Duas consequências de desenho, e nenhuma é estética:
 *
 *  · a coluna "Onde está" é a RÉGUA, não um chip. Um chip diz o quê; a régua diz onde e de quem
 *    é a vez — que é o que responde "por que isso não saiu ainda?".
 *  · **o estado é do tamanho da consequência** (§8.5): `pausado` ganha faixa no topo porque
 *    mensagens ESTÃO FALHANDO AGORA sem que ninguém do nosso lado tenha mudado nada. `recusado`
 *    e `rascunho` não param a operação — ficam na linha.
 */

export function ListaTemplatesWhatsapp({
  meuPapel,
  templates,
  indisponivel,
}: {
  meuPapel: Papel | null;
  templates: TemplateWhatsapp[];
  indisponivel: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const gestor = podeGerirTemplatesWhatsapp(meuPapel);
  const vivos = useMemo(() => templates.filter((t) => !t.arquivado_em), [templates]);
  const arquivados = useMemo(() => templates.filter((t) => t.arquivado_em), [templates]);
  const pausados = useMemo(() => vivos.filter(exigeFaixa), [vivos]);

  function agir(acao: () => Promise<{ ok: boolean; motivo?: string }>, oQue: string) {
    setConfirmandoId(null);
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.motivo ?? `não deu para ${oQue}`);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-suave">
          Modelos aprovados pela Meta. São o único jeito de falar com alguém que não escreve há mais de
          24 horas.
        </p>
        {gestor && (
          <Link
            href="/configuracoes/templates-whatsapp/novo"
            className="grid h-[34px] flex-none place-items-center whitespace-nowrap rounded-md bg-laranja px-3.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc"
          >
            Escrever template
          </Link>
        )}
      </div>

      {/* Degrade honesto: a projeção da SPEC-B ainda não subiu neste ambiente. Lista vazia COM
          SAÍDA — a tela diz o que falta e o que dá para fazer, nunca fica morta. */}
      {indisponivel && (
        <p className="mt-4 rounded-md border border-linha bg-board px-3 py-2 text-[12.5px] text-suave">
          Este ambiente ainda não tem a tabela de templates de WhatsApp — a lista aparece vazia. Nada
          está quebrado: a projeção entra com a migração da SPEC-B.
        </p>
      )}

      {erro && (
        <p role="alert" className="mt-4 rounded-md bg-vermelho-bg px-3 py-2 text-[12.5px] text-vermelho">
          {erro}
        </p>
      )}

      {/* §8.5 · a faixa do alarme: pausado é o único estado que sai da linha, porque é o único em
          que mensagens estão falhando NESTE MOMENTO. */}
      {pausados.map((t) => (
        <div
          key={t.id}
          className="mt-4 flex items-start gap-2.5 rounded-md bg-amarelo-bg px-3.5 py-3 text-[13px]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-px h-4 w-4 flex-none stroke-amarelo"
          >
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L14.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <div className="min-w-0">
            <b className="font-semibold text-amarelo">{tituloLegivel(t.nome)} está pausado pela Meta.</b>
            <p className="mt-0.5 text-suave">
              Envios com este template <strong className="font-semibold">estão falhando agora</strong>. A
              Meta pausou por qualidade e reavalia sozinha
              {t.motivo_status ? ` (${t.motivo_status})` : ""}; enquanto isso, use outro template ou
              uma tarefa na agenda.
            </p>
          </div>
        </div>
      ))}

      {vivos.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-linha px-4 py-8 text-center text-[13px] text-mute">
          Nenhum template de WhatsApp ainda.{" "}
          {gestor ? (
            <>
              <Link href="/configuracoes/templates-whatsapp/novo" className="text-navy underline underline-offset-2">
                Escreva o primeiro
              </Link>{" "}
              — a Meta leva até 24 horas para analisar.
            </>
          ) : (
            "Quando a gestão criar e a Meta aprovar, eles aparecem aqui e no campo de conversa."
          )}
        </p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-linha bg-branco">
          {vivos.map((t) => {
            const cat = rotuloRecategorizacao(t);
            return (
              <div
                key={t.id}
                className="flex items-start gap-4 border-b border-linha px-4 py-3 last:border-b-0 hover:bg-hover max-sm:flex-col max-sm:gap-2"
              >
                {/* o que é o template */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-tinta">{tituloLegivel(t.nome)}</div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-mute">
                    {t.nome} · {t.idioma}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                        cat.recategorizado
                          ? "bg-amarelo-bg text-amarelo"
                          : "border border-linha bg-board text-suave",
                      )}
                      title={
                        cat.recategorizado
                          ? "a Meta reclassificou este template por conta própria — e o custo mudou sem passar por você"
                          : undefined
                      }
                    >
                      {cat.texto}
                    </span>
                    <span className="whitespace-nowrap rounded-full border border-linha bg-board px-2 py-0.5 text-[11.5px] text-suave">
                      {t.canal_rotulo ?? "número não legível"}
                    </span>
                  </div>
                  <div className="mt-1.5 truncate text-[12.5px] text-suave">
                    {t.definicao.corpo.replace(/\s+/g, " ") || "—"}
                  </div>
                  {/* §8.5 · o motivo da recusa vai CRU, como a Meta mandou. Traduzir seria
                      inventar diagnóstico, e é justamente o que a régua existe para evitar. */}
                  {t.status === "recusado" && t.motivo_status && (
                    <div className="mt-1.5 font-mono text-[11.5px] leading-snug text-vermelho">
                      {t.motivo_status}
                    </div>
                  )}
                </div>

                {/* ONDE ELE ESTÁ — a régua, e é ela que a coluna existe para mostrar.
                    Largura FIXA de 176px: no vão de 720px de Configurações, deixar a régua
                    disputar espaço com o texto é o mesmo que não tê-la (medido em Chrome
                    headless: a 5 colunas, a assinatura da tela saía cortada da direita). */}
                <div className="w-[176px] flex-none pt-0.5 max-sm:w-full">
                  <ReguaTemplate
                    status={t.status}
                    motivoStatus={t.motivo_status}
                    detalhe={t.status === "rascunho" ? undefined : dataCurta(t)}
                  />
                  {gestor && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {confirmandoId === t.id ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px]">
                          <span className="text-suave">Arquivar?</span>
                          <button
                            type="button"
                            disabled={pendente}
                            onClick={() => agir(() => arquivarTemplateWhatsapp(t.id), "arquivar")}
                            className="rounded px-1.5 py-0.5 font-medium text-vermelho hover:bg-vermelho-bg"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmandoId(null)}
                            className="rounded px-1.5 py-0.5 text-suave hover:bg-hover hover:text-tinta"
                          >
                            Não
                          </button>
                        </span>
                      ) : (
                        <>
                          {t.status === "rascunho" && (
                            <button
                              type="button"
                              disabled={pendente}
                              onClick={() => agir(() => submeterTemplateWhatsapp(t.id), "enviar para análise")}
                              title="a Meta leva até 24 horas para responder — e o nome não muda depois disto"
                              className="rounded px-1.5 py-0.5 text-[12px] font-medium text-navy hover:bg-branco"
                            >
                              Enviar para análise
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmandoId(t.id)}
                            className="rounded px-1.5 py-0.5 text-[12px] font-medium text-suave hover:bg-branco hover:text-tinta"
                          >
                            Arquivar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* O teto é real, e é o NOSSO — 250, de portfólio não verificado. Registrar antes que
          alguém planeje 300 (SPEC-B §9). */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-linha bg-board px-2 py-0.5 text-[11.5px] text-suave">
          <span className="font-mono tabular-nums text-tinta">{vivos.length}</span> de{" "}
          <span className="font-mono tabular-nums text-tinta">{TETO_TEMPLATES_NAO_VERIFICADO}</span>{" "}
          templates deste portfólio
        </span>
        <span className="text-[12.5px] text-suave">
          O teto sobe para {TETO_TEMPLATES_VERIFICADO.toLocaleString("pt-BR")} quando o negócio for
          verificado na Meta.
        </span>
      </div>

      {arquivados.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-[12.5px] font-medium text-mute hover:text-suave">
            Arquivados ({arquivados.length})
          </summary>
          <div className="mt-2">
            {arquivados.map((t) => (
              <div
                key={t.id}
                className="flex min-h-[44px] items-center gap-3 border-b border-linha px-2 py-1.5 last:border-b-0"
              >
                <span className="w-[180px] flex-none truncate font-mono text-[12px] text-mute line-through">
                  {t.nome}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-mute line-through">
                  {tituloLegivel(t.nome)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-6 max-w-[88ch] border-t border-linha pt-4 text-[12.5px] text-suave">
        <strong className="font-semibold text-tinta">Quem aprova não somos nós.</strong> A análise da
        Meta leva até 24 horas, e ela pode reclassificar a categoria por conta própria — quando isso
        acontece, o chip mostra a troca. Reconciliar com a Meta o que foi criado fora deste sistema
        (pelo WhatsApp Manager, à mão) é trabalho do processo de submissão, e não desta tela.
      </p>
    </div>
  );
}

/** Data do último movimento, curta. Sem ela a régua diz "onde", mas não "desde quando". */
function dataCurta(t: TemplateWhatsapp): string | null {
  const iso = t.atualizado_em ?? t.criado_em;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

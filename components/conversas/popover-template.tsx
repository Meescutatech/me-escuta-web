"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  preencher,
  variaveisDaDefinicao,
  vereditoEnvioTemplate,
  podeEnviar,
  tituloLegivel,
  type TemplateWhatsapp,
} from "@/lib/templates-whatsapp";
import { cn } from "@/lib/utils";

/*
 * Escolher template — o popover do composer fora da janela (Design tela 3).
 *
 * Fora da janela de 24 horas este é o ÚNICO caminho que existe, e a tela diz isso. Três regras,
 * e nenhuma é cosmética:
 *
 *  P1 — **só template aprovado aparece aqui.** VE1 é o coração da SPEC-B: template não-aprovado
 *       que chega ao sender vira erro da Graph, e erro da Graph fora da janela é indistinguível
 *       de "a janela fechou". Filtrar na origem é mais barato que diagnosticar depois.
 *
 *  P2 — **o popover nunca abre vazio sem saída.** Sem template aprovado para este número ele diz
 *       isso, com essas palavras, e leva direto para escrever o primeiro. Tela vazia sem saída é
 *       o que faz alguém abrir outra aba.
 *
 *  P3 — **variável sem valor bloqueia o envio**, com o campo apontado — mesma regra que já vale
 *       na resposta rápida (`despacharAoCliente`). Erro visível é melhor que mensagem torta no
 *       cliente, e a Meta recusa no envio parâmetro com quebra de linha ou espaços repetidos:
 *       o erro voltaria como falha de entrega, depois do custo e sem dizer qual parâmetro foi.
 */

export function PopoverTemplate({
  templates,
  canalId,
  nomeLead,
  enviando,
  onEnviar,
  onFechar,
}: {
  /** A lista inteira; o filtro de aprovados e de canal é feito AQUI, não pelo chamador. */
  templates: TemplateWhatsapp[];
  /** `phone_number_id` desta conversa. `null` = não deu para saber por qual número ela entrou. */
  canalId: string | null;
  nomeLead: string | null;
  enviando: boolean;
  onEnviar: (t: TemplateWhatsapp, valores: Record<string, string>) => void;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  // P1 · só aprovado, e só deste número. Um template aprovado para OUTRO canal falharia no envio
  // (VE2 da porta), e oferecer o que a porta recusaria é fabricar o clique perdido.
  const disponiveis = useMemo(
    () => templates.filter((t) => podeEnviar(t) && (!canalId || t.canal_id === canalId)),
    [templates, canalId],
  );

  const [escolhidoId, setEscolhidoId] = useState<string | null>(disponiveis[0]?.id ?? null);
  const escolhido = disponiveis.find((t) => t.id === escolhidoId) ?? null;

  const variaveis = useMemo(
    () => (escolhido ? variaveisDaDefinicao(escolhido.definicao) : []),
    [escolhido],
  );

  // O que a ficha já sabe entra preenchido — mas continua editável, e continua sendo conferido
  // pelo mesmo veredito. "Veio da ficha" não é passe livre.
  const [valores, setValores] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!escolhido) return;
    const iniciais: Record<string, string> = {};
    for (const v of variaveisDaDefinicao(escolhido.definicao)) {
      if (v === "nome" && nomeLead) iniciais[v] = nomeLead;
    }
    setValores(iniciais);
  }, [escolhido, nomeLead]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    function aoClicarFora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicarFora);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicarFora);
    };
  }, [onFechar]);

  const veredito = vereditoEnvioTemplate(escolhido, valores);

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-label="Escolher template aprovado"
      className="absolute bottom-full right-0 z-30 mb-2 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-linha bg-branco shadow-forte"
    >
      <div className="border-b border-linha px-3.5 py-3">
        <div className="text-[13.5px] font-semibold text-tinta">Templates aprovados</div>
        <div className="mt-0.5 text-[12.5px] text-suave">
          {disponiveis.length > 0
            ? "Só aprovados aparecem aqui — é o único caminho fora da janela de 24 horas."
            : "Fora da janela de 24 horas, template aprovado é o único caminho."}
        </div>
      </div>

      {/* P2 · o vazio com saída */}
      {disponiveis.length === 0 ? (
        <div className="px-3.5 py-4">
          <p className="text-[13px] text-tinta">Nenhum template aprovado ainda para este número.</p>
          <p className="mt-1 text-[12.5px] text-suave">
            A Meta leva até 24 horas para analisar — quem escreve hoje tem o caminho aberto amanhã.
          </p>
          <Link
            href="/configuracoes/templates-whatsapp/novo"
            className="mt-3 inline-grid h-[32px] place-items-center rounded-md bg-laranja px-3 text-[13px] font-semibold text-branco hover:bg-laranja-esc"
          >
            Escrever o primeiro
          </Link>
        </div>
      ) : (
        <>
          <div className="max-h-[210px] overflow-auto">
            {disponiveis.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-selected={t.id === escolhidoId}
                role="option"
                onClick={() => setEscolhidoId(t.id)}
                className={cn(
                  "block w-full border-b border-linha px-3.5 py-2.5 text-left last:border-b-0",
                  t.id === escolhidoId ? "bg-[#EAECF5]" : "hover:bg-hover",
                )}
              >
                <div className="text-[13px] font-semibold text-tinta">
                  {tituloLegivel(t.nome)}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-suave">
                  {t.definicao.corpo.replace(/\s+/g, " ")}
                </div>
              </button>
            ))}
          </div>

          {escolhido && (
            <div className="border-t border-linha px-3.5 py-3">
              {variaveis.length > 0 && (
                <>
                  <div className="mb-1.5 text-[12.5px] font-semibold text-tinta">
                    Preencha as variáveis
                  </div>
                  <div className="overflow-hidden rounded-md border border-linha">
                    {variaveis.map((v) => (
                      <div
                        key={v}
                        className="flex items-center gap-2.5 border-b border-linha px-2.5 py-1.5 last:border-b-0"
                      >
                        <span className="flex-none rounded bg-[#EAECF5] px-1.5 py-px font-mono text-[12.5px] text-navy">
                          {`{{${v}}}`}
                        </span>
                        <input
                          value={valores[v] ?? ""}
                          onChange={(e) => setValores({ ...valores, [v]: e.target.value })}
                          placeholder="valor que a pessoa vai ler"
                          aria-label={`Valor de ${v}`}
                          className="min-w-0 flex-1 border-b border-dashed border-linha bg-transparent px-0.5 py-0.5 text-[13px] outline-none placeholder:text-mute focus:border-laranja"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* §8.1 · a prévia com os VALORES REAIS. Ninguém confere um template olhando o
                  formulário — confere olhando a mensagem que vai sair. */}
              <div className="mt-2.5 rounded-md bg-[#EDE9E3] p-2.5">
                <div className="rounded-lg bg-branco px-2.5 py-2 text-[13px] leading-relaxed text-tinta shadow-[0_1px_1px_rgba(31,35,40,.06)]">
                  {escolhido.definicao.cabecalho && (
                    <div className="mb-1 break-words font-[650]">
                      {preencher(escolhido.definicao.cabecalho, valores)}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">
                    {preencher(escolhido.definicao.corpo, valores)}
                  </div>
                  {escolhido.definicao.rodape && (
                    <div className="mt-1 text-[12px] text-suave">{escolhido.definicao.rodape}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-linha px-3.5 py-3">
            <span className="min-w-0 flex-1 text-[12px] text-suave">
              {/* Hoje soa supérfluo. A partir de 01/10/2026 toda mensagem passa a ser cobrada,
                  inclusive a resposta livre — e esta linha vira a única coisa na tela que liga um
                  clique a uma conta. */}
              {veredito.pode ? "Custa 1 mensagem de template." : veredito.motivo}
            </span>
            <button
              type="button"
              disabled={!veredito.pode || enviando}
              title={veredito.motivo ?? undefined}
              onClick={() => escolhido && onEnviar(escolhido, valores)}
              className="flex-none rounded-md bg-laranja px-3 py-1.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enviar template
            </button>
          </div>
        </>
      )}
    </div>
  );
}

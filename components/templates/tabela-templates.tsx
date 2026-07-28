"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atalhoDeTitulo,
  CATALOGO_VARIAVEIS,
  LIMITE_CORPO,
  podeGerirTemplates,
  validarFormTemplate,
  variaveisForaDoCatalogo,
  type TemplateMensagem,
} from "@/lib/templates";
import type { Papel } from "@/lib/membros";
import { arquivarTemplate, atualizarTemplate, criarTemplate } from "@/app/(app)/configuracoes/templates/actions";
import { cn } from "@/lib/utils";

/*
 * Configurações > Templates (SPEC-TEMPLATES-MENSAGENS §7 · skill frontend-design).
 * A peça central é a PRÉVIA: enquanto a gestora escreve, o painel ao lado mostra a mensagem
 * como o lead a recebe, com cada variável já trocada pelo exemplo do catálogo — a variável
 * deixa de ser sintaxe e vira resultado. Variável fora do catálogo acende em âmbar aqui,
 * no mesmo tom do aviso que trava o envio no composer: o erro aparece onde nasce.
 * Permissão é ergonomia (podeGerirTemplates); a recusa real é da porta (0046, V1..V8).
 */

interface Edicao {
  id: string | null; // null = novo
  titulo: string;
  atalho: string;
  atalhoTocado: boolean;
  corpo: string;
}

const EXEMPLOS: Record<string, string> = Object.fromEntries(
  CATALOGO_VARIAVEIS.map((v) => [v.slug, v.exemplo]),
);

export function TabelaTemplates({
  meuPapel,
  templates,
  indisponivel,
  nomesPorId,
}: {
  meuPapel: Papel | null;
  templates: TemplateMensagem[];
  indisponivel: boolean;
  nomesPorId: Record<string, string>;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const gestor = podeGerirTemplates(meuPapel);
  const ativos = useMemo(() => templates.filter((t) => t.ativo), [templates]);
  const arquivados = useMemo(() => templates.filter((t) => !t.ativo), [templates]);

  function abrirNovo() {
    setErro(null);
    setEdicao({ id: null, titulo: "", atalho: "", atalhoTocado: false, corpo: "" });
  }

  function abrirEdicao(t: TemplateMensagem) {
    setErro(null);
    setEdicao({ id: t.id, titulo: t.titulo, atalho: t.atalho, atalhoTocado: true, corpo: t.corpo });
  }

  function inserirVariavel(slug: string) {
    if (!edicao) return;
    const el = corpoRef.current;
    const ins = `{{${slug}}}`;
    const inicio = el?.selectionStart ?? edicao.corpo.length;
    const fim = el?.selectionEnd ?? inicio;
    const corpo = edicao.corpo.slice(0, inicio) + ins + edicao.corpo.slice(fim);
    setEdicao({ ...edicao, corpo });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + ins.length, inicio + ins.length);
    });
  }

  function salvar() {
    if (!edicao) return;
    const recusa = validarFormTemplate(edicao);
    if (recusa) {
      setErro(recusa);
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = edicao.id
        ? await atualizarTemplate(edicao.id, {
            titulo: edicao.titulo,
            atalho: edicao.atalho,
            corpo: edicao.corpo,
          })
        : await criarTemplate({ titulo: edicao.titulo, atalho: edicao.atalho, corpo: edicao.corpo });
      if (!r.ok) {
        setErro(r.motivo ?? "não deu pra salvar");
        return;
      }
      setEdicao(null);
      router.refresh();
    });
  }

  function arquivar(t: TemplateMensagem) {
    setConfirmandoId(null);
    setErro(null);
    startTransition(async () => {
      const r = await arquivarTemplate(t.id);
      if (!r.ok) setErro(r.motivo ?? "não deu pra arquivar");
      router.refresh();
    });
  }

  const foraDoCatalogo = edicao ? variaveisForaDoCatalogo(edicao.corpo) : [];

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          {/* M6: o NOME DA PÁGINA subiu para o header (fonte única rota→título, `lib/header/titulos.ts`).
              A LINHA fica — os instrumentos são da tela; só o nome saiu dela (SPEC-M6 §5.4). */}
          <p className="mt-1.5 text-[13.5px] text-suave">
            Respostas prontas para o campo de conversa. A equipe insere com{" "}
            <kbd className="rounded border border-linha bg-board px-1.5 py-px font-mono text-[11px] text-suave">/</kbd>
            , revisa e envia — nada sai sozinho.
          </p>
        </div>
        {gestor && !edicao && (
          <button
            type="button"
            onClick={abrirNovo}
            className="h-[34px] flex-none whitespace-nowrap rounded-md bg-laranja px-3.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
          >
            Novo template
          </button>
        )}
      </div>

      {indisponivel && (
        <p className="mt-4 rounded-md border border-linha bg-board px-3 py-2 text-[12.5px] text-suave">
          Este ambiente ainda não tem a tabela de templates (migração 0046) — a lista aparece vazia.
        </p>
      )}

      {erro && (
        <p role="alert" className="mt-4 rounded-md bg-[#FBEFED] px-3 py-2 text-[12.5px] text-vermelho">
          {erro}
        </p>
      )}

      {/* editor: escreve à esquerda, o lead recebe à direita */}
      {edicao && (
        <div className="mt-5 rounded-lg border border-linha bg-branco p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={edicao.titulo}
              onChange={(e) =>
                setEdicao({
                  ...edicao,
                  titulo: e.target.value,
                  atalho: edicao.atalhoTocado ? edicao.atalho : atalhoDeTitulo(e.target.value),
                })
              }
              placeholder="Título — ex.: Boas-vindas"
              aria-label="Título do template"
              className="h-[34px] min-w-[200px] flex-1 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
            />
            <label className="flex h-[34px] flex-none items-center rounded-md border border-linha bg-branco pl-2.5 text-[13px] focus-within:border-laranja">
              <span className="font-mono text-mute">/</span>
              <input
                value={edicao.atalho}
                onChange={(e) => setEdicao({ ...edicao, atalho: e.target.value, atalhoTocado: true })}
                placeholder="atalho"
                aria-label="Atalho do menu /"
                className="h-full w-[150px] bg-transparent pr-2.5 font-mono text-[12.5px] text-tinta outline-none placeholder:text-mute"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div className="flex flex-col">
              <textarea
                ref={corpoRef}
                value={edicao.corpo}
                onChange={(e) => setEdicao({ ...edicao, corpo: e.target.value })}
                rows={6}
                placeholder={"Oi {{nome}}, aqui é a {{atendente}} da Me Escuta…"}
                aria-label="Corpo da mensagem"
                className="min-h-[140px] flex-1 resize-y rounded-md border border-linha bg-branco px-2.5 py-2 text-[13.5px] leading-relaxed text-tinta outline-none placeholder:text-mute focus:border-laranja"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {CATALOGO_VARIAVEIS.map((v) => (
                  <button
                    key={v.slug}
                    type="button"
                    onClick={() => inserirVariavel(v.slug)}
                    title={v.rotulo}
                    className="rounded-full border border-linha bg-board px-2 py-[3px] font-mono text-[11px] text-suave hover:border-linha-forte hover:text-tinta"
                  >
                    {`{{${v.slug}}}`}
                  </button>
                ))}
                <span
                  className={cn(
                    "ml-auto font-mono text-[11px] tabular-nums",
                    edicao.corpo.length > LIMITE_CORPO ? "text-vermelho" : "text-mute",
                  )}
                >
                  {edicao.corpo.length}/{LIMITE_CORPO}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-mute">
                O lead recebe
              </div>
              <div className="flex-1 rounded-md border border-linha bg-board p-3">
                <div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-xl rounded-br-[4px] border border-linha bg-branco px-3 py-2 text-[13.5px] leading-relaxed text-tinta">
                  {edicao.corpo ? <Previa corpo={edicao.corpo} /> : <span className="text-mute">A mensagem aparece aqui.</span>}
                </div>
              </div>
              {foraDoCatalogo.length > 0 && (
                <p className="mt-1.5 rounded-md bg-nota-fundo px-2.5 py-1.5 text-[12px] text-amarelo">
                  {foraDoCatalogo.map((s) => `{{${s}}}`).join(", ")} não {foraDoCatalogo.length === 1 ? "é variável" : "são variáveis"} do
                  catálogo — vai literal e trava o envio até alguém completar.
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEdicao(null);
                setErro(null);
              }}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-suave hover:bg-hover hover:text-tinta"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={pendente}
              className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
            >
              {edicao.id ? "Salvar alterações" : "Criar template"}
            </button>
          </div>
        </div>
      )}

      {/* lista de ativos */}
      <div className="mt-5">
        {ativos.length === 0 && !edicao && (
          <p className="rounded-md border border-dashed border-linha px-4 py-8 text-center text-[13px] text-mute">
            Nenhum template ainda.{" "}
            {gestor
              ? "Crie o primeiro — ele aparece para toda a equipe no / do campo de conversa."
              : "Quando a gestão criar, eles aparecem no / do campo de conversa."}
          </p>
        )}
        {ativos.map((t) => (
          <div
            key={t.id}
            className="flex min-h-[52px] items-center gap-3 border-b border-[#F1F0EC] px-2 py-2 last:border-b-0 hover:bg-hover"
          >
            <span className="w-[132px] flex-none truncate rounded-md bg-board px-2 py-1 text-center font-mono text-[12px] text-tinta">
              /{t.atalho}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-tinta">{t.titulo}</div>
              <div className="truncate text-[12.5px] text-mute">{t.corpo.replace(/\s+/g, " ")}</div>
            </div>
            <span className="flex-none text-[11.5px] text-mute max-[820px]:hidden">
              {t.autor_id && nomesPorId[t.autor_id] ? nomesPorId[t.autor_id] : ""}
            </span>
            {gestor &&
              (confirmandoId === t.id ? (
                <span className="flex flex-none items-center gap-1.5 text-[12.5px]">
                  <span className="text-suave">Arquivar?</span>
                  <button
                    type="button"
                    onClick={() => arquivar(t)}
                    disabled={pendente}
                    className="rounded-md px-2 py-1 font-medium text-vermelho hover:bg-[#FBEFED]"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoId(null)}
                    className="rounded-md px-2 py-1 text-suave hover:bg-hover hover:text-tinta"
                  >
                    Não
                  </button>
                </span>
              ) : (
                <span className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(t)}
                    className="rounded-md px-2 py-1 text-[12.5px] font-medium text-suave hover:bg-hover hover:text-tinta"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoId(t.id)}
                    className="rounded-md px-2 py-1 text-[12.5px] font-medium text-suave hover:bg-hover hover:text-tinta"
                  >
                    Arquivar
                  </button>
                </span>
              ))}
          </div>
        ))}
      </div>

      {/* arquivados: fora do caminho, com rastro (GO 10.4: terminal — recriar, não reativar) */}
      {arquivados.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-[12.5px] font-medium text-mute hover:text-suave">
            Arquivados ({arquivados.length})
          </summary>
          <div className="mt-2">
            {arquivados.map((t) => (
              <div key={t.id} className="flex min-h-[44px] items-center gap-3 border-b border-[#F1F0EC] px-2 py-1.5 last:border-b-0">
                <span className="w-[132px] flex-none truncate px-2 text-center font-mono text-[12px] text-mute line-through">
                  /{t.atalho}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[13px] text-mute line-through">{t.titulo}</span>
                  {t.motivo_arquivo && <span className="ml-2 text-[12px] text-mute">— {t.motivo_arquivo}</span>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Prévia da substituição: variável do catálogo vira o exemplo (sublinhado = "isto muda por lead"); fora do catálogo acende em âmbar. */
function Previa({ corpo }: { corpo: string }) {
  const partes: React.ReactNode[] = [];
  const re = /\{\{([^{}]*)\}\}/g;
  let i = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(corpo)) !== null) {
    if (m.index > i) partes.push(corpo.slice(i, m.index));
    const slug = m[1].trim();
    if (EXEMPLOS[slug]) {
      partes.push(
        <span key={k++} className="underline decoration-dotted decoration-mute underline-offset-2" title={`{{${slug}}} — muda por lead`}>
          {EXEMPLOS[slug]}
        </span>,
      );
    } else {
      partes.push(
        <span key={k++} className="rounded bg-nota-fundo px-1 font-mono text-[12.5px] text-amarelo" title="fora do catálogo — vai literal">
          {m[0]}
        </span>,
      );
    }
    i = m.index + m[0].length;
  }
  if (i < corpo.length) partes.push(corpo.slice(i));
  return <>{partes}</>;
}

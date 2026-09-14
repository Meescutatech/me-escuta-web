"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIAS,
  contarCampo,
  contarItens,
  definicaoDoRascunho,
  LIMITE_BOTOES,
  LIMITE_CABECALHO,
  LIMITE_CORPO_HSM,
  LIMITE_NOME,
  LIMITE_RODAPE,
  LIMITE_TEXTO_BOTAO,
  nomeDeTitulo,
  preencher,
  problemasDoRascunho,
  rascunhoVazio,
  variaveisDaDefinicao,
  type BotaoTemplate,
  type CategoriaTemplate,
  type Contagem,
  type ProblemaTemplate,
  type RascunhoTemplate,
  type TipoBotao,
} from "@/lib/templates-whatsapp";
import type { CanalParaTemplate } from "@/lib/dados/templates-whatsapp";
import { criarTemplateWhatsapp } from "@/app/(app)/configuracoes/templates-whatsapp/actions";
import { cn } from "@/lib/utils";

/*
 * Escrever um template (Design/templates-hsm-r22.html, tela 2).
 *
 * A tela existe para evitar dois custos que só aparecem 24 horas depois: **a recusa por limite
 * estourado** e **o nome queimado**. Nome de template não se edita, e nome apagado fica bloqueado
 * para reuso — por isso escrever e submeter são dois atos, com um rascunho revisável no meio.
 *
 * Três decisões que não são estética:
 *
 *  · O CONTADOR MOSTRA `usado/limite`, NUNCA "restam N". Âmbar em 90%, vermelho ao estourar. O
 *    limite da Meta é duro e a punição é assíncrona: quem estoura só descobre até 24 horas
 *    depois, por uma recusa que não diz qual campo foi. Um contador que só aparece quando dói
 *    chega tarde por definição.
 *
 *  · A PRÉVIA FICA AO LADO, sempre visível. A Meta aprova o que a pessoa lê, não o formulário;
 *    editor sem prévia produz template reprovado por formatação.
 *
 *  · A CATEGORIA VEM COM A CONSEQUÊNCIA ESCRITA, não só com o nome — e com o aviso de que a Meta
 *    pode reclassificar por conta própria, mudando o custo sem passar por ninguém daqui.
 */

export function ConstrutorTemplate({ canais }: { canais: CanalParaTemplate[] }) {
  const router = useRouter();
  const [salvando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [nomeTocado, setNomeTocado] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [r, setR] = useState<RascunhoTemplate>(() => rascunhoVazio(canais[0]?.phone_number_id ?? ""));

  const definicao = useMemo(() => definicaoDoRascunho(r), [r]);
  const variaveis = useMemo(() => variaveisDaDefinicao(definicao), [definicao]);
  const problemas = useMemo(() => problemasDoRascunho(r), [r]);
  const canal = canais.find((c) => c.phone_number_id === r.canal_id) ?? null;

  const patch = (p: Partial<RascunhoTemplate>) => setR((atual) => ({ ...atual, ...p }));

  function mudarTitulo(v: string) {
    setTitulo(v);
    if (!nomeTocado) patch({ nome: nomeDeTitulo(v) });
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const res = await criarTemplateWhatsapp({
        nome: r.nome,
        idioma: r.idioma,
        categoria: r.categoria,
        canal_id: r.canal_id,
        definicao: definicaoDoRascunho(r),
      });
      if (!res.ok) {
        setErro(res.motivo ?? "não deu para salvar o rascunho");
        return;
      }
      // Criar NUNCA submete (§3 · DoD 2). A submissão é um segundo ato, feito na lista, com o
      // rascunho já revisado — e é lá que ele fica se o autor mudar de ideia no meio.
      router.push("/configuracoes/templates-whatsapp");
      router.refresh();
    });
  }

  const problemaDe = (campo: ProblemaTemplate["campo"]) =>
    problemas.find((p) => p.campo === campo)?.mensagem ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-suave">
          Escrever não envia. O template nasce rascunho e fica aqui até alguém mandar para análise —
          porque o nome <strong className="font-semibold text-tinta">não muda depois</strong>, e nome
          apagado fica bloqueado para reuso.
        </p>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            disabled={salvando || problemas.some((p) => p.campo === "nome" || p.campo === "canal") || !r.corpo.trim()}
            onClick={() => salvar()}
            className="h-[34px] rounded-md border border-linha bg-branco px-3 text-[13px] font-medium text-tinta hover:bg-hover disabled:cursor-not-allowed disabled:text-mute disabled:hover:bg-branco"
          >
            Salvar rascunho
          </button>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mt-4 rounded-md bg-vermelho-bg px-3 py-2 text-[12.5px] text-vermelho">
          {erro}
        </p>
      )}

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5 max-lg:grid-cols-1">
        {/* ─────────────── coluna do editor ─────────────── */}
        <div>
          <Campo
            rotulo="Título"
            dica="só você vê — serve para achar o template na lista"
            contagem={null}
          >
            <input
              value={titulo}
              onChange={(e) => mudarTitulo(e.target.value)}
              placeholder="ex.: Retomar avaliação"
              className={ENTRADA}
            />
          </Campo>

          <Campo
            rotulo="Nome na Meta"
            dica="é o identificador; não dá para renomear depois"
            contagem={contarCampo(r.nome, LIMITE_NOME)}
            erro={problemaDe("nome")}
          >
            <input
              value={r.nome}
              onChange={(e) => {
                setNomeTocado(true);
                patch({ nome: e.target.value });
              }}
              placeholder="retomar_avaliacao"
              className={cn(ENTRADA, "font-mono text-[13px]", problemaDe("nome") && ERRO_BORDA)}
            />
            <p className="mt-1.5 text-[12px] text-suave">
              Minúsculas, números e underscore.{" "}
              <strong className="font-semibold text-tinta">Não dá para renomear depois</strong>, e um
              nome apagado fica bloqueado para reuso — por isso o rascunho existe.
            </p>
          </Campo>

          <Campo rotulo="Número" dica="por qual número este template vai sair" contagem={null} erro={problemaDe("canal")}>
            {canais.length === 0 ? (
              <p className="rounded-md border border-dashed border-linha px-3 py-2.5 text-[12.5px] text-mute">
                Nenhum número de WhatsApp ativo neste ambiente. Cadastre um em Configurações › Números
                antes de escrever o template — a WABA sai do número, e sem ela não há para onde
                submeter.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {canais.map((c) => (
                  <button
                    key={c.phone_number_id}
                    type="button"
                    role="radio"
                    aria-checked={r.canal_id === c.phone_number_id}
                    onClick={() => patch({ canal_id: c.phone_number_id })}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                      r.canal_id === c.phone_number_id
                        ? "border-navy bg-[#EAECF5] font-semibold text-navy"
                        : "border-linha bg-branco text-suave hover:bg-hover hover:text-tinta",
                    )}
                  >
                    {c.rotulo}
                    {/* o selo TESTE nunca se esconde — regra do M7, e hoje TODO número é de teste */}
                    {c.teste && (
                      <span className="ml-1.5 rounded bg-board px-1 font-mono text-[10px] tracking-wide text-mute">
                        TESTE
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Campo>

          <Campo rotulo="Categoria" dica="decide o preço e a facilidade de aprovar" contagem={null}>
            <div role="radiogroup" aria-label="Categoria" className="grid gap-2">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.chave}
                  type="button"
                  role="radio"
                  aria-checked={r.categoria === c.chave}
                  onClick={() => patch({ categoria: c.chave as CategoriaTemplate })}
                  className={cn(
                    "flex gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                    r.categoria === c.chave
                      ? "border-navy bg-[#EAECF5]"
                      : "border-linha bg-branco hover:bg-hover",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 h-[15px] w-[15px] flex-none rounded-full border",
                      r.categoria === c.chave ? "border-[4.5px] border-navy" : "border-[1.5px] border-mute",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-tinta">{c.rotulo}</span>
                    <span className="mt-0.5 block text-[12.5px] text-suave">{c.consequencia}</span>
                  </span>
                </button>
              ))}
            </div>
            {/* §8.4 · o custo pode mudar sem ninguém daqui aprovar. Dizer isso na escolha é mais
                barato que descobrir na fatura. */}
            <div className="mt-2.5 flex items-start gap-2.5 rounded-md border border-linha bg-branco px-3.5 py-2.5 text-[13px]">
              <Info />
              <div className="min-w-0">
                <b className="font-semibold">A Meta pode mudar esta escolha.</b>
                <p className="mt-0.5 text-suave">
                  Se ela achar que o texto é promoção, reclassifica para Marketing na análise — e o
                  custo muda sem passar por você. Quando isso acontecer, a lista mostra{" "}
                  <span className="font-mono text-[12px]">Marketing ← Utilidade</span>.
                </p>
              </div>
            </div>
          </Campo>

          <div className="my-6 h-px bg-linha" />

          <Campo
            rotulo="Cabeçalho"
            dica="opcional · aceita 1 variável"
            contagem={contarCampo(r.cabecalho, LIMITE_CABECALHO)}
            erro={problemaDe("cabecalho")}
          >
            <input
              value={r.cabecalho}
              onChange={(e) => patch({ cabecalho: e.target.value })}
              placeholder="Sua avaliação auditiva"
              className={cn(ENTRADA, problemaDe("cabecalho") && ERRO_BORDA)}
            />
          </Campo>

          <Campo
            rotulo="Mensagem"
            dica="escreva {{nome}} para inserir variável"
            contagem={contarCampo(r.corpo, LIMITE_CORPO_HSM)}
            erro={problemaDe("corpo")}
          >
            <textarea
              value={r.corpo}
              onChange={(e) => patch({ corpo: e.target.value })}
              rows={6}
              placeholder={"Oi {{nome}}, aqui é a Me Escuta."}
              className={cn(
                ENTRADA,
                "min-h-[120px] resize-y leading-relaxed",
                problemaDe("corpo") && ERRO_BORDA,
              )}
            />
          </Campo>

          <Campo
            rotulo="Rodapé"
            dica="opcional · sem variável"
            contagem={contarCampo(r.rodape, LIMITE_RODAPE)}
            erro={problemaDe("rodape")}
          >
            <input
              value={r.rodape}
              onChange={(e) => patch({ rodape: e.target.value })}
              placeholder="Se preferir não receber, é só responder."
              className={cn(ENTRADA, problemaDe("rodape") && ERRO_BORDA)}
            />
          </Campo>

          <Campo
            rotulo="Botões"
            dica="até 10 · no máximo 2 de link e 1 de telefone"
            contagem={contarItens(r.botoes.length, LIMITE_BOTOES)}
            erro={problemaDe("botoes")}
          >
            {r.botoes.map((b, i) => (
              <div
                key={i}
                className="mb-1.5 flex items-center gap-2 rounded-md border border-linha bg-branco px-2.5 py-2"
              >
                <select
                  value={b.tipo}
                  aria-label="Tipo do botão"
                  onChange={(e) => trocarBotao(i, { tipo: e.target.value as TipoBotao })}
                  className="w-[104px] flex-none cursor-pointer bg-transparent text-[11.5px] font-semibold uppercase tracking-[0.05em] text-suave outline-none"
                >
                  <option value="QUICK_REPLY">Resposta</option>
                  <option value="URL">Link</option>
                  <option value="PHONE_NUMBER">Telefone</option>
                  <option value="COPY_CODE">Copiar</option>
                </select>
                <input
                  value={b.texto}
                  onChange={(e) => trocarBotao(i, { texto: e.target.value })}
                  placeholder="Quero retomar"
                  aria-label={`Texto do botão ${i + 1}`}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute"
                />
                {b.tipo === "URL" && (
                  <input
                    value={b.url ?? ""}
                    onChange={(e) => trocarBotao(i, { url: e.target.value })}
                    placeholder="https://…"
                    aria-label={`Endereço do botão ${i + 1}`}
                    className="w-[150px] min-w-0 flex-none bg-transparent font-mono text-[12px] outline-none placeholder:text-mute"
                  />
                )}
                {b.tipo === "PHONE_NUMBER" && (
                  <input
                    value={b.telefone ?? ""}
                    onChange={(e) => trocarBotao(i, { telefone: e.target.value })}
                    placeholder="+55 31 …"
                    aria-label={`Telefone do botão ${i + 1}`}
                    className="w-[120px] min-w-0 flex-none bg-transparent font-mono text-[12px] outline-none placeholder:text-mute"
                  />
                )}
                <Contador c={contarCampo(b.texto, LIMITE_TEXTO_BOTAO)} />
                <button
                  type="button"
                  aria-label={`Remover botão ${i + 1}`}
                  onClick={() => patch({ botoes: r.botoes.filter((_, j) => j !== i) })}
                  className="grid h-[22px] w-[22px] flex-none place-items-center rounded text-mute hover:bg-hover hover:text-vermelho"
                >
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" className="h-3 w-3 stroke-current">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={r.botoes.length >= LIMITE_BOTOES}
              onClick={() => patch({ botoes: [...r.botoes, { tipo: "QUICK_REPLY", texto: "" }] })}
              className="mt-0.5 rounded-md border border-linha bg-branco px-2.5 py-1 text-[12.5px] font-medium text-tinta hover:bg-hover disabled:text-mute"
            >
              Adicionar botão
            </button>
          </Campo>

          <div className="my-6 h-px bg-linha" />

          <Campo rotulo="Exemplos das variáveis" dica="a Meta recusa sem isto" contagem={null} erro={problemaDe("exemplos")}>
            {variaveis.length === 0 ? (
              <p className="text-[12.5px] text-mute">
                Nenhuma variável no texto ainda. Escreva{" "}
                <span className="font-mono">{"{{nome}}"}</span> na mensagem para criar uma.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-linha">
                {variaveis.map((v) => {
                  const vazio = !(r.exemplos[v] ?? "").trim();
                  return (
                    <div key={v} className="flex items-center gap-2.5 border-b border-linha px-3 py-2 last:border-b-0">
                      <span className="flex-none rounded bg-[#EAECF5] px-1.5 py-px font-mono text-[12.5px] text-navy">
                        {`{{${v}}}`}
                      </span>
                      <input
                        value={r.exemplos[v] ?? ""}
                        onChange={(e) => patch({ exemplos: { ...r.exemplos, [v]: e.target.value } })}
                        placeholder="ex.: Maria"
                        aria-label={`Exemplo de ${v}`}
                        className="min-w-0 flex-1 border-b border-dashed border-linha bg-transparent px-0.5 py-0.5 text-[13px] outline-none placeholder:text-mute focus:border-laranja"
                      />
                      {vazio && <span className="flex-none text-[11.5px] font-medium text-vermelho">falta</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 text-[12px] text-suave">
              Servem só para a análise — quem recebe vê o valor real da pessoa.
            </p>
          </Campo>
        </div>

        {/* ─────────────── coluna da prévia ─────────────── */}
        <div className="sticky top-5 max-lg:static">
          <div className="overflow-hidden rounded-lg border border-linha bg-branco">
            <div className="flex items-center gap-2 border-b border-linha px-3 py-2.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-suave">
                Como chega
              </span>
              {canal && (
                <span className="ml-auto truncate rounded-full border border-linha bg-board px-2 py-0.5 text-[11.5px] text-suave">
                  {canal.rotulo}
                </span>
              )}
            </div>
            <div className="bg-[#EDE9E3] px-3.5 py-4">
              <div className="rounded-lg bg-branco px-3 py-2.5 shadow-[0_1px_1px_rgba(31,35,40,.06)]">
                {r.cabecalho && (
                  <div className="mb-1.5 break-words text-[13.5px] font-[650] text-tinta">
                    {preencher(r.cabecalho, r.exemplos)}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-tinta">
                  {r.corpo ? (
                    preencher(r.corpo, r.exemplos)
                  ) : (
                    <span className="text-mute">A mensagem aparece aqui, como o cliente lê.</span>
                  )}
                </div>
                {r.rodape && <div className="mt-1.5 break-words text-[12px] text-suave">{r.rodape}</div>}
                {r.botoes.length > 0 && (
                  <div className="mt-1.5 border-t border-linha">
                    {r.botoes.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center border-b border-linha py-2 text-[13.5px] font-medium text-navy last:border-b-0"
                      >
                        {b.texto || <span className="text-mute">botão sem texto</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="flex items-start gap-1.5 px-3 py-2.5 text-[12px] text-suave">
              <Info pequeno />
              A Meta aprova o que a pessoa lê, não o formulário. Confira aqui antes de enviar.
            </p>
          </div>

          {/* Tudo o que impede submeter, de uma vez — corrigir um problema por vez com 24 horas
              de espera entre eles é exatamente o custo que esta tela existe para eliminar. */}
          {problemas.length > 0 && (
            <div className="mt-3 flex items-start gap-2.5 rounded-md bg-vermelho-bg px-3.5 py-3 text-[13px]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth={1.8}
                strokeLinecap="round"
                aria-hidden="true"
                className="mt-px h-4 w-4 flex-none stroke-vermelho"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <div className="min-w-0">
                <b className="font-semibold text-vermelho">
                  {problemas.length === 1
                    ? "Uma coisa impede o envio para análise"
                    : `${problemas.length} coisas impedem o envio para análise`}
                </b>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-suave">
                  {problemas.map((p, i) => (
                    <li key={i}>{p.mensagem}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {problemas.length === 0 && r.corpo.trim() && (
            <p className="mt-3 rounded-md border border-linha bg-board px-3.5 py-2.5 text-[12.5px] text-suave">
              Nada impede o envio. Salve o rascunho e mande para análise na lista — a Meta responde em
              até 24 horas, e o nome deixa de ser editável nesse instante.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  function trocarBotao(i: number, p: Partial<BotaoTemplate>) {
    patch({ botoes: r.botoes.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  }
}

const ENTRADA =
  "w-full rounded-md border border-linha bg-branco px-2.5 py-2 text-[13.5px] text-tinta outline-none placeholder:text-mute focus:border-laranja";
const ERRO_BORDA = "border-vermelho";

function Campo({
  rotulo,
  dica,
  contagem,
  erro,
  children,
}: {
  rotulo: string;
  dica?: string;
  contagem: Contagem | null;
  erro?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[18px]">
      <div className="mb-1.5 flex items-baseline gap-2">
        <label className="flex-none whitespace-nowrap text-[12.5px] font-semibold text-tinta">{rotulo}</label>
        {dica && <span className="min-w-0 truncate text-[12px] text-suave">{dica}</span>}
        {contagem && (
          <span className="ml-auto flex-none">
            <Contador c={contagem} />
          </span>
        )}
      </div>
      {children}
      {erro && <p className="mt-1.5 text-[12px] text-vermelho">{erro}</p>}
    </div>
  );
}

/** `usado/limite`, sempre. Âmbar em 90%, vermelho ao estourar — o aviso antes da dor. */
function Contador({ c }: { c: Contagem }) {
  return (
    <span
      className={cn(
        "font-mono text-[11.5px] tabular-nums",
        c.estado === "estourou" ? "font-semibold text-vermelho" : c.estado === "perto" ? "font-semibold text-amarelo" : "text-mute",
      )}
      title={
        c.estado === "estourou"
          ? "passou do limite da Meta — a recusa por isso demora até 24 horas para chegar"
          : undefined
      }
    >
      {c.texto}
    </span>
  );
}

function Info({ pequeno }: { pequeno?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      className={cn("mt-px flex-none stroke-mute", pequeno ? "h-3.5 w-3.5" : "h-4 w-4")}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

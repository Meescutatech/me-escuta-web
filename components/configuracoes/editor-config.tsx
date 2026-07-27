"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { publicarConfig } from "@/app/(app)/configuracoes/avancado/actions";
import {
  conteudoIgual,
  contratoDe,
  podePublicarConfig,
  temErro,
  validarConteudo,
  versaoResultante,
  type ConfigVigente,
  type Conteudo,
  type ContextoValidacao,
  type VersaoHistorico,
} from "./regras/config.ts";
import type { Papel } from "./regras/canais.ts";
import { AREA, BTN, BarraPublicacao, Cabecalho, ENTRADA, Faixa, Secao } from "./kit";
import { HistoricoConfig } from "./historico-config";

/**
 * F14 · editor genérico de uma chave. Duas abas: FORMULÁRIO derivado do formato do valor e JSON,
 * a válvula de escape honesta.
 *
 * Onde está a ousadia desta tela, e é uma só: config aqui não é formulário — é VALOR COM
 * CONSEQUÊNCIA. Ao lado do campo fica escrito o que muda quando salvar e onde aquilo aparece, e
 * embaixo, o histórico de quem mudou o quê. É a mesma decisão da página da Clara com o prompt, e é
 * o que separa "editar um JSON" de "publicar uma decisão de negócio".
 */
export function EditorConfig({
  nome,
  vigente,
  historico,
  contexto,
  meuPapel,
}: {
  nome: string;
  vigente: ConfigVigente | null;
  historico: VersaoHistorico[];
  contexto: ContextoValidacao;
  meuPapel: Papel | null;
}) {
  const gestor = podePublicarConfig(meuPapel);
  const contrato = contratoDe(nome);
  const original = vigente?.payload ?? {};
  const [texto, setTexto] = useState(() => JSON.stringify(original, null, 2));
  const [aba, setAba] = useState<"form" | "json">("form");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const analisado = useMemo(() => analisar(texto), [texto]);
  const conteudo: Conteudo = analisado.ok ? analisado.valor : original;
  const mudou = analisado.ok && !conteudoIgual(conteudo, original);
  const problemas = analisado.ok ? validarConteudo(nome, conteudo, contexto) : [];

  function publicar() {
    if (!vigente) return;
    setErro(null);
    setConflito(null);
    iniciar(async () => {
      const r = await publicarConfig({ nome, versaoBase: vigente.versao, conteudo, justificativa });
      if (r.ok) {
        setJustificativa("");
        return;
      }
      if (r.conflito) setConflito(r.motivo ?? null);
      else setErro(r.motivo ?? "não deu para publicar");
    });
  }

  return (
    <>
      <Cabecalho
        voltar={
          // #ed-voltar NUNCA fica desabilitado, nem em leitura (ressalva 4 do Croqui): sair de uma
          // tela nunca é uma ação que o papel restringe — travar a saída prende quem só veio olhar.
          <Link
            href="/configuracoes/avancado"
            className="mb-2 inline-block text-[13px] text-suave hover:text-tinta hover:underline"
          >
            ‹ Todas as configurações
          </Link>
        }
        titulo={<span className="font-mono text-[18px] font-semibold tracking-normal">{nome}</span>}
        contador={vigente ? `versão ${vigente.versao}` : undefined}
        descricao={
          <>
            {contrato?.consequencia ?? "Valor que o sistema lê como dado."}
            {historico[0] ? ` Publicada ${reciboDe(historico[0])}.` : ""}
          </>
        }
      />

      {!gestor ? (
        <Faixa tom="info">
          Só <span className="font-mono font-semibold">admin</span> e Proprietário publicam
          configuração.
        </Faixa>
      ) : null}
      {!vigente ? (
        <Faixa tom="erro">
          Não foi possível ler o valor desta chave. A conexão caiu — tente de novo em alguns
          segundos.
        </Faixa>
      ) : null}
      {!analisado.ok ? (
        <Faixa tom="erro">
          {analisado.motivo} O texto continua como você digitou.
        </Faixa>
      ) : null}
      {conflito ? (
        <Faixa tom="erro" acao={<button type="button" onClick={() => location.reload()}>Recarregar</button>}>
          {conflito}
        </Faixa>
      ) : null}
      {erro ? <Faixa tom="erro">{erro}</Faixa> : null}
      {problemas.map((p) => (
        <Faixa key={p.campo + p.motivo} tom={p.gravidade === "erro" ? "erro" : "ambar"}>
          <span className="font-mono">{p.campo}</span> — {p.motivo}
        </Faixa>
      ))}

      <div className="mb-0.5 flex gap-[18px] border-b border-linha" role="tablist" aria-label="Modo de edição">
        {(
          [
            ["form", "Formulário"],
            ["json", "JSON"],
          ] as const
        ).map(([k, r]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={aba === k}
            onClick={() => setAba(k)}
            className={`relative pb-2 text-[13.5px] ${
              aba === k
                ? "font-semibold text-navy after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-navy after:content-['']"
                : "text-suave hover:text-tinta"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {aba === "form" ? (
          <FormularioDerivado
            valor={conteudo}
            somenteLeitura={!gestor}
            aoMudar={(novo) => setTexto(JSON.stringify(novo, null, 2))}
          />
        ) : (
          <textarea
            className={`${AREA} min-h-[280px] font-mono text-[12.5px]`}
            value={texto}
            readOnly={!gestor}
            spellCheck={false}
            aria-label={`Valor de ${nome} como JSON`}
            onChange={(e) => setTexto(e.target.value)}
          />
        )}
      </div>

      {contrato ? (
        <div className="mt-4 rounded-md border border-linha bg-board p-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">
            O que muda quando publicar
          </p>
          <p className="mt-1.5 text-[13px] text-tinta">{contrato.consequencia}</p>
          <p className="mt-2 text-[12.5px] text-suave">
            Onde aparece: {contrato.ondeAparece.join(" · ")}
          </p>
        </div>
      ) : null}

      <Secao rotulo="Histórico">
        <HistoricoConfig versoes={historico} />
      </Secao>

      {mudou && gestor ? (
        <>
          <div className="mt-3">
            <label className="mb-1.5 block text-[13px] font-medium text-tinta" htmlFor="jus-config">
              O que mudou
            </label>
            <input
              id="jus-config"
              className={ENTRADA}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="fica no histórico — é o que alguém vai ler daqui a três meses"
            />
          </div>
          <BarraPublicacao
            texto="1 alteração não publicada"
            acoes={
              <>
                <button
                  className={BTN.texto}
                  type="button"
                  onClick={() => setTexto(JSON.stringify(original, null, 2))}
                >
                  Descartar
                </button>
                <button
                  className={BTN.primario}
                  type="button"
                  disabled={pendente || temErro(problemas) || !justificativa.trim()}
                  onClick={publicar}
                >
                  Publicar versão {vigente ? versaoResultante(vigente.versao) : ""}
                </button>
              </>
            }
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Formulário derivado do FORMATO do valor: booleano vira interruptor, número vira campo numérico,
 * texto curto vira entrada, texto longo vira área, lista de escalares vira chips. O que a forma
 * não representa (objeto aninhado, lista de objetos) aparece em leitura, com o recado de editar
 * pelo JSON — inventar um editor para estrutura arbitrária é como se erra o valor sem perceber.
 */
function FormularioDerivado({
  valor,
  somenteLeitura,
  aoMudar,
}: {
  valor: Conteudo;
  somenteLeitura: boolean;
  aoMudar: (novo: Conteudo) => void;
}) {
  const chaves = Object.keys(valor ?? {});
  if (chaves.length === 0) {
    return <p className="py-4 text-[13px] text-suave">Este valor está vazio.</p>;
  }
  const trocar = (k: string, v: unknown) => aoMudar({ ...valor, [k]: v });

  return (
    <div>
      {chaves.map((k) => {
        const v = valor[k];
        const complexo = v !== null && typeof v === "object";
        return (
          <div
            key={k}
            className={`flex gap-3 border-b border-linha last:border-b-0 ${complexo ? "items-start py-3" : "min-h-[38px] items-center"}`}
          >
            <span className={`w-[180px] flex-none text-[13px] text-suave ${complexo ? "pt-1.5" : ""}`}>
              {k}
            </span>
            <div className="min-w-0 flex-1">
              {typeof v === "boolean" ? (
                <button
                  type="button"
                  aria-pressed={v}
                  disabled={somenteLeitura}
                  onClick={() => trocar(k, !v)}
                  className="inline-flex items-center gap-2 text-[13px] text-suave disabled:cursor-not-allowed"
                >
                  <span
                    className={`relative h-5 w-[34px] flex-none rounded-full border transition-colors ${
                      v ? "border-verde bg-verde" : "border-linha bg-board"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full border bg-branco transition-transform ${
                        v ? "translate-x-3.5 border-verde" : "border-linha"
                      }`}
                    />
                  </span>
                  {v ? "ligado" : "desligado"}
                </button>
              ) : typeof v === "number" ? (
                <input
                  className={`${ENTRADA} max-w-[140px] font-mono tabular-nums`}
                  type="number"
                  value={v}
                  readOnly={somenteLeitura}
                  aria-label={k}
                  onChange={(e) => trocar(k, Number(e.target.value))}
                />
              ) : typeof v === "string" ? (
                v.length > 90 ? (
                  <textarea
                    className={AREA}
                    rows={3}
                    value={v}
                    readOnly={somenteLeitura}
                    aria-label={k}
                    onChange={(e) => trocar(k, e.target.value)}
                  />
                ) : (
                  <input
                    className={ENTRADA}
                    value={v}
                    readOnly={somenteLeitura}
                    aria-label={k}
                    onChange={(e) => trocar(k, e.target.value)}
                  />
                )
              ) : Array.isArray(v) && v.every((x) => typeof x !== "object") ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {v.map((x, i) => (
                    <span
                      key={`${String(x)}-${i}`}
                      className="inline-flex h-5 items-center gap-1 rounded-full border border-linha bg-board px-2 text-[11.5px] text-suave"
                    >
                      {String(x)}
                      {!somenteLeitura ? (
                        <button
                          type="button"
                          aria-label={`Remover ${String(x)}`}
                          className="pl-0.5 text-mute hover:text-vermelho"
                          onClick={() => trocar(k, v.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-linha bg-board px-2.5 py-2">
                  <p className="font-mono text-[12px] text-suave">
                    {Array.isArray(v) ? `lista com ${v.length} item(ns)` : "objeto"}
                  </p>
                  <p className="mt-1 text-[12.5px] text-suave">
                    Esta estrutura o formulário não representa. Edite pela aba JSON.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Analise = { ok: true; valor: Conteudo } | { ok: false; motivo: string };

/** JSON inválido NÃO some com o texto digitado: a recusa diz onde, e o campo continua como está. */
function analisar(texto: string): Analise {
  try {
    const v = JSON.parse(texto);
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, motivo: "O valor precisa ser um objeto JSON — o banco recusa qualquer outra coisa." };
    }
    return { ok: true, valor: v as Conteudo };
  } catch (e) {
    return { ok: false, motivo: `JSON inválido: ${e instanceof Error ? e.message : String(e)}.` };
  }
}

function reciboDe(v: VersaoHistorico): string {
  const quando = v.vigente_desde
    ? new Date(v.vigente_desde).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "—";
  const quem = v.publicado_por_nome ?? v.publicado_por_email ?? v.criado_por ?? "—";
  return `${quando} por ${quem}`;
}

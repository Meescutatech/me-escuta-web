"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publicarConfig } from "@/app/(app)/configuracoes/avancado/actions";
import {
  conteudoIgual,
  podePublicarConfig,
  temErro,
  validarConteudo,
  versaoResultante,
  type ConfigVigente,
  type Conteudo,
  type ContextoValidacao,
  type ProblemaConfig,
  type VersaoHistorico,
} from "./regras/config.ts";
import type { Papel } from "./regras/canais.ts";
import { BTN, BarraPublicacao, Cabecalho, Dialogo, ENTRADA, Faixa, Secao } from "./kit";
import { HistoricoConfig } from "./historico-config";

/**
 * F14 · Tela DEDICADA do funil (mockup r10, tela 1). O funil não entra no editor genérico de JSON:
 * mexer nas etapas por campo de texto livre é a forma mais rápida de derrubar o board de 680 leads.
 *
 * Duas decisões do mockup que carregam significado:
 *
 *  1. A ORDEM É DADO. As etapas se reordenam na lista e a posição vira `ordem` no payload — não há
 *     campo "ordem" para digitar, porque um número digitado e uma lista visível divergem na
 *     primeira distração.
 *  2. "APROVAR E PUBLICAR" É DE DOIS PASSOS (decisão do Orquestrador). Aprovar a proposta de um
 *     agente CARREGA a alteração na tela; publicar continua sendo um segundo ato, com a barra de
 *     publicação e o diff disponível. Um clique que aprova e publica junto tira do humano o único
 *     momento em que ele veria o que está aceitando — e o princípio da casa é que o agente propõe
 *     e o humano valida.
 */

export interface EtapaFunil {
  chave: string;
  nome: string;
  cor?: string;
  tipo?: string;
  ordem?: number;
}

const TIPOS = ["aberta", "ganho", "perdido"];

export function EditorFunil({
  vigente,
  historico,
  contexto,
  meuPapel,
  indisponivel,
}: {
  vigente: ConfigVigente | null;
  historico: VersaoHistorico[];
  contexto: ContextoValidacao;
  meuPapel: Papel | null;
  indisponivel: boolean;
}) {
  const router = useRouter();
  const gestor = podePublicarConfig(meuPapel);
  // a VIGENTE do histórico, não a primeira linha por acaso: recibo e lista leem o mesmo dado.
  const vigenteHist = historico.find((h) => h.vigente) ?? historico[0];
  const original = useMemo<EtapaFunil[]>(() => lerEtapas(vigente?.payload), [vigente]);
  const [etapas, setEtapas] = useState<EtapaFunil[]>(original);
  const [justificativa, setJustificativa] = useState("");
  const [verDiff, setVerDiff] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const conteudo: Conteudo = { etapas: etapas.map((e, i) => ({ ...e, ordem: i + 1 })) };
  const mudou = !conteudoIgual(conteudo, vigente?.payload ?? {});
  const problemas = validarConteudo("funil_vendas", conteudo, contexto);
  const diff = diferencas(original, etapas);

  function publicar() {
    if (!vigente) return;
    setErro(null);
    setConflito(null);
    iniciar(async () => {
      const r = await publicarConfig({
        nome: "funil_vendas",
        versaoBase: vigente.versao,
        conteudo,
        justificativa,
      });
      if (r.ok) {
        setJustificativa("");
        router.refresh(); // B2: o recibo e o historico se derivam do DADO relido, nunca de string local
        return;
      }
      if (r.conflito) setConflito(r.motivo ?? null);
      else setErro(r.motivo ?? "não deu para publicar");
    });
  }

  return (
    <>
      <Cabecalho
        titulo="Funil de vendas"
        contador={vigente ? `versão ${vigente.versao}` : undefined}
        descricao={
          <>
            As etapas que o quadro mostra.
            {vigenteHist ? ` Publicada ${reciboDe(vigenteHist)}.` : ""}
          </>
        }
      />

      {!gestor ? (
        <Faixa tom="info">
          Só <span className="font-mono font-semibold">admin</span> e Proprietário publicam
          configuração.
        </Faixa>
      ) : null}
      {indisponivel ? (
        <Faixa tom="erro">
          Não foi possível ler <span className="font-mono">core.v_config_vigente</span>. A conexão
          caiu — tente de novo em alguns segundos.
        </Faixa>
      ) : null}
      {conflito ? (
        <Faixa tom="erro" acao={<button type="button" onClick={() => location.reload()}>Recarregar</button>}>
          {conflito}
        </Faixa>
      ) : null}
      {erro ? <Faixa tom="erro">{erro}</Faixa> : null}
      {problemas
        .filter((p) => p.gravidade === "erro")
        .map((p) => (
          <Faixa key={p.campo + p.motivo} tom="erro">
            {p.motivo}
          </Faixa>
        ))}
      {problemas
        .filter((p) => p.gravidade === "aviso")
        .map((p) => (
          <Faixa key={p.campo + p.motivo} tom="ambar">
            {p.motivo}
          </Faixa>
        ))}

      <Secao
        rotulo="Etapas"
        contador={etapas.length}
        rodape={
          gestor ? (
            <button
              className={BTN.acento}
              type="button"
              onClick={() =>
                setEtapas([...etapas, { chave: `etapa_${etapas.length + 1}`, nome: "Nova etapa", tipo: "aberta" }])
              }
            >
              + Adicionar etapa
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-[20px_minmax(0,1fr)_112px_116px_56px] items-center gap-3 border-b border-linha px-2 pb-2 pt-2.5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-suave">
          <span />
          <span>Nome</span>
          <span>Tipo</span>
          <span>Cor</span>
          <span>Ordem</span>
        </div>
        {etapas.map((e, i) => (
          <div
            key={`${e.chave}-${i}`}
            className="grid min-h-[48px] grid-cols-[20px_minmax(0,1fr)_112px_116px_56px] items-center gap-3 border-b border-linha px-2 py-1.5 hover:bg-hover"
          >
            <button
              type="button"
              disabled={!gestor || i === 0}
              title="subir"
              aria-label={`Subir ${e.nome}`}
              className="cursor-grab text-[13px] text-mute disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => setEtapas(mover(etapas, i, i - 1))}
            >
              ⠿
            </button>
            <input
              className={`${ENTRADA} h-7`}
              value={e.nome}
              disabled={!gestor}
              aria-label={`Nome da etapa ${i + 1}`}
              onChange={(ev) => setEtapas(trocar(etapas, i, { nome: ev.target.value }))}
            />
            <select
              className={`${ENTRADA} h-7`}
              value={e.tipo ?? "aberta"}
              disabled={!gestor}
              aria-label={`Tipo da etapa ${e.nome}`}
              onChange={(ev) => setEtapas(trocar(etapas, i, { tipo: ev.target.value }))}
            >
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                style={{ background: e.cor ?? "#94a3b8" }}
                className="inline-block h-3 w-3 rounded-[3px] border border-[rgba(31,35,40,.14)]"
              />
              <input
                className={`${ENTRADA} h-7 font-mono text-[12px]`}
                value={e.cor ?? ""}
                disabled={!gestor}
                aria-label={`Cor da etapa ${e.nome}`}
                onChange={(ev) => setEtapas(trocar(etapas, i, { cor: ev.target.value }))}
              />
            </span>
            <span className="font-mono text-[12.5px] tabular-nums text-suave">{i + 1}</span>
          </div>
        ))}
      </Secao>

      <Secao rotulo="Histórico">
        <HistoricoConfig versoes={historico} />
      </Secao>

      {mudou && gestor ? (
        <BarraPublicacao
          texto={
            <>
              <span className="tabular-nums">{diff.length}</span>{" "}
              {diff.length === 1 ? "alteração não publicada" : "alterações não publicadas"}
            </>
          }
          acoes={
            <>
              <button className={BTN.texto} type="button" onClick={() => setEtapas(original)}>
                Descartar
              </button>
              <button className={BTN.secundario} type="button" onClick={() => setVerDiff(true)}>
                Ver o que muda
              </button>
              <button
                className={BTN.primario}
                type="button"
                disabled={pendente || temErro(problemas) || !vigente || !justificativa.trim()}
                onClick={publicar}
              >
                Publicar versão {vigente ? versaoResultante(vigente.versao) : ""}
              </button>
            </>
          }
        />
      ) : null}

      {mudou && gestor ? (
        <div className="mt-3">
          <label className="mb-1.5 block text-[13px] font-medium text-tinta" htmlFor="jus-funil">
            O que mudou
          </label>
          <input
            id="jus-funil"
            className={ENTRADA}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="fica no histórico — é o que alguém vai ler daqui a três meses"
          />
        </div>
      ) : null}

      {verDiff ? (
        <Dialogo
          titulo="O que muda"
          largura={520}
          aoFechar={() => setVerDiff(false)}
          acoes={
            <button className={BTN.secundario} type="button" onClick={() => setVerDiff(false)}>
              Fechar
            </button>
          }
        >
          <p className="mb-4 text-[13px] text-suave">Da versão vigente para a versão que vai nascer.</p>
          {diff.length === 0 ? (
            <p className="text-[13px] text-suave">Nada mudou.</p>
          ) : (
            diff.map((d) => (
              <div
                key={d.campo}
                className="grid grid-cols-[180px_1fr] items-baseline gap-3 border-b border-linha py-2 text-[13px]"
              >
                <span className="font-mono text-[12.5px] text-suave">{d.campo}</span>
                <span>
                  <span className="text-vermelho line-through">{d.antes}</span>
                  <span className="mx-1.5 text-mute">→</span>
                  <span className="text-verde">{d.depois}</span>
                </span>
              </div>
            ))
          )}
        </Dialogo>
      ) : null}
    </>
  );
}

function lerEtapas(payload: Conteudo | undefined): EtapaFunil[] {
  const brutas = (payload as { etapas?: unknown })?.etapas;
  if (!Array.isArray(brutas)) return [];
  return brutas.map((e, i) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      chave: String(o.chave ?? `etapa_${i + 1}`),
      nome: String(o.nome ?? o.chave ?? ""),
      cor: o.cor ? String(o.cor) : undefined,
      tipo: o.tipo ? String(o.tipo) : "aberta",
      ordem: i + 1,
    };
  });
}

function trocar(lista: EtapaFunil[], i: number, patch: Partial<EtapaFunil>): EtapaFunil[] {
  return lista.map((e, j) => (i === j ? { ...e, ...patch } : e));
}

function mover(lista: EtapaFunil[], de: number, para: number): EtapaFunil[] {
  if (para < 0 || para >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

interface Diferenca {
  campo: string;
  antes: string;
  depois: string;
}

/** Diff por CHAVE de etapa: comparar por posição acusaria "mudou tudo" ao reordenar uma linha. */
function diferencas(antes: EtapaFunil[], depois: EtapaFunil[]): Diferenca[] {
  const saida: Diferenca[] = [];
  const porChaveAntes = new Map(antes.map((e) => [e.chave, e]));
  const porChaveDepois = new Map(depois.map((e) => [e.chave, e]));

  depois.forEach((d, i) => {
    const a = porChaveAntes.get(d.chave);
    if (!a) {
      saida.push({ campo: `${d.chave}`, antes: "—", depois: `${d.nome} (nova)` });
      return;
    }
    if (a.nome !== d.nome) saida.push({ campo: `${d.chave}.nome`, antes: a.nome, depois: d.nome });
    if ((a.tipo ?? "aberta") !== (d.tipo ?? "aberta")) {
      saida.push({ campo: `${d.chave}.tipo`, antes: a.tipo ?? "aberta", depois: d.tipo ?? "aberta" });
    }
    if ((a.cor ?? "") !== (d.cor ?? "")) {
      saida.push({ campo: `${d.chave}.cor`, antes: a.cor ?? "—", depois: d.cor ?? "—" });
    }
    const posAntes = antes.findIndex((x) => x.chave === d.chave) + 1;
    if (posAntes !== i + 1) {
      saida.push({ campo: `${d.chave}.ordem`, antes: String(posAntes), depois: String(i + 1) });
    }
  });

  for (const a of antes) {
    if (!porChaveDepois.has(a.chave)) {
      saida.push({ campo: a.chave, antes: a.nome, depois: "removida" });
    }
  }
  return saida;
}

/**
 * Recibo do cabeçalho. `meta.em` e `ator` acompanham a PUBLICAÇÃO (ressalva 3 do Croqui): o par
 * data+autor sai da mesma versão, sempre. Recibo com a data de uma versão e o autor de outra é o
 * tipo de mentira que ninguém confere.
 */
/**
 * B2 (parecer do Vitrine ME) · o recibo é a PROVA DE ESCRITA do cabeçalho, e ele se deriva da
 * versão vigente do histórico — nunca de string escrita no handler, que o primeiro re-render
 * desmente. E não credita migration como se fosse gente: versão sem `evento_id` não teve autor
 * humano, e dizer "por migration 0033" no lugar de um nome é a tela inventando autoria.
 */
function reciboDe(v: VersaoHistorico): string {
  const quando = v.vigente_desde
    ? new Date(v.vigente_desde).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "—";
  const humano = v.publicado_por_nome ?? v.publicado_por_email ?? null;
  if (humano) return `${quando} por ${humano}`;
  return `${quando} — versão de migration/seed (${v.criado_por ?? "origem desconhecida"}), sem autor humano`;
}

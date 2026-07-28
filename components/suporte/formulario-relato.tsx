"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirChamado } from "@/app/(app)/suporte/actions";
import {
  ACCEPT_ANEXO_SUPORTE,
  AVISO_PII,
  MAX_ANEXOS,
  TIPO_PADRAO,
  dividirRelato,
  normalizarRota,
  podeEscolherTipo,
  previaTitulo,
  validarAnexoSuporte,
  type TipoChamado,
} from "./regras/suporte.ts";
import type { Papel } from "../configuracoes/regras/canais.ts";
import { AREA, BTN, Cabecalho, Faixa } from "../configuracoes/kit";

/**
 * F12 · Relatar. UM CAMPO de texto, e a primeira linha vira o título (desenho do r10).
 *
 * Pedir título e descrição separados é pedir que a pessoa componha um documento quando ela só quer
 * contar o que aconteceu — e o campo "título" volta com "erro" em metade dos casos. A prévia mostra
 * o título que vai nascer enquanto se digita, então a derivação não é surpresa.
 *
 * O que vai junto é DITO, não escondido: a rota atual e a versão do sistema aparecem num bloco que
 * a pessoa pode abrir. Contexto coletado em silêncio é contexto que ninguém autorizou.
 */
export function FormularioRelato({
  rotaAtual,
  meuPapel,
  aoSair,
}: {
  rotaAtual: string;
  meuPapel: Papel | null;
  aoSair: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoChamado>(TIPO_PADRAO);
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const { titulo } = dividirRelato(texto);
  const podeEnviar = titulo.length > 0 && !pendente;

  function escolher(lista: FileList | null) {
    if (!lista) return;
    setErroAnexo(null);
    const aceitos: File[] = [];
    for (const f of Array.from(lista).slice(0, MAX_ANEXOS - arquivos.length)) {
      const v = validarAnexoSuporte({ type: f.type, size: f.size });
      if (!v.ok) {
        setErroAnexo(v.motivo);
        continue;
      }
      aceitos.push(f);
    }
    setArquivos([...arquivos, ...aceitos].slice(0, MAX_ANEXOS));
  }

  function enviar(semAnexo = false) {
    setErro(null);
    iniciar(async () => {
      const { titulo: t, descricao } = dividirRelato(texto);
      const prontos = await Promise.all(
        (semAnexo ? [] : arquivos).map(async (f) => ({
          nome: f.name,
          tipo: f.type,
          tamanho: f.size,
          conteudo: await f.arrayBuffer(),
        })),
      );
      const r = await abrirChamado(
        { tipo, titulo: t, descricao, onde: normalizarRota(rotaAtual) },
        prontos,
        { semAnexo },
      );
      if (r.ok) {
        setEnviado(r.ticketId ?? "");
        setTexto("");
        setArquivos([]);
        router.refresh(); // o relato tem de aparecer na lista ao voltar
        return;
      }
      setErro(r.motivo ?? "não deu para enviar o relato");
    });
  }

  if (enviado !== null) {
    return (
      <>
        <Cabecalho titulo="Relato enviado" descricao="Ele já está na lista, com a tela e o print junto." />
        <div className="flex items-center gap-2.5">
          <button className={BTN.secundario} type="button" onClick={aoSair}>
            Ver a lista
          </button>
          <button className={BTN.texto} type="button" onClick={() => setEnviado(null)}>
            Relatar outra coisa
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Relatar problema"
        descricao="Um relato por vez, com print e o contexto da tela junto."
      />

      {erro ? (
        <Faixa
          tom="erro"
          acao={
            arquivos.length > 0 ? (
              <button type="button" onClick={() => enviar(true)}>
                Enviar sem a imagem
              </button>
            ) : undefined
          }
        >
          {erro}
        </Faixa>
      ) : null}

      <div className="mb-4 flex gap-2.5" role="radiogroup" aria-label="Tipo do relato">
        {(
          [
            ["bug", "Algo está errado"],
            ["ideia", "Tenho uma ideia"],
          ] as const
        ).map(([k, r]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={tipo === k}
            disabled={!podeEscolherTipo(meuPapel) && k !== TIPO_PADRAO}
            onClick={() => setTipo(k)}
            className={`flex h-10 flex-1 items-center gap-2.5 rounded-full border px-3.5 text-left text-[13.5px] disabled:cursor-not-allowed disabled:opacity-45 ${
              tipo === k
                ? "border-navy bg-[#EAECF5] font-semibold text-navy"
                : "border-linha bg-branco text-suave hover:bg-hover"
            }`}
          >
            <span
              aria-hidden="true"
              className={`relative h-3.5 w-3.5 flex-none rounded-full border ${
                tipo === k ? "border-navy" : "border-mute"
              }`}
            >
              {tipo === k ? (
                <span className="absolute inset-[3px] rounded-full bg-navy" />
              ) : null}
            </span>
            {r}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-[13px] font-medium text-tinta" htmlFor="texto-relato">
        {tipo === "bug" ? "O que aconteceu?" : "O que você faria diferente?"}
      </label>
      <textarea
        id="texto-relato"
        className={AREA}
        rows={5}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="A primeira linha vira o título do relato."
      />
      <p className="mt-1.5 font-mono text-[12.5px] text-suave">Título: {previaTitulo(texto)}</p>

      {erroAnexo ? (
        <div className="mt-3">
          <Faixa tom="erro">{erroAnexo}</Faixa>
        </div>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {arquivos.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md border border-linha bg-branco px-1 text-center text-[10px] text-suave"
          >
            <span className="truncate">{f.name}</span>
            <button
              type="button"
              aria-label={`Remover ${f.name}`}
              className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-tinta text-[11px] leading-none text-white"
              onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
        {arquivos.length < MAX_ANEXOS ? (
          <button
            type="button"
            aria-label="Escolher imagem"
            className="flex h-16 w-16 flex-none items-center justify-center rounded-md border border-linha bg-branco text-[20px] text-mute hover:bg-hover hover:text-tinta"
            onClick={() => input.current?.click()}
          >
            +
          </button>
        ) : null}
        <span className="min-w-[150px] flex-1 text-[13px] text-suave">
          escolha uma imagem — até {MAX_ANEXOS}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ANEXO_SUPORTE}
        multiple
        hidden
        onChange={(e) => escolher(e.target.files)}
      />

      <details className="mt-4 border-t border-linha pt-3">
        <summary className="cursor-pointer list-none text-[13px] text-suave hover:text-tinta">
          Vai junto: a tela onde você está
        </summary>
        <div className="mt-2 flex min-h-[34px] items-center gap-3 border-b border-linha text-[13px]">
          <span className="w-[180px] flex-none text-suave">Tela</span>
          <span className="font-mono text-[12.5px] text-tinta">{normalizarRota(rotaAtual) || "—"}</span>
        </div>
      </details>

      <p className="mt-3 text-[12.5px] text-suave">{AVISO_PII}</p>

      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button className={BTN.texto} type="button" onClick={aoSair}>
          Cancelar
        </button>
        <button className={BTN.primario} type="button" disabled={!podeEnviar} onClick={() => enviar()}>
          Enviar relato
        </button>
      </div>
    </>
  );
}

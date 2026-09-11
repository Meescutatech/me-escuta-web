"use client";

import { useEffect, useRef, useState } from "react";
import type { FichaDoLead } from "@/lib/dados/lead-painel";
import {
  inputParaValor,
  valorParaInput,
  valorParaTexto,
  type CampoFicha,
  type ValorCampo,
} from "@/lib/dados/ficha-calculos";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
 * W-D6 v3 (10/09 23:40) · A FICHA DO PACIENTE, editável NO LUGAR.
 *
 * Diogo, sobre o drawer anterior: "horrível, não serve para nada — eu deveria ver a conversa, os
 * dados". A ficha é a metade "dados": todos os campos da config `ficha_lead`, em grade de
 * propriedades (rótulo à esquerda, valor à direita), cada valor clicável.
 *
 * Contrato do editor (LiderHub `components/editable-value.tsx`, porte de FORMA): **Enter salva ·
 * Escape cancela · blur salva**; valor igual é no-op; inválido mantém o editor aberto com o
 * motivo. O vazio nunca é travessão: campo editável vira convite ("Adicionar cidade…"), campo
 * somente-leitura vira afirmação ("Sem cidade") — a largura da linha não muda entre os dois.
 *
 * SEM `<select>` NATIVO: seleção abre um popover do preset com as opções (radio); booleano é um
 * toggle Sim/Não de dois segmentos. Data usa o `input type="date"` (é calendário, não dropdown).
 * `audiometria` é um campo de seleção como qualquer outro, só que a leitura mostra ✓ quando "Sim" —
 * o card verde gigante que ocupava o topo do drawer virou esta linha.
 *
 * Quem grava é quem chama (`onSalvar`): o drawer decide entre a porta (`salvarCampoFicha`) e a
 * pintura local do ensaio. A ficha não sabe de banco.
 */

const SLUG_AUDIOMETRIA = "audiometria";

function ehSim(valor: unknown): boolean {
  return valor === true || String(valor ?? "").trim().toLowerCase() === "sim" || valor === "true";
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="min-w-0 truncate pt-[7px] text-[12px] text-mute">{children}</span>;
}

function Vazio({ campo }: { campo: CampoFicha }) {
  return campo.editavel ? (
    <span className="text-mute">Adicionar {campo.nome.toLowerCase()}…</span>
  ) : (
    <span className="text-mute">Sem {campo.nome.toLowerCase()}</span>
  );
}

/** Texto/número/url/data: input inline que herda a tipografia do valor. */
function EditorTexto({
  campo,
  valor,
  onSalvar,
  onFechar,
}: {
  campo: CampoFicha;
  valor: unknown;
  onSalvar: (v: ValorCampo) => Promise<{ ok: boolean; motivo?: string }>;
  onFechar: () => void;
}) {
  const inicial = valorParaInput(campo.tipo, valor);
  const [texto, setTexto] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current && "select" in ref.current && campo.tipo !== "data" && campo.tipo !== "data_hora") ref.current.select();
  }, [campo.tipo]);

  async function confirmar() {
    if (salvando) return;
    if (texto === inicial) return onFechar();
    const r = inputParaValor(campo.tipo, texto);
    if (!r.ok) {
      setErro(r.erro);
      ref.current?.focus();
      return;
    }
    setSalvando(true);
    const res = await onSalvar(r.valor);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.motivo ?? "não salvou");
      ref.current?.focus();
      return;
    }
    onFechar();
  }

  const comum = cn(
    "w-full rounded-[5px] border border-laranja/60 bg-branco px-2 py-[5px] text-[13px] text-tinta outline-none ring-2 ring-laranja/20",
    salvando && "opacity-60",
  );
  const tipoInput =
    campo.tipo === "data" ? "date" : campo.tipo === "data_hora" ? "datetime-local" : campo.tipo === "url" ? "url" : "text";

  return (
    <div className="min-w-0">
      {campo.tipo === "texto_longo" ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={texto}
          rows={3}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => void confirmar()}
          onKeyDown={(e) => {
            if (e.key === "Escape") onFechar();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void confirmar();
          }}
          className={comum}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type={tipoInput}
          inputMode={campo.tipo === "numero" ? "decimal" : undefined}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => void confirmar()}
          onKeyDown={(e) => {
            if (e.key === "Escape") onFechar();
            if (e.key === "Enter") void confirmar();
          }}
          className={comum}
        />
      )}
      {erro && <p className="mt-1 text-[11.5px] text-vermelho">{erro}</p>}
    </div>
  );
}

/** Seleção: popover com as opções (radio), nunca <select>. Clicar numa opção salva. */
function EditorSelecao({
  campo,
  valor,
  onSalvar,
  destaque,
}: {
  campo: CampoFicha;
  valor: unknown;
  onSalvar: (v: ValorCampo) => Promise<{ ok: boolean; motivo?: string }>;
  destaque?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atual = valor == null || valor === "" ? null : String(valor);
  async function escolher(op: string | null) {
    if (salvando) return;
    if (op === atual) return setAberto(false);
    setSalvando(true);
    const r = await onSalvar(op);
    setSalvando(false);
    if (!r.ok) return setErro(r.motivo ?? "não salvou");
    setErro(null);
    setAberto(false);
  }
  return (
    <div className="min-w-0">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger
          type="button"
          disabled={!campo.editavel}
          className={cn(
            "flex max-w-full items-center gap-1.5 rounded-[5px] px-2 py-[5px] text-left text-[13px] transition-colors",
            campo.editavel ? "hover:bg-hover" : "cursor-default",
            aberto && "bg-hover",
          )}
        >
          {atual == null ? (
            <Vazio campo={campo} />
          ) : (
            <>
              {destaque && ehSim(atual) && (
                <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 stroke-verde" fill="none" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              <span className={cn("truncate text-tinta", destaque && ehSim(atual) && "font-medium text-verde")}>{atual}</span>
            </>
          )}
          {campo.editavel && (
            <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 stroke-mute" fill="none" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1.5" role="radiogroup" aria-label={campo.nome}>
          {campo.opcoes.map((op) => {
            const marcado = op === atual;
            return (
              <button
                key={op}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => void escolher(op)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover",
                  marcado ? "font-medium text-tinta" : "text-suave",
                )}
              >
                <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", marcado ? "border-laranja" : "border-linha-forte")}>
                  {marcado && <span className="h-2 w-2 rounded-full bg-laranja" />}
                </span>
                {op}
              </button>
            );
          })}
          {atual != null && (
            <button type="button" onClick={() => void escolher(null)} className="mt-1 w-full rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-mute hover:bg-hover">
              Limpar
            </button>
          )}
        </PopoverContent>
      </Popover>
      {erro && <p className="mt-1 px-2 text-[11.5px] text-vermelho">{erro}</p>}
    </div>
  );
}

/** Booleano: toggle de dois segmentos. Clicar salva. */
function EditorBooleano({
  campo,
  valor,
  onSalvar,
}: {
  campo: CampoFicha;
  valor: unknown;
  onSalvar: (v: ValorCampo) => Promise<{ ok: boolean; motivo?: string }>;
}) {
  const [salvando, setSalvando] = useState(false);
  const atual = valorParaInput("booleano", valor); // "sim" | "nao" | ""
  async function marcar(v: "sim" | "nao") {
    if (salvando || v === atual) return;
    setSalvando(true);
    await onSalvar(v === "sim");
    setSalvando(false);
  }
  return (
    <div className={cn("inline-flex h-7 items-center gap-px rounded-[6px] bg-hover p-[2px]", salvando && "opacity-60")} role="radiogroup" aria-label={campo.nome}>
      {(["sim", "nao"] as const).map((v) => {
        const marcado = atual === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={marcado}
            disabled={!campo.editavel}
            onClick={() => void marcar(v)}
            className={cn(
              "h-full rounded-[4px] px-2.5 text-[12.5px] leading-none transition-colors",
              marcado ? "bg-branco font-medium text-tinta shadow-[0_1px_2px_rgba(31,35,40,.08)]" : "text-suave hover:text-tinta",
            )}
          >
            {v === "sim" ? "Sim" : "Não"}
          </button>
        );
      })}
    </div>
  );
}

function Linha({
  campo,
  valor,
  onSalvar,
}: {
  campo: CampoFicha;
  valor: unknown;
  onSalvar: (slug: string, v: ValorCampo) => Promise<{ ok: boolean; motivo?: string }>;
}) {
  const [editando, setEditando] = useState(false);
  const salvar = (v: ValorCampo) => onSalvar(campo.slug, v);
  const destaque = campo.slug === SLUG_AUDIOMETRIA;

  let conteudo: React.ReactNode;
  if (campo.tipo === "selecao") conteudo = <EditorSelecao campo={campo} valor={valor} onSalvar={salvar} destaque={destaque} />;
  else if (campo.tipo === "booleano") conteudo = <EditorBooleano campo={campo} valor={valor} onSalvar={salvar} />;
  else if (editando) conteudo = <EditorTexto campo={campo} valor={valor} onSalvar={salvar} onFechar={() => setEditando(false)} />;
  else {
    const texto = valorParaTexto(campo.tipo, valor);
    const vazio = texto === "—";
    conteudo = (
      <button
        type="button"
        disabled={!campo.editavel}
        onClick={() => setEditando(true)}
        title={campo.editavel ? "Clique para editar" : undefined}
        className={cn(
          "block w-full max-w-full truncate rounded-[5px] px-2 py-[5px] text-left text-[13px] transition-colors",
          campo.editavel ? "hover:bg-hover" : "cursor-default",
          vazio ? "" : "text-tinta",
        )}
      >
        {vazio ? <Vazio campo={campo} /> : campo.tipo === "url" ? <span className="text-navy underline-offset-2">{texto}</span> : texto}
      </button>
    );
  }

  return (
    <div className={cn("grid grid-cols-[112px_minmax(0,1fr)] items-start gap-x-3 py-[3px]", destaque && "rounded-[6px] bg-verde-bg/40")}>
      <Rotulo>{campo.nome}</Rotulo>
      <div className="min-w-0">{conteudo}</div>
    </div>
  );
}

export function FichaLead({
  ficha,
  onSalvar,
}: {
  ficha: FichaDoLead;
  onSalvar: (slug: string, valor: ValorCampo) => Promise<{ ok: boolean; motivo?: string }>;
}) {
  if (!ficha.grupos) {
    return <p className="px-1 py-3 text-[13px] text-mute">A ficha ainda não foi configurada (config `ficha_lead`).</p>;
  }
  if (!ficha.valores) {
    return <p className="px-1 py-3 text-[13px] text-mute">Não foi possível ler a ficha deste lead — reabra o card.</p>;
  }
  const valores = ficha.valores;
  return (
    <div className="flex flex-col gap-4">
      {ficha.grupos.map((g) => (
        <section key={g.chave}>
          {ficha.grupos!.length > 1 && (
            <h3 className="mb-1 px-1 text-[11.5px] font-semibold text-suave">{g.nome}</h3>
          )}
          <div className="flex flex-col">
            {g.campos.map((c) => (
              <Linha key={c.slug} campo={c} valor={valores[c.slug]} onSalvar={onSalvar} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

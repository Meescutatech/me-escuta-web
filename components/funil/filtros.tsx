"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardLead, EtapaFunil } from "@/lib/dados/funil";
import {
  FILTROS_VAZIOS,
  alternarValor,
  contarFiltrosAtivos,
  opcoesResponsavel,
  opcoesTags,
  type FiltrosFunil,
} from "@/lib/dados/funil-filtros";
import { cn } from "@/lib/utils";

/*
 * Painel de filtros do board (paridade Kommo — SPEC-FILTROS-FUNIL). Popover artesanal no
 * idioma R9: hairlines, headers uppercase como os das colunas, shadow-forte (o token
 * declarado pra menu aberto), laranja só no que está ativo. Assinatura: cada opção mostra
 * a contagem REAL de leads (faceta) — informação antes do clique, não decoração.
 * Período é rotulado "Entrou na etapa" — é o que o dado permite afirmar (sem criado_em na view).
 */

function isoDia(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

function presetDias(dias: number): { de: string; ate: string } {
  const hoje = new Date();
  const de = new Date(hoje);
  de.setDate(hoje.getDate() - (dias - 1));
  return { de: isoDia(de), ate: isoDia(hoje) };
}

const PRESETS: Array<{ rotulo: string; dias: number }> = [
  { rotulo: "Hoje", dias: 1 },
  { rotulo: "7 dias", dias: 7 },
  { rotulo: "30 dias", dias: 30 },
];

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-linha px-3.5 py-3 last:border-b-0">
      <div className="pb-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-suave">{titulo}</div>
      {children}
    </div>
  );
}

function LinhaOpcao({
  marcado,
  onAlternar,
  qtd,
  children,
}: {
  marcado: boolean;
  onAlternar: () => void;
  qtd: number;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 transition-colors hover:bg-hover">
      <input type="checkbox" checked={marcado} onChange={onAlternar} className="h-3.5 w-3.5 shrink-0 accent-laranja" />
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", marcado ? "text-tinta" : "text-suave")}>
        {children}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-mute">{qtd}</span>
    </label>
  );
}

export function FiltrosBoard({
  cards,
  etapas,
  filtros,
  onChange,
  qtdFiltrada,
}: {
  /** cards SEM filtro (recorte lido) — base das facetas e do "de N" */
  cards: CardLead[];
  etapas: EtapaFunil[];
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  qtdFiltrada: number;
}) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  // fecha por clique-fora e Esc (padrão de menu; sem lib — o repo não usa Radix)
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(ev: PointerEvent) {
      if (raizRef.current && !raizRef.current.contains(ev.target as Node)) setAberto(false);
    }
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const responsaveis = useMemo(() => opcoesResponsavel(cards), [cards]);
  const tags = useMemo(() => opcoesTags(cards), [cards]);
  const porEtapa = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.etapa, (m.get(c.etapa) ?? 0) + 1);
    return m;
  }, [cards]);

  const ativos = contarFiltrosAtivos(filtros);

  return (
    <div ref={raizRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="true"
        className={cn(
          "flex items-center gap-2 rounded-[6px] border bg-branco px-2.5 py-1.5 text-[13px] text-tinta transition-colors",
          aberto || ativos > 0 ? "border-linha-forte" : "border-linha hover:border-linha-forte",
        )}
      >
        <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 stroke-mute" fill="none">
          <path d="M4 5h16l-6.5 7.5V19l-3-1.5v-5L4 5z" />
        </svg>
        Filtros
        {ativos > 0 && (
          <span className="rounded-full bg-laranja px-1.5 py-px font-mono text-[10.5px] tabular-nums text-branco">
            {ativos}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 flex max-h-[72vh] w-[300px] flex-col overflow-hidden rounded-[10px] border border-linha-forte bg-branco shadow-forte">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Secao titulo="Responsável">
              {responsaveis.length === 0 ? (
                <p className="px-1.5 text-[12px] text-mute">Nenhum lead no board.</p>
              ) : (
                <div className="max-h-44 space-y-px overflow-y-auto">
                  {responsaveis.map((o) => (
                    <LinhaOpcao
                      key={o.valor}
                      marcado={filtros.responsaveis.includes(o.valor)}
                      onAlternar={() => onChange({ ...filtros, responsaveis: alternarValor(filtros.responsaveis, o.valor) })}
                      qtd={o.qtd}
                    >
                      {o.rotulo}
                    </LinhaOpcao>
                  ))}
                </div>
              )}
            </Secao>

            <Secao titulo="Etapa">
              <div className="max-h-44 space-y-px overflow-y-auto">
                {etapas.map((e) => (
                  <LinhaOpcao
                    key={e.chave}
                    marcado={filtros.etapas.includes(e.chave)}
                    onAlternar={() => onChange({ ...filtros, etapas: alternarValor(filtros.etapas, e.chave) })}
                    qtd={porEtapa.get(e.chave) ?? 0}
                  >
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: e.cor }} aria-hidden />
                    {e.nome}
                  </LinhaOpcao>
                ))}
              </div>
            </Secao>

            <Secao titulo="Tags">
              {tags.length === 0 ? (
                <p className="px-1.5 text-[12px] text-mute">Nenhuma tag nos leads do board.</p>
              ) : (
                <div className="max-h-44 space-y-px overflow-y-auto">
                  {tags.map((o) => (
                    <LinhaOpcao
                      key={o.valor}
                      marcado={filtros.tags.includes(o.valor)}
                      onAlternar={() => onChange({ ...filtros, tags: alternarValor(filtros.tags, o.valor) })}
                      qtd={o.qtd}
                    >
                      {o.rotulo}
                    </LinhaOpcao>
                  ))}
                </div>
              )}
            </Secao>

            <Secao titulo="Entrou na etapa">
              <div className="flex gap-1.5 pb-2.5">
                {PRESETS.map((p) => {
                  const { de, ate } = presetDias(p.dias);
                  const ativo = filtros.de === de && filtros.ate === ate;
                  return (
                    <button
                      key={p.rotulo}
                      type="button"
                      onClick={() => onChange({ ...filtros, de: ativo ? null : de, ate: ativo ? null : ate })}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
                        ativo
                          ? "border-laranja bg-laranja-cl font-medium text-laranja-esc"
                          : "border-linha text-suave hover:border-linha-forte",
                      )}
                    >
                      {p.rotulo}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filtros.de ?? ""}
                  onChange={(e) => onChange({ ...filtros, de: e.target.value || null })}
                  aria-label="Entrou na etapa a partir de"
                  className="w-full rounded-[6px] border border-linha bg-branco px-1.5 py-1 text-[12px] text-tinta outline-none focus:border-linha-forte"
                />
                <span className="text-[12px] text-mute">até</span>
                <input
                  type="date"
                  value={filtros.ate ?? ""}
                  onChange={(e) => onChange({ ...filtros, ate: e.target.value || null })}
                  aria-label="Entrou na etapa até"
                  className="w-full rounded-[6px] border border-linha bg-branco px-1.5 py-1 text-[12px] text-tinta outline-none focus:border-linha-forte"
                />
              </div>
            </Secao>
          </div>

          <div className="flex items-center justify-between border-t border-linha bg-board px-3.5 py-2.5">
            <button
              type="button"
              disabled={ativos === 0}
              onClick={() => onChange({ ...FILTROS_VAZIOS, busca: filtros.busca, meus: filtros.meus })}
              className={cn(
                "text-[12.5px] transition-colors",
                ativos === 0 ? "cursor-default text-mute" : "text-laranja-esc hover:underline",
              )}
            >
              Limpar filtros
            </button>
            <span className="font-mono text-[11.5px] tabular-nums text-suave">
              {qtdFiltrada.toLocaleString("pt-BR")} de {cards.length.toLocaleString("pt-BR")} leads
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

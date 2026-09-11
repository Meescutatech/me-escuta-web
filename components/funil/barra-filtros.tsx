"use client";

import { useMemo, useState } from "react";
import type { CardLead, EtapaFunil, Origem } from "@/lib/dados/funil";
import {
  SEM_RESPONSAVEL,
  alternarValor,
  chipsAtivos,
  limparChips,
  opcoesCidade,
  opcoesOrigem,
  opcoesResponsavel,
  opcoesTags,
  type FiltrosFunil,
  type OpcaoFiltro,
} from "@/lib/dados/funil-filtros";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/*
 * W-D6 v3 (10/09 23:40) · OS FILTROS SAÍRAM DO POPOVER E FORAM PARA A BARRA.
 *
 * Diogo: "aproveitaria o espaço para melhorar os filtros; tem coisa inútil". Antes, quatro dimensões
 * viviam escondidas atrás de um botão "Filtros" e a barra gastava largura com "Novo lead" (quem cria
 * lead pelo kanban?) e com a pílula "prazos no padrão declarado". Agora cada dimensão é um seletor de
 * 32px na barra, todos com a MESMA anatomia (`SeletorMulti`): rótulo, contagem dos ativos, popover
 * com checkbox + faceta (o número de leads em cada opção ANTES do clique — informação, não
 * decoração). Os ativos viram chips numa linha abaixo, cada um removível; "Limpar" apaga os chips e
 * preserva busca e departamento, que têm controle próprio.
 *
 * "Meus leads" é a primeira linha do seletor de Responsável — o gesto diário do vendedor continua a
 * um clique, sem ocupar um botão só para ele. Tarefas é um RADIO de quatro posições (todas · com
 * tarefa · minhas · sem próxima ação): são estados excludentes, e três chips separados deixariam
 * a pessoa ligar "com tarefa" e "sem próxima ação" ao mesmo tempo, que é uma pergunta sem resposta.
 */

const ROTULO_ORIGEM: Record<string, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

export function rotuloOrigem(chave: string): string {
  return ROTULO_ORIGEM[chave] ?? chave;
}

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

/** O gatilho de 32px, igual para todos os seletores da barra. */
function Gatilho({
  rotulo,
  ativos,
  resumo,
  aberto,
}: {
  rotulo: string;
  ativos: number;
  /** o que aparece no lugar do rótulo quando há UM ativo ("Sara") — em vez de "Responsável 1" */
  resumo?: string | null;
  aberto?: boolean;
}) {
  const ligado = ativos > 0;
  return (
    <span
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-[6px] border bg-branco px-2.5 text-[12.5px] transition-colors",
        ligado ? "border-laranja/60 text-tinta" : "border-linha text-suave hover:border-linha-forte",
        aberto && "border-linha-forte",
      )}
    >
      <span className={cn("max-w-[140px] truncate", ligado && "font-medium")}>{ligado && resumo ? resumo : rotulo}</span>
      {ativos > 1 && (
        <span className="rounded-full bg-laranja px-1.5 py-px font-mono text-[10px] leading-[1.4] text-branco">{ativos}</span>
      )}
      <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={cn("h-3 w-3 shrink-0 stroke-mute transition-transform", aberto && "rotate-180")} fill="none" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
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
  qtd?: number;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-hover">
      <Checkbox checked={marcado} onCheckedChange={onAlternar} />
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", marcado ? "text-tinta" : "text-suave")}>{children}</span>
      {qtd != null && <span className="font-mono text-[11px] tabular-nums text-mute">{qtd}</span>}
    </label>
  );
}

/**
 * Seletor multi genérico: rótulo + popover com as opções e a faceta. Busca interna acima de 8
 * opções (cidade cresce; responsável, com 4 pessoas, não precisa).
 */
function SeletorMulti({
  rotulo,
  opcoes,
  valores,
  onChange,
  renderizar,
  vazio,
  cabecalho,
}: {
  rotulo: string;
  opcoes: OpcaoFiltro[];
  valores: string[];
  onChange: (valores: string[]) => void;
  renderizar?: (o: OpcaoFiltro) => React.ReactNode;
  vazio: string;
  /** linhas fixas ANTES das opções (ex.: "Meus leads") */
  cabecalho?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const visiveis = q ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(q)) : opcoes;
  const resumo = valores.length === 1 ? (opcoes.find((o) => o.valor === valores[0])?.rotulo ?? valores[0]) : null;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label={rotulo} className="rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo={rotulo} ativos={valores.length} resumo={resumo} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {opcoes.length > 8 && (
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar ${rotulo.toLowerCase()}`}
            className="mb-1 h-8 w-full rounded-[6px] border border-linha bg-branco px-2.5 text-[13px] text-tinta outline-none placeholder:text-mute focus:border-linha-forte"
          />
        )}
        {cabecalho}
        <div className="max-h-64 overflow-y-auto">
          {visiveis.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-mute">{q ? "Nada com esse nome." : vazio}</p>
          ) : (
            visiveis.map((o) => (
              <LinhaOpcao key={o.valor} marcado={valores.includes(o.valor)} onAlternar={() => onChange(alternarValor(valores, o.valor))} qtd={o.qtd}>
                {renderizar ? renderizar(o) : o.rotulo}
              </LinhaOpcao>
            ))
          )}
        </div>
        {valores.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-laranja-esc hover:bg-hover">
            Limpar {rotulo.toLowerCase()}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

type PosicaoTarefa = "todas" | "com" | "minhas" | "sem";

function posicaoTarefa(f: FiltrosFunil): PosicaoTarefa {
  if (f.minhasTarefas) return "minhas";
  if (f.comTarefa) return "com";
  if (f.semProximaAcao) return "sem";
  return "todas";
}

function aplicarPosicaoTarefa(f: FiltrosFunil, p: PosicaoTarefa): FiltrosFunil {
  return { ...f, comTarefa: p === "com", minhasTarefas: p === "minhas", semProximaAcao: p === "sem" };
}

function SeletorTarefas({
  filtros,
  onChange,
  contagens,
  temUsuario,
}: {
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  contagens: { com: number; minhas: number; sem: number | null };
  temUsuario: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = posicaoTarefa(filtros);
  const opcoes: Array<{ chave: PosicaoTarefa; rotulo: string; qtd?: number | null; some?: boolean }> = [
    { chave: "todas", rotulo: "Todas" },
    { chave: "com", rotulo: "Com tarefa pendente", qtd: contagens.com },
    { chave: "minhas", rotulo: "Minhas tarefas", qtd: contagens.minhas, some: !temUsuario },
    { chave: "sem", rotulo: "Sem próxima ação", qtd: contagens.sem },
  ];
  const resumo = opcoes.find((o) => o.chave === atual)?.rotulo ?? null;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Tarefas" className="rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Tarefas" ativos={atual === "todas" ? 0 : 1} resumo={resumo} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5" role="radiogroup" aria-label="Tarefas">
        {opcoes
          .filter((o) => !o.some)
          .map((o) => {
            const marcado = o.chave === atual;
            return (
              <button
                key={o.chave}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => {
                  onChange(aplicarPosicaoTarefa(filtros, o.chave));
                  setAberto(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-hover",
                  marcado ? "font-medium text-tinta" : "text-suave",
                )}
              >
                <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", marcado ? "border-laranja" : "border-linha-forte")}>
                  {marcado && <span className="h-2 w-2 rounded-full bg-laranja" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
                {o.qtd !== undefined && <span className="font-mono text-[11px] tabular-nums text-mute">{o.qtd == null ? "—" : o.qtd}</span>}
              </button>
            );
          })}
      </PopoverContent>
    </Popover>
  );
}

function SeletorPeriodo({ filtros, onChange }: { filtros: FiltrosFunil; onChange: (f: FiltrosFunil) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativo = !!(filtros.de || filtros.ate);
  const preset = PRESETS.find((p) => {
    const { de, ate } = presetDias(p.dias);
    return filtros.de === de && filtros.ate === ate;
  });
  const resumo = preset ? `Entrou: ${preset.rotulo.toLowerCase()}` : ativo ? "Entrou: período" : null;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Entrou na etapa" className="rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Entrou na etapa" ativos={ativo ? 1 : 0} resumo={resumo} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => {
            const { de, ate } = presetDias(p.dias);
            const marcado = filtros.de === de && filtros.ate === ate;
            return (
              <button
                key={p.rotulo}
                type="button"
                onClick={() => {
                  onChange({ ...filtros, de: marcado ? null : de, ate: marcado ? null : ate });
                  setAberto(false);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
                  marcado ? "border-laranja bg-laranja-cl font-medium text-laranja-esc" : "border-linha text-suave hover:border-linha-forte",
                )}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            type="date"
            value={filtros.de ?? ""}
            onChange={(e) => onChange({ ...filtros, de: e.target.value || null })}
            aria-label="Entrou na etapa a partir de"
            className="h-8 w-full rounded-[6px] border border-linha bg-branco px-1.5 text-[12px] text-tinta outline-none focus:border-linha-forte"
          />
          <span className="text-[12px] text-mute">até</span>
          <input
            type="date"
            value={filtros.ate ?? ""}
            onChange={(e) => onChange({ ...filtros, ate: e.target.value || null })}
            aria-label="Entrou na etapa até"
            className="h-8 w-full rounded-[6px] border border-linha bg-branco px-1.5 text-[12px] text-tinta outline-none focus:border-linha-forte"
          />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-mute">Data de entrada na etapa atual — é o que o dado permite afirmar.</p>
      </PopoverContent>
    </Popover>
  );
}

/** Secundários: o que não merece um botão próprio na barra. Hoje, só "Só os estourados". */
function SeletorSecundarios({ filtros, onChange }: { filtros: FiltrosFunil; onChange: (f: FiltrosFunil) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativos = (filtros.soAgora ? 1 : 0);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Mais filtros" className="rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Mais" ativos={ativos} resumo={filtros.soAgora ? "Só os estourados" : null} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <LinhaOpcao marcado={filtros.soAgora} onAlternar={() => onChange({ ...filtros, soAgora: !filtros.soAgora })}>
          Só os estourados (AGORA)
        </LinhaOpcao>
        <p className="px-2 pb-1 pt-1.5 text-[11px] leading-snug text-mute">Leads que passaram do prazo da etapa — a faixa vermelha.</p>
      </PopoverContent>
    </Popover>
  );
}

export function BarraFiltros({
  cards,
  etapas,
  filtros,
  onChange,
  meuId,
  contagens,
}: {
  /** cards SEM filtro (recorte lido) — base das facetas */
  cards: CardLead[];
  etapas: EtapaFunil[];
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  meuId: string | null;
  contagens: { com: number; minhas: number; sem: number | null };
}) {
  const responsaveis = useMemo(() => opcoesResponsavel(cards), [cards]);
  const tags = useMemo(() => opcoesTags(cards), [cards]);
  const origens = useMemo(() => opcoesOrigem(cards), [cards]);
  const cidades = useMemo(() => opcoesCidade(cards), [cards]);
  const porEtapa = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.etapa, (m.get(c.etapa) ?? 0) + 1);
    return m;
  }, [cards]);
  const opcoesEtapa: OpcaoFiltro[] = etapas.map((e) => ({ valor: e.chave, rotulo: e.nome, qtd: porEtapa.get(e.chave) ?? 0 }));
  const corEtapa = new Map(etapas.map((e) => [e.chave, e.cor]));
  const meusQtd = meuId ? cards.filter((c) => c.dono_id === meuId).length : 0;

  return (
    <>
      <SeletorMulti
        rotulo="Responsável"
        opcoes={responsaveis}
        valores={filtros.responsaveis}
        onChange={(v) => onChange({ ...filtros, responsaveis: v })}
        vazio="Nenhum lead no board."
        cabecalho={
          meuId ? (
            <div className="mb-1 border-b border-linha pb-1">
              <LinhaOpcao marcado={filtros.meus} onAlternar={() => onChange({ ...filtros, meus: !filtros.meus })} qtd={meusQtd}>
                Meus leads
              </LinhaOpcao>
            </div>
          ) : null
        }
      />
      <SeletorMulti
        rotulo="Etapa"
        opcoes={opcoesEtapa}
        valores={filtros.etapas}
        onChange={(v) => onChange({ ...filtros, etapas: v })}
        vazio="Sem etapas."
        renderizar={(o) => (
          <>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: corEtapa.get(o.valor) }} aria-hidden />
            {o.rotulo}
          </>
        )}
      />
      <SeletorMulti rotulo="Tags" opcoes={tags} valores={filtros.tags} onChange={(v) => onChange({ ...filtros, tags: v })} vazio="Nenhuma tag nos leads do board." />
      <SeletorTarefas filtros={filtros} onChange={onChange} contagens={contagens} temUsuario={!!meuId} />
      <SeletorPeriodo filtros={filtros} onChange={onChange} />
      <SeletorMulti
        rotulo="Origem"
        opcoes={origens.map((o) => ({ ...o, rotulo: rotuloOrigem(o.valor) }))}
        valores={filtros.origens}
        onChange={(v) => onChange({ ...filtros, origens: v })}
        vazio="Nenhum lead com origem registrada."
      />
      <SeletorMulti rotulo="Cidade" opcoes={cidades} valores={filtros.cidades} onChange={(v) => onChange({ ...filtros, cidades: v })} vazio="Nenhum lead declarou a cidade." />
      <SeletorSecundarios filtros={filtros} onChange={onChange} />
    </>
  );
}

/** A linha de chips dos filtros ativos, com "Limpar". Não renderiza nada quando não há chip. */
export function ChipsFiltros({
  filtros,
  etapas,
  onChange,
  qtdFiltrada,
  qtdTotal,
}: {
  filtros: FiltrosFunil;
  etapas: EtapaFunil[];
  onChange: (f: FiltrosFunil) => void;
  qtdFiltrada: number;
  qtdTotal: number;
}) {
  const chips = chipsAtivos(filtros, {
    etapa: (chave) => etapas.find((e) => e.chave === chave)?.nome ?? chave,
    origem: rotuloOrigem,
  });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.chave}
          type="button"
          onClick={() => onChange(c.remover(filtros))}
          title="Remover este filtro"
          className="group flex h-6 items-center gap-1 rounded-full border border-laranja/40 bg-laranja-cl pl-2.5 pr-1.5 text-[12px] text-laranja-esc transition-colors hover:border-laranja"
        >
          {c.rotulo}
          <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3 stroke-current opacity-70 group-hover:opacity-100" fill="none" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ))}
      <button type="button" onClick={() => onChange(limparChips(filtros))} className="ml-1 text-[12px] text-suave underline-offset-2 hover:text-tinta hover:underline">
        Limpar
      </button>
      <span className="ml-auto font-mono text-[11.5px] tabular-nums text-suave">
        {qtdFiltrada.toLocaleString("pt-BR")} de {qtdTotal.toLocaleString("pt-BR")} leads
      </span>
    </div>
  );
}

export { SEM_RESPONSAVEL };
export type { Origem };

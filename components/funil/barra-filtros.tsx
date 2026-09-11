"use client";

import { useMemo, useState } from "react";
import { ptBR } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import type { CardLead, EtapaFunil } from "@/lib/dados/funil";
import {
  SEM_RESPONSAVEL,
  alternarValor,
  chaveCidade,
  chipsAtivos,
  diasParado,
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
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

/*
 * W-D6 v4 (11/09 00:05) · A BARRA DO FUNIL, refeita.
 *
 * O que a v3 errou, no olho do Diogo: oito seletores iguais enfileirados (parecia formulário) e uma
 * faixa acima gastando a linha inteira com carimbos que ninguém aciona ("31 leads ativos",
 * "9 sem responsável", "ao vivo · atualizado há 5s"). A faixa MORREU; o que ela tinha de útil
 * ("sem responsável") virou FILTRO dentro de Situação — carimbo vira ação.
 *
 * Agora são CINCO grupos, com formas diferentes porque respondem a perguntas diferentes:
 *   · QUANDO      — calendário de verdade (presets + dois meses), padrão do W-D4 em
 *                   `components/dashboard/periodo.tsx`, aplicado a "entrou na etapa" + "sem falar há"
 *   · RESPONSÁVEL — pessoas com FOTO (`lib/ensaio/fotos.ts`), "Meus leads" no topo
 *   · SITUAÇÃO    — checkboxes com contagem à direita (com tarefa · minhas · sem próxima ação ·
 *                   vencida · sem responsável · além do prazo)
 *   · ONDE        — etapa, cidade e origem num popover só, em três blocos
 *   · MAIS        — audiometria, valor mínimo e tags
 *
 * Cada gatilho mostra O VALOR ESCOLHIDO ("Responsável: Sara +1"), não o rótulo genérico: filtro
 * ligado tem de ser legível sem abrir.
 */

const ROTULO_ORIGEM: Record<string, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

export function rotuloOrigem(chave: string): string {
  return ROTULO_ORIGEM[chave] ?? chave;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deYmd(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
}
function ddmm(s: string): string {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/** O gatilho, igual para os cinco grupos: rótulo ou VALOR, e o chevron. */
function Gatilho({ rotulo, valor, ativos, aberto }: { rotulo: string; valor?: string | null; ativos: number; aberto?: boolean }) {
  const ligado = ativos > 0;
  return (
    <span
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] transition-colors",
        ligado ? "border-laranja/60 bg-laranja-cl/40 text-tinta" : "border-linha bg-branco text-suave hover:border-linha-forte",
        aberto && "border-linha-forte",
      )}
    >
      {ligado && valor ? (
        <>
          <span className="text-mute">{rotulo}:</span>
          <span className="max-w-[150px] truncate font-medium">{valor}</span>
        </>
      ) : (
        <span>{rotulo}</span>
      )}
      <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={cn("h-3 w-3 shrink-0 stroke-mute transition-transform", aberto && "rotate-180")} fill="none" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

function LinhaCheck({
  marcado,
  onAlternar,
  qtd,
  children,
  nota,
}: {
  marcado: boolean;
  onAlternar: () => void;
  qtd?: number | null;
  children: React.ReactNode;
  nota?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-hover">
      <Checkbox checked={marcado} onCheckedChange={onAlternar} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px]", marcado ? "text-tinta" : "text-suave")}>{children}</span>
        {nota && <span className="block truncate text-[11px] text-mute">{nota}</span>}
      </span>
      {qtd !== undefined && <span className="shrink-0 font-mono text-[11px] tabular-nums text-mute">{qtd == null ? "—" : qtd}</span>}
    </label>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-linha px-1.5 py-1.5 last:border-b-0">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-mute">{titulo}</div>
      {children}
    </div>
  );
}

// ─────────────────────────── QUANDO ───────────────────────────

/**
 * Calendário de verdade (padrão do W-D4 em `components/dashboard/periodo.tsx`): presets à esquerda,
 * dois meses à direita, seleção de intervalo. Aplicado a "entrou na etapa", que é a data que a
 * `v_lead_card` permite afirmar — o rótulo diz isso em vez de prometer "criado em".
 *
 * "Sem falar há N dias" mora no MESMO popover: é pergunta de tempo, e a Sara faz as duas no mesmo
 * fôlego ("entrou essa semana e sumiu faz três dias").
 */
function SeletorQuando({ filtros, onChange }: { filtros: FiltrosFunil; onChange: (f: FiltrosFunil) => void }) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date();
  const [faixa, setFaixa] = useState<DateRange | undefined>(
    filtros.de ? { from: deYmd(filtros.de), to: filtros.ate ? deYmd(filtros.ate) : undefined } : undefined,
  );

  const dow = (hoje.getDay() + 6) % 7;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - dow);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const diasAtras = (n: number) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - (n - 1));
    return ymd(d);
  };

  const presets: Array<{ rotulo: string; de: string; ate: string }> = [
    { rotulo: "Hoje", de: ymd(hoje), ate: ymd(hoje) },
    { rotulo: "Ontem e hoje", de: diasAtras(2), ate: ymd(hoje) },
    { rotulo: "Esta semana", de: ymd(segunda), ate: ymd(hoje) },
    { rotulo: "Últimos 7 dias", de: diasAtras(7), ate: ymd(hoje) },
    { rotulo: "Últimos 30 dias", de: diasAtras(30), ate: ymd(hoje) },
    { rotulo: "Este mês", de: ymd(inicioMes), ate: ymd(hoje) },
    { rotulo: "Últimos 90 dias", de: diasAtras(90), ate: ymd(hoje) },
  ];

  const aplicar = (de: string | null, ate: string | null) => {
    onChange({ ...filtros, de, ate });
    setAberto(false);
  };

  const PARADOS = [2, 3, 5, 7, 15];

  const valor = filtros.de
    ? `${ddmm(filtros.de)}${filtros.ate ? `–${ddmm(filtros.ate)}` : ""}`
    : filtros.paradoDiasMin != null
      ? `sem falar ${filtros.paradoDiasMin}+ d`
      : null;
  const ativos = (filtros.de || filtros.ate ? 1 : 0) + (filtros.paradoDiasMin != null ? 1 : 0);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Quando" className="rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Quando" valor={valor} ativos={ativos} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <div className="flex w-48 flex-col gap-px border-r border-linha p-1.5">
            <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-mute">Entrou na etapa</div>
            {presets.map((p) => {
              const ativo = filtros.de === p.de && filtros.ate === p.ate;
              return (
                <button
                  key={p.rotulo}
                  type="button"
                  onClick={() => aplicar(ativo ? null : p.de, ativo ? null : p.ate)}
                  className={cn("w-full rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-suave hover:bg-hover hover:text-tinta", ativo && "bg-hover font-medium text-tinta")}
                >
                  {p.rotulo}
                </button>
              );
            })}
            <div className="mt-1.5 border-t border-linha px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-mute">Sem falar há</div>
            <div className="flex flex-wrap gap-1 px-1 pb-1">
              {PARADOS.map((d) => {
                const ativo = filtros.paradoDiasMin === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onChange({ ...filtros, paradoDiasMin: ativo ? null : d })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11.5px] tabular-nums transition-colors",
                      ativo ? "border-laranja bg-laranja-cl font-medium text-laranja-esc" : "border-linha text-suave hover:border-linha-forte",
                    )}
                  >
                    {d}+ d
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              locale={ptBR}
              selected={faixa}
              onSelect={setFaixa}
              defaultMonth={new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)}
              disabled={{ after: hoje }}
              className="p-2"
            />
            <div className="flex items-center justify-between gap-3 border-t border-linha px-3 py-2">
              <span className="text-[11.5px] tabular-nums text-mute">
                {faixa?.from && faixa.to ? `${ddmm(ymd(faixa.from))} – ${ddmm(ymd(faixa.to))}` : "escolha o início e o fim"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFaixa(undefined);
                    aplicar(null, null);
                  }}
                  className="h-7 rounded-[6px] px-2 text-[12px] text-suave hover:bg-hover"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={!faixa?.from || !faixa?.to}
                  onClick={() => faixa?.from && faixa.to && aplicar(ymd(faixa.from), ymd(faixa.to))}
                  className="h-7 rounded-[6px] bg-tinta px-2.5 text-[12px] font-medium text-branco disabled:opacity-40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────── RESPONSÁVEL ───────────────────────────

function Foto({ nome, url }: { nome: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar remoto do ensaio, sem otimização
    return <img src={url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />;
  }
  const ini = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
  return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy text-[9px] font-semibold text-branco">{ini}</span>;
}

function SeletorPessoas({
  filtros,
  onChange,
  responsaveis,
  meuId,
  meusQtd,
  fotos,
  idPorNome,
}: {
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  responsaveis: OpcaoFiltro[];
  meuId: string | null;
  meusQtd: number;
  fotos: Record<string, string>;
  idPorNome: (nome: string) => string | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const ativos = filtros.responsaveis.length + (filtros.meus ? 1 : 0);
  const valor = filtros.meus
    ? "meus" + (filtros.responsaveis.length ? ` +${filtros.responsaveis.length}` : "")
    : filtros.responsaveis.length === 1
      ? filtros.responsaveis[0] === SEM_RESPONSAVEL
        ? "sem responsável"
        : filtros.responsaveis[0]
      : filtros.responsaveis.length > 1
        ? `${filtros.responsaveis[0]} +${filtros.responsaveis.length - 1}`
        : null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Responsável" className="rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Responsável" valor={valor} ativos={ativos} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {meuId && (
          <Bloco titulo="Rápido">
            <LinhaCheck marcado={filtros.meus} onAlternar={() => onChange({ ...filtros, meus: !filtros.meus })} qtd={meusQtd}>
              Meus leads
            </LinhaCheck>
          </Bloco>
        )}
        <Bloco titulo="Quem cuida">
          {responsaveis.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-mute">Nenhum lead no board.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {responsaveis.map((o) => (
                <label key={o.valor} className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-hover">
                  <Checkbox
                    checked={filtros.responsaveis.includes(o.valor)}
                    onCheckedChange={() => onChange({ ...filtros, responsaveis: alternarValor(filtros.responsaveis, o.valor) })}
                  />
                  {o.valor === SEM_RESPONSAVEL ? (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-linha-forte text-[10px] text-mute">?</span>
                  ) : (
                    <Foto nome={o.rotulo} url={fotos[idPorNome(o.rotulo) ?? ""] ?? fotos[o.rotulo.split(" ")[0]]} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-suave">{o.valor === SEM_RESPONSAVEL ? "Sem responsável" : o.rotulo}</span>
                  <span className="font-mono text-[11px] tabular-nums text-mute">{o.qtd}</span>
                </label>
              ))}
            </div>
          )}
        </Bloco>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────── SITUAÇÃO ───────────────────────────

export interface ContagensSituacao {
  com: number;
  minhas: number;
  sem: number | null;
  vencida: number;
  semResponsavel: number;
  alemDoPrazo: number;
}

function SeletorSituacao({
  filtros,
  onChange,
  contagens,
  temUsuario,
}: {
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  contagens: ContagensSituacao;
  temUsuario: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const marcados: string[] = [];
  if (filtros.comTarefa) marcados.push("com tarefa");
  if (filtros.minhasTarefas) marcados.push("minhas tarefas");
  if (filtros.semProximaAcao) marcados.push("sem próxima ação");
  if (filtros.tarefaVencida) marcados.push("vencida");
  if (filtros.semResponsavel) marcados.push("sem responsável");
  if (filtros.soAgora) marcados.push("além do prazo");
  const valor = marcados.length === 1 ? marcados[0] : marcados.length > 1 ? `${marcados[0]} +${marcados.length - 1}` : null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Situação" className="rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Situação" valor={valor} ativos={marcados.length} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Bloco titulo="Tarefa">
          {/* "com tarefa" e "sem próxima ação" se excluem: marcar um desmarca o outro. São a mesma
              pergunta com resposta oposta, e deixar os dois ligados devolveria zero com dois chips
              acesos — o jeito mais confuso de a tela estar tecnicamente certa. */}
          <LinhaCheck
            marcado={filtros.comTarefa}
            onAlternar={() => onChange({ ...filtros, comTarefa: !filtros.comTarefa, semProximaAcao: false })}
            qtd={contagens.com}
          >
            Com tarefa pendente
          </LinhaCheck>
          {temUsuario && (
            <LinhaCheck marcado={filtros.minhasTarefas} onAlternar={() => onChange({ ...filtros, minhasTarefas: !filtros.minhasTarefas })} qtd={contagens.minhas}>
              A próxima tarefa é minha
            </LinhaCheck>
          )}
          <LinhaCheck
            marcado={filtros.semProximaAcao}
            onAlternar={() => onChange({ ...filtros, semProximaAcao: !filtros.semProximaAcao, comTarefa: false })}
            qtd={contagens.sem}
            nota="ninguém marcou o próximo passo"
          >
            Sem próxima ação
          </LinhaCheck>
          <LinhaCheck
            marcado={filtros.tarefaVencida}
            onAlternar={() => onChange({ ...filtros, tarefaVencida: !filtros.tarefaVencida })}
            qtd={contagens.vencida}
            nota="a tarefa existe e passou do prazo"
          >
            Tarefa vencida
          </LinhaCheck>
        </Bloco>
        <Bloco titulo="Atenção">
          <LinhaCheck marcado={filtros.semResponsavel} onAlternar={() => onChange({ ...filtros, semResponsavel: !filtros.semResponsavel })} qtd={contagens.semResponsavel}>
            Sem responsável
          </LinhaCheck>
          <LinhaCheck
            marcado={filtros.soAgora}
            onAlternar={() => onChange({ ...filtros, soAgora: !filtros.soAgora })}
            qtd={contagens.alemDoPrazo}
            nota="passou do prazo da etapa (faixa AGORA)"
          >
            Além do prazo
          </LinhaCheck>
        </Bloco>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────── ONDE ───────────────────────────

function SeletorOnde({
  filtros,
  onChange,
  etapas,
  porEtapa,
  cidades,
  origens,
}: {
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  etapas: EtapaFunil[];
  porEtapa: Map<string, number>;
  cidades: OpcaoFiltro[];
  origens: OpcaoFiltro[];
}) {
  const [aberto, setAberto] = useState(false);
  const [buscaCidade, setBuscaCidade] = useState("");
  const ativos = filtros.etapas.length + filtros.cidades.length + filtros.origens.length;
  const primeiro =
    filtros.etapas.length > 0
      ? (etapas.find((e) => e.chave === filtros.etapas[0])?.nome ?? filtros.etapas[0])
      : (filtros.cidades[0] ?? (filtros.origens[0] ? rotuloOrigem(filtros.origens[0]) : null));
  const valor = primeiro ? (ativos > 1 ? `${primeiro} +${ativos - 1}` : primeiro) : null;
  const q = chaveCidade(buscaCidade);
  const cidadesVisiveis = q ? cidades.filter((c) => chaveCidade(c.rotulo).includes(q)) : cidades;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Onde" className="rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Onde" valor={valor} ativos={ativos} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-0">
        <Bloco titulo="Etapa">
          <div className="max-h-44 overflow-y-auto">
            {etapas.map((e) => (
              <LinhaCheck
                key={e.chave}
                marcado={filtros.etapas.includes(e.chave)}
                onAlternar={() => onChange({ ...filtros, etapas: alternarValor(filtros.etapas, e.chave) })}
                qtd={porEtapa.get(e.chave) ?? 0}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: e.cor }} aria-hidden />
                {e.nome}
              </LinhaCheck>
            ))}
          </div>
        </Bloco>
        <Bloco titulo="Cidade">
          {cidades.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-mute">Nenhum lead declarou a cidade.</p>
          ) : (
            <>
              {cidades.length > 6 && (
                <input
                  value={buscaCidade}
                  onChange={(e) => setBuscaCidade(e.target.value)}
                  placeholder="Buscar cidade"
                  className="mx-1 mb-1 h-8 w-[calc(100%-8px)] rounded-[6px] border border-linha bg-branco px-2.5 text-[12.5px] text-tinta outline-none placeholder:text-mute focus:border-linha-forte"
                />
              )}
              <div className="max-h-40 overflow-y-auto">
                {cidadesVisiveis.map((c) => (
                  <LinhaCheck
                    key={c.valor}
                    marcado={filtros.cidades.includes(c.valor)}
                    onAlternar={() => onChange({ ...filtros, cidades: alternarValor(filtros.cidades, c.valor) })}
                    qtd={c.qtd}
                  >
                    {c.rotulo}
                  </LinhaCheck>
                ))}
              </div>
            </>
          )}
        </Bloco>
        <Bloco titulo="Origem">
          {origens.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-mute">Nenhum lead com origem registrada.</p>
          ) : (
            origens.map((o) => (
              <LinhaCheck
                key={o.valor}
                marcado={filtros.origens.includes(o.valor)}
                onAlternar={() => onChange({ ...filtros, origens: alternarValor(filtros.origens, o.valor) })}
                qtd={o.qtd}
              >
                {rotuloOrigem(o.valor)}
              </LinhaCheck>
            ))
          )}
        </Bloco>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────── MAIS ───────────────────────────

const VALORES = [5000, 10000, 15000, 20000];

function SeletorMais({ filtros, onChange, tags }: { filtros: FiltrosFunil; onChange: (f: FiltrosFunil) => void; tags: OpcaoFiltro[] }) {
  const [aberto, setAberto] = useState(false);
  const ativos = filtros.tags.length + (filtros.valorMin != null ? 1 : 0) + (filtros.audiometria != null ? 1 : 0);
  const valorUnico =
    ativos === 1
      ? (filtros.tags[0] ??
        (filtros.valorMin != null ? `R$ ${filtros.valorMin / 1000} mil+` : filtros.audiometria === "fez" ? "fez audiometria" : "sem audiometria"))
      : null;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger type="button" aria-label="Mais filtros" className="rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50">
        <Gatilho rotulo="Mais" valor={valorUnico} ativos={ativos} aberto={aberto} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Bloco titulo="Audiometria">
          <div className="flex gap-1.5 px-1 pb-1">
            {[
              { v: "fez" as const, r: "Fez" },
              { v: "nao_fez" as const, r: "Não fez" },
            ].map((o) => {
              const ativo = filtros.audiometria === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => onChange({ ...filtros, audiometria: ativo ? null : o.v })}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
                    ativo ? "border-laranja bg-laranja-cl font-medium text-laranja-esc" : "border-linha text-suave hover:border-linha-forte",
                  )}
                >
                  {o.r}
                </button>
              );
            })}
          </div>
        </Bloco>
        <Bloco titulo="Valor acima de">
          <div className="flex flex-wrap gap-1.5 px-1 pb-1">
            {VALORES.map((v) => {
              const ativo = filtros.valorMin === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ ...filtros, valorMin: ativo ? null : v })}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[12px] tabular-nums transition-colors",
                    ativo ? "border-laranja bg-laranja-cl font-medium text-laranja-esc" : "border-linha text-suave hover:border-linha-forte",
                  )}
                >
                  R$ {v / 1000} mil
                </button>
              );
            })}
          </div>
        </Bloco>
        <Bloco titulo="Tags">
          {tags.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-mute">Nenhuma tag nos leads do board.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto">
              {tags.map((t) => (
                <LinhaCheck key={t.valor} marcado={filtros.tags.includes(t.valor)} onAlternar={() => onChange({ ...filtros, tags: alternarValor(filtros.tags, t.valor) })} qtd={t.qtd}>
                  {t.rotulo}
                </LinhaCheck>
              ))}
            </div>
          )}
        </Bloco>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────── a barra ───────────────────────────

export function BarraFiltros({
  cards,
  etapas,
  filtros,
  onChange,
  meuId,
  contagens,
  fotos,
  idPorNome,
}: {
  /** cards SEM filtro (recorte lido) — base das facetas */
  cards: CardLead[];
  etapas: EtapaFunil[];
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  meuId: string | null;
  contagens: ContagensSituacao;
  /** id/nome → url da foto (`lib/ensaio/fotos.ts`; vazio fora do ensaio → iniciais) */
  fotos: Record<string, string>;
  /** nome exibido → id de usuário, para achar a foto */
  idPorNome: (nome: string) => string | undefined;
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
  const meusQtd = meuId ? cards.filter((c) => c.dono_id === meuId).length : 0;

  return (
    <>
      <SeletorQuando filtros={filtros} onChange={onChange} />
      <SeletorPessoas filtros={filtros} onChange={onChange} responsaveis={responsaveis} meuId={meuId} meusQtd={meusQtd} fotos={fotos} idPorNome={idPorNome} />
      <SeletorSituacao filtros={filtros} onChange={onChange} contagens={contagens} temUsuario={!!meuId} />
      <SeletorOnde filtros={filtros} onChange={onChange} etapas={etapas} porEtapa={porEtapa} cidades={cidades} origens={origens} />
      <SeletorMais filtros={filtros} onChange={onChange} tags={tags} />
    </>
  );
}

/** Os chips dos filtros ativos + "Limpar tudo". Não renderiza nada quando não há chip. */
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
    <>
      {chips.map((c) => (
        <button
          key={c.chave}
          type="button"
          onClick={() => onChange(c.remover(filtros))}
          title="Remover este filtro"
          className="group flex h-6 shrink-0 items-center gap-1 rounded-full border border-laranja/40 bg-laranja-cl pl-2.5 pr-1.5 text-[12px] text-laranja-esc transition-colors hover:border-laranja"
        >
          {c.rotulo}
          <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3 stroke-current opacity-70 group-hover:opacity-100" fill="none" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ))}
      <button type="button" onClick={() => onChange(limparChips(filtros))} className="shrink-0 text-[12px] text-suave underline-offset-2 hover:text-tinta hover:underline">
        Limpar tudo
      </button>
      <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-mute">
        {qtdFiltrada.toLocaleString("pt-BR")} de {qtdTotal.toLocaleString("pt-BR")}
      </span>
    </>
  );
}

/** Facetas de Situação — sobre os leads ATIVOS, calculadas uma vez por passada. */
export function contarSituacao(
  ativos: CardLead[],
  meuId: string | null,
  faixaDe: (c: CardLead) => string,
  agora: number,
): ContagensSituacao {
  let com = 0;
  let minhas = 0;
  let sem = 0;
  let desconhecido = false;
  let vencida = 0;
  let semResponsavel = 0;
  let alemDoPrazo = 0;
  for (const c of ativos) {
    if (c.tem_tarefa_pendente === true) com++;
    else if (c.tem_tarefa_pendente === false) sem++;
    else desconhecido = true;
    if (meuId && c.proxima_tarefa?.responsavel_id === meuId) minhas++;
    const prazo = c.proxima_tarefa?.prazo;
    if (prazo && Date.parse(prazo) < agora) vencida++;
    if (c.dono_id == null) semResponsavel++;
    if (faixaDe(c) === "agora") alemDoPrazo++;
  }
  return { com, minhas, sem: desconhecido ? null : sem, vencida, semResponsavel, alemDoPrazo };
}

export { SEM_RESPONSAVEL, diasParado };

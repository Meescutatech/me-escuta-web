"use client";

import { useMemo, useRef, useState } from "react";
import { ptBR } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MarcaJarvis } from "@/components/jarvis/marca";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import {
  FILTROS_PADRAO,
  type FiltrosTarefas as Filtros,
  type OrigemFiltro,
  type PrazoFiltro,
  type StatusFiltro,
  type TarefaVisao,
} from "@/lib/dados/tarefas-visao-calculos";
import { fraseDoEntendi, interpretarBusca, type LeituraDaBusca } from "@/lib/tarefas/busca-jarvis";
import { cn } from "@/lib/utils";
import type { PessoaAtiva } from "./acoes-tarefa";

/*
 * A BARRA DE FILTROS — v3 (11/09, 00:15: "está melhorando, mas eu melhoraria MUITO os filtros").
 *
 * Uma linha de controles, no espírito da toolbar do funil (W-D6 v3):
 *
 *   [◠ Buscar ou perguntar ao Jarvis…  ⌘K] · Quando ▾ · Quem ▾ · Situação ▾ · Tipo ▾ · Lead ▾ · Mais ▾
 *
 * Três decisões, e cada uma tem um motivo:
 *
 * 1. **O campo de busca é o campo de PERGUNTA.** "o que está vencido da Sara?" vira filtros
 *    aplicados — chips removíveis — mais a linha "entendi assim … — 7 tarefas". A resposta nunca é
 *    uma lista mágica: é o estado do filtro, visível e reversível. `lib/tarefas/busca-jarvis.ts`
 *    faz a leitura, e o que ele não entende ele DIZ, em vez de engolir metade da frase.
 * 2. **Cada gatilho mostra o VALOR escolhido**, não o nome da dimensão: "Quem: Sara", não
 *    "Responsável ▾". Barra que só diz a dimensão obriga a abrir cada popover para saber o que
 *    está ligado — e o estado do recorte passa a morar na cabeça de quem filtrou.
 * 3. **Contagem à direita da opção**, em Situação e Quem: é o que transforma o menu em
 *    diagnóstico ("concluídas 12" responde sem clicar).
 *
 * O carimbo "16 abertas · 4 vencidas" do canto direito SAIU (pedido do Diogo): a contagem vive nas
 * abas e ao lado do que ela conta.
 */

const DIA_SP = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });

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
function primeiroNome(n: string): string {
  return n.split(/[\s@]+/)[0];
}

const ROTULO_PRAZO: Record<PrazoFiltro, string> = {
  todos: "Qualquer prazo",
  hoje: "Hoje",
  amanha: "Até amanhã",
  semana: "Esta semana",
  sem_prazo: "Sem prazo",
};
const ROTULO_STATUS: Record<StatusFiltro, string> = { abertas: "Abertas", concluidas: "Concluídas", arquivadas: "Arquivadas" };
const ROTULO_ORIGEM: Record<OrigemFiltro, string> = { todas: "Qualquer origem", jarvis: "Criadas pelo Jarvis", pessoa: "Criadas por pessoas" };

export function FiltrosTarefas({
  filtros,
  onMudar,
  pessoas,
  tiposTarefa,
  tarefas,
  agora,
  meuId,
  fotos,
  mostrarResponsavel,
  mostrarStatus,
  resultado,
  direita,
}: {
  filtros: Filtros;
  onMudar: (parcial: Partial<Filtros>) => void;
  pessoas: PessoaAtiva[];
  tiposTarefa: TipoTarefa[];
  /** o universo ANTES dos filtros — dele saem as contagens e a lista de pacientes */
  tarefas: TarefaVisao[];
  agora: number;
  meuId: string | null;
  /** id ou nome → URL da foto (lib/ensaio/fotos.ts); vazio = iniciais */
  fotos?: Record<string, string>;
  mostrarResponsavel: boolean;
  mostrarStatus: boolean;
  /** quantas a tela mostra AGORA — a segunda metade da linha "entendi assim" */
  resultado: number;
  /** v4 · o canto direito da MESMA barra: visões salvas · ordem · forma de ver */
  direita?: React.ReactNode;
}) {
  const [leitura, setLeitura] = useState<LeituraDaBusca | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const leads = useMemo(() => {
    const s = new Set<string>();
    for (const t of tarefas) if (t.lead_nome) s.add(t.lead_nome);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas]);

  const conta = useMemo(() => {
    const c = { abertas: 0, concluidas: 0, arquivadas: 0, vencidas: 0, jarvis: 0, porPessoa: new Map<string, number>() };
    for (const t of tarefas) {
      if (t.status === "pendente") c.abertas++;
      else if (t.status === "concluida") c.concluidas++;
      else c.arquivadas++;
      if (t.status !== "pendente") continue;
      if (t.vencida) c.vencidas++;
      if (t.origem === "jarvis_conversa") c.jarvis++;
      if (t.responsavel_id) c.porPessoa.set(t.responsavel_id, (c.porPessoa.get(t.responsavel_id) ?? 0) + 1);
    }
    return c;
  }, [tarefas]);

  /*
   * ⌘K é DESTA TELA, e quem entrega isso é o `data-jarvis-atalho-local` no campo (o handler global
   * em components/jarvis/presenca.tsx procura por ele e foca aqui em vez de abrir o popup). O
   * listener próprio que existia aqui foi removido: com os dois de pé, a mesma tecla tinha dois
   * donos — e o segundo a rodar decidia. ⇧⌘K continua abrindo o Jarvis inteiro.
   */

  function perguntar(frase: string) {
    const texto = frase.trim();
    if (!texto) return;
    const l = interpretarBusca(texto, { pessoas, tipos: tiposTarefa, leads, meuId });
    setLeitura(l);
    onMudar({ busca: "", ...l.filtros });
  }

  function limparTudo() {
    setLeitura(null);
    if (campo.current) campo.current.value = "";
    onMudar({ ...FILTROS_PADRAO, exibicao: filtros.exibicao, agrupamento: filtros.agrupamento });
  }

  const chips = chipsAtivos(filtros, { pessoas, tiposTarefa });
  const faixa: DateRange | undefined =
    filtros.de || filtros.ate ? { from: filtros.de ? deYmd(filtros.de) : undefined, to: filtros.ate ? deYmd(filtros.ate) : undefined } : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full flex-wrap items-center gap-1.5">
        {/* ── a pergunta ── */}
        <div className="relative">
          <MarcaJarvis tamanho={16} rotulo="Perguntar ao Jarvis" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
          <input
            ref={campo}
            defaultValue={filtros.busca}
            onKeyDown={(e) => {
              if (e.key === "Enter") perguntar((e.target as HTMLInputElement).value);
              if (e.key === "Escape") {
                (e.target as HTMLInputElement).value = "";
                setLeitura(null);
                onMudar({ busca: "" });
              }
            }}
            data-jarvis-atalho-local
            placeholder="Buscar ou perguntar ao Jarvis…"
            aria-label="Buscar tarefa ou perguntar ao Jarvis"
            className="h-8 w-[320px] rounded-md border border-linha bg-branco pl-8 pr-11 text-[13px] text-tinta outline-none placeholder:text-mute focus:border-linha-forte"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-linha px-1 font-mono text-[10px] text-mute">⌘K</kbd>
        </div>

        {/* ── Quando ── */}
        <Gatilho ativo={filtros.prazo !== "todos" || !!filtros.de || !!filtros.ate || filtros.vencidas} rotulo={rotuloQuando(filtros)}>
          <div className="flex">
            <div className="flex w-[172px] shrink-0 flex-col gap-px border-r border-linha p-1.5">
              {(["hoje", "amanha", "semana", "sem_prazo"] as PrazoFiltro[]).map((p) => (
                <Opcao key={p} ativo={filtros.prazo === p && !filtros.de} onClick={() => onMudar({ prazo: p, de: null, ate: null, vencidas: false })}>
                  {ROTULO_PRAZO[p]}
                </Opcao>
              ))}
              <Opcao
                ativo={filtros.vencidas}
                onClick={() => onMudar({ vencidas: !filtros.vencidas, prazo: "todos", de: null, ate: null, status: "abertas" })}
                contagem={conta.vencidas}
              >
                Atrasadas
              </Opcao>
              <div className="my-1 h-px bg-linha" />
              <Opcao ativo={filtros.prazo === "todos" && !filtros.de && !filtros.vencidas} onClick={() => onMudar({ prazo: "todos", de: null, ate: null, vencidas: false })}>
                Qualquer prazo
              </Opcao>
            </div>
            <div className="p-1.5">
              <Calendar
                mode="range"
                locale={ptBR}
                selected={faixa}
                onSelect={(f: DateRange | undefined) =>
                  onMudar({ de: f?.from ? ymd(f.from) : null, ate: f?.to ? ymd(f.to) : null, prazo: "todos", vencidas: false })
                }
                defaultMonth={faixa?.from ?? deYmd(DIA_SP.format(new Date(agora)))}
              />
            </div>
          </div>
        </Gatilho>

        {/* ── Quem ── */}
        {mostrarResponsavel && (
          <Gatilho ativo={filtros.minhas || filtros.responsavelId != null} rotulo={rotuloQuem(filtros, pessoas)}>
            <div className="flex w-[248px] flex-col gap-px p-1.5">
              {meuId && (
                <Opcao ativo={filtros.minhas} onClick={() => onMudar({ minhas: !filtros.minhas, responsavelId: null })} contagem={conta.porPessoa.get(meuId) ?? 0}>
                  Minhas
                </Opcao>
              )}
              <div className="my-1 h-px bg-linha" />
              {pessoas.map((p) => (
                <Opcao
                  key={p.id}
                  ativo={filtros.responsavelId === p.id}
                  onClick={() => onMudar({ responsavelId: filtros.responsavelId === p.id ? null : p.id, minhas: false })}
                  contagem={conta.porPessoa.get(p.id) ?? 0}
                >
                  <Rosto nome={p.nome} foto={fotos?.[p.id] ?? fotos?.[primeiroNome(p.nome)]} />
                  <span className="truncate">{primeiroNome(p.nome)}</span>
                </Opcao>
              ))}
            </div>
          </Gatilho>
        )}

        {/* ── Situação ── */}
        {mostrarStatus && (
          <Gatilho ativo={filtros.status !== "abertas" || filtros.vencidas || filtros.origem !== "todas"} rotulo={rotuloSituacao(filtros)}>
            <div className="flex w-[240px] flex-col gap-px p-1.5">
              {(["abertas", "concluidas", "arquivadas"] as StatusFiltro[]).map((s) => (
                <Opcao key={s} ativo={filtros.status === s} onClick={() => onMudar({ status: s, vencidas: false })} contagem={conta[s]}>
                  {ROTULO_STATUS[s]}
                </Opcao>
              ))}
              <div className="my-1 h-px bg-linha" />
              <Opcao
                ativo={filtros.vencidas}
                onClick={() => onMudar({ vencidas: !filtros.vencidas, status: "abertas", prazo: "todos", de: null, ate: null })}
                contagem={conta.vencidas}
              >
                Vencidas
              </Opcao>
              <Opcao ativo={filtros.origem === "jarvis"} onClick={() => onMudar({ origem: filtros.origem === "jarvis" ? "todas" : "jarvis" })} contagem={conta.jarvis}>
                <MarcaJarvis tamanho={16} className="shrink-0 text-mute" />
                Criadas pelo Jarvis
              </Opcao>
            </div>
          </Gatilho>
        )}

        {/* ── Tipo ── */}
        <Gatilho ativo={filtros.tipo != null} rotulo={filtros.tipo ? `Tipo: ${tiposTarefa.find((t) => t.chave === filtros.tipo)?.rotulo ?? filtros.tipo}` : "Tipo"}>
          <div className="flex w-[236px] flex-col gap-px p-1.5">
            <Opcao ativo={filtros.tipo == null} onClick={() => onMudar({ tipo: null })}>
              Qualquer tipo
            </Opcao>
            <div className="my-1 h-px bg-linha" />
            {tiposTarefa.map((t) => (
              <Opcao key={t.chave} ativo={filtros.tipo === t.chave} onClick={() => onMudar({ tipo: filtros.tipo === t.chave ? null : t.chave })}>
                {t.rotulo}
              </Opcao>
            ))}
          </div>
        </Gatilho>

        {/* ── Lead ── */}
        <Gatilho ativo={filtros.leadNome != null} rotulo={filtros.leadNome ? `Lead: ${primeiroNome(filtros.leadNome)}` : "Lead"}>
          <ListaDeLeads leads={leads} escolhido={filtros.leadNome} onEscolher={(nome) => onMudar({ leadNome: nome })} />
        </Gatilho>

        {/* ── Mais ── */}
        <Gatilho ativo={filtros.origem === "pessoa"} rotulo="Mais">
          <div className="flex w-[240px] flex-col gap-px p-1.5">
            {(["todas", "jarvis", "pessoa"] as OrigemFiltro[]).map((o) => (
              <Opcao key={o} ativo={filtros.origem === o} onClick={() => onMudar({ origem: o })}>
                {ROTULO_ORIGEM[o]}
              </Opcao>
            ))}
            <div className="my-1 h-px bg-linha" />
            <Opcao ativo={false} onClick={limparTudo}>
              Limpar tudo
            </Opcao>
          </div>
        </Gatilho>

        {/* v4 · a direita da barra: visões salvas · ordem · Lista|Quadro|Calendário */}
        {direita && <div className="ml-auto flex flex-wrap items-center gap-1.5">{direita}</div>}
      </div>

      {/* ── o que o Jarvis entendeu + os chips do que está ligado ── */}
      {(leitura || chips.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {leitura && (
            <p className="inline-flex items-baseline gap-1.5 text-[12.5px] text-suave">
              <MarcaJarvis tamanho={16} className="shrink-0 translate-y-[2px] text-mute" />
              <span>
                {fraseDoEntendi(leitura, resultado)}
                {leitura.naoSei.length > 0 && <span className="text-mute"> Ainda não sei {leitura.naoSei.join(" nem ")}.</span>}
              </span>
            </p>
          )}
          {chips.map((c) => (
            <button
              key={c.chave}
              type="button"
              onClick={() => {
                setLeitura(null);
                if (c.chave === "q" && campo.current) campo.current.value = "";
                onMudar(c.limpar);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-linha bg-branco py-0.5 pl-2.5 pr-1.5 text-[12px] text-suave transition-colors hover:border-linha-forte hover:text-tinta"
            >
              {c.rotulo}
              <XIcon className="size-3 text-mute" aria-hidden />
              <span className="sr-only">remover filtro</span>
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={limparTudo} className="text-[12px] text-mute underline-offset-[3px] hover:text-tinta hover:underline">
              Limpar tudo
            </button>
          )}
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            title="Copia o link desta visão — os filtros vivem na URL"
            className="ml-auto text-[12px] text-mute underline-offset-[3px] hover:text-tinta hover:underline"
          >
            Salvar visão
          </button>
        </div>
      )}
    </div>
  );
}

function rotuloQuando(f: Filtros): string {
  if (f.de || f.ate) return `Quando: ${f.de ? ddmm(f.de) : "…"} – ${f.ate ? ddmm(f.ate) : "…"}`;
  if (f.vencidas) return "Quando: atrasadas";
  return f.prazo === "todos" ? "Quando" : `Quando: ${ROTULO_PRAZO[f.prazo]}`;
}

function rotuloQuem(f: Filtros, pessoas: PessoaAtiva[]): string {
  if (f.minhas) return "Quem: minhas";
  if (f.responsavelId) return `Quem: ${primeiroNome(pessoas.find((p) => p.id === f.responsavelId)?.nome ?? "outro")}`;
  return "Quem";
}

function rotuloSituacao(f: Filtros): string {
  const partes = [f.status !== "abertas" ? ROTULO_STATUS[f.status] : null, f.vencidas ? "vencidas" : null, f.origem === "jarvis" ? "do Jarvis" : null].filter(Boolean);
  return partes.length ? `Situação: ${partes.join(" · ")}` : "Situação";
}

interface Chip {
  chave: string;
  rotulo: string;
  limpar: Partial<Filtros>;
}

function chipsAtivos(f: Filtros, ctx: { pessoas: PessoaAtiva[]; tiposTarefa: TipoTarefa[] }): Chip[] {
  const c: Chip[] = [];
  if (f.busca.trim()) c.push({ chave: "q", rotulo: `“${f.busca.trim()}”`, limpar: { busca: "" } });
  if (f.minhas) c.push({ chave: "minhas", rotulo: "Minhas", limpar: { minhas: false } });
  if (f.responsavelId) c.push({ chave: "resp", rotulo: primeiroNome(ctx.pessoas.find((p) => p.id === f.responsavelId)?.nome ?? "outro membro"), limpar: { responsavelId: null } });
  if (f.status !== "abertas") c.push({ chave: "status", rotulo: ROTULO_STATUS[f.status], limpar: { status: "abertas" } });
  if (f.vencidas) c.push({ chave: "venc", rotulo: "Vencidas", limpar: { vencidas: false } });
  if (f.de || f.ate) c.push({ chave: "faixa", rotulo: `${f.de ? ddmm(f.de) : "…"} – ${f.ate ? ddmm(f.ate) : "…"}`, limpar: { de: null, ate: null } });
  else if (f.prazo !== "todos") c.push({ chave: "prazo", rotulo: ROTULO_PRAZO[f.prazo], limpar: { prazo: "todos" } });
  if (f.tipo) c.push({ chave: "tipo", rotulo: ctx.tiposTarefa.find((t) => t.chave === f.tipo)?.rotulo ?? f.tipo, limpar: { tipo: null } });
  if (f.leadNome) c.push({ chave: "lead", rotulo: f.leadNome, limpar: { leadNome: null } });
  if (f.origem !== "todas") c.push({ chave: "origem", rotulo: ROTULO_ORIGEM[f.origem], limpar: { origem: "todas" } });
  return c;
}

/** o gatilho mostra o VALOR escolhido, não o nome da dimensão */
export function Gatilho({ ativo, rotulo, children }: { ativo: boolean; rotulo: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 max-w-[280px] items-center gap-1 rounded-md border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
          ativo ? "border-linha-forte bg-hover font-medium text-tinta" : "border-linha bg-branco text-suave hover:text-tinta",
        )}
      >
        <span className="truncate">{rotulo}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-mute" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function Opcao({ ativo, onClick, contagem, children }: { ativo: boolean; onClick: () => void; contagem?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        ativo ? "bg-hover font-medium text-tinta" : "text-suave hover:bg-hover hover:text-tinta",
      )}
    >
      {ativo ? <CheckIcon className="size-3.5 shrink-0 text-laranja" aria-hidden /> : <span className="size-3.5 shrink-0" aria-hidden />}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{children}</span>
      {contagem != null && <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-mute">{contagem}</span>}
    </button>
  );
}

function Rosto({ nome, foto }: { nome: string; foto?: string }) {
  if (foto) return <img src={foto} alt="" className="size-[18px] shrink-0 rounded-full object-cover" />;
  return (
    <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-navy text-[8px] font-semibold text-branco" aria-hidden>
      {nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** lista de pacientes com busca interna — acima de 8 nomes, rolar deixa de ser caminho */
function ListaDeLeads({ leads, escolhido, onEscolher }: { leads: string[]; escolhido: string | null; onEscolher: (n: string | null) => void }) {
  const [q, setQ] = useState("");
  const vistos = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? leads.filter((l) => l.toLowerCase().includes(n)) : leads;
  }, [leads, q]);
  return (
    <div className="flex w-[256px] flex-col p-1.5">
      {leads.length > 8 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar paciente…"
          aria-label="Filtrar paciente"
          className="mb-1 h-7 rounded-md border border-linha bg-branco px-2 text-[12.5px] outline-none focus:border-linha-forte"
        />
      )}
      <div className="flex max-h-[260px] flex-col gap-px overflow-y-auto">
        {escolhido && (
          <Opcao ativo={false} onClick={() => onEscolher(null)}>
            Qualquer paciente
          </Opcao>
        )}
        {vistos.map((l) => (
          <Opcao key={l} ativo={escolhido === l} onClick={() => onEscolher(escolhido === l ? null : l)}>
            {l}
          </Opcao>
        ))}
        {vistos.length === 0 && <p className="px-2 py-3 text-center text-[12.5px] text-mute">Nenhum paciente com “{q.trim()}”.</p>}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FileTextIcon,
  PlayIcon,
  WalletIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ConversaResumo, Mensagem } from "@/lib/dados/conversas";
import type { PainelLead, TarefaLead } from "@/lib/dados/lead-painel";
import type { EtapaFunil } from "@/lib/dados/funil";
import type { EnvioProgramadoLinha } from "@/lib/conversas/envios-programados";
import type { Mencionavel } from "@/lib/conversas/mencao";
import { AbaHistorico } from "@/components/lead/aba-historico";
import { mapaDeAgentes, mapaDeEtapas, mapaDePessoas } from "@/components/lead/regras/historico.ts";
import { inputParaValor, valorParaInput, valorParaTexto, type CampoFicha } from "@/lib/dados/ficha-calculos";
import { estadoDoPrazo } from "@/lib/tarefas/proxima";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { fraseLinha, podeCancelar, previa, visiveisNaConversa } from "@/lib/conversas/envios-programados";
import { tempoDesde } from "@/lib/conversas/jarvis-proposta";
import { diasNaEtapa } from "@/lib/tempo";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { salvarCampoFicha, concluirTarefaLead } from "@/app/(app)/lead/actions";
import { moverCardEtapa } from "@/app/(app)/funil/actions";
import { concluirTarefaEnsaio, moverEtapaEnsaio, salvarCampoFichaEnsaio } from "@/app/(app)/conversas/ensaio-actions";

/**
 * O PAINEL DO LEAD ao lado da conversa (W-D3 v3, 10/09 — Diogo às 23:10: "está faltando muita
 * coisa; pega inspiração do LiderHub").
 *
 * Roubado de `features/inbox/ui/data-panel/` e `features/contacts/ui/detail/` do LiderHub:
 *  · **cabeçalho = identidade, e só** (panel-header.tsx: "cabeçalho de painel é onde se lê quem é,
 *    não onde se decide o que fazer") — nome, telefone, cidade, etapa com barra e tempo, quem atende;
 *  · **destaques** em três mini-cards (highlight-card.tsx: rótulo 11px muted em cima, valor embaixo;
 *    ausência é FRASE, nunca "0" — "zero é uma afirmação, e afirmar sem saber é mentir");
 *  · **abas** Ficha · Funil · Tarefas · Agendadas · Histórico · Mídias — só a ativa monta
 *    (data-panel.tsx), cada uma com o próprio vazio explicando a causa;
 *  · **ficha editável no lugar** (contact-aside.tsx / editable-value): clique no valor abre o
 *    editor, Enter/blur salva, Esc desiste — e a pessoa vê o valor novo antes da resposta voltar.
 *
 * A mesma dieta do resto da tela: sem subtítulos explicativos, sem caixa alta, rótulos muted.
 * No ensaio as escritas vão para o cookie de estado; fora dele, para as actions da porta.
 */

/**
 * W-D3 v5 (Diogo, 00:12) · A ABA "FUNIL" SAIU. A pergunta dele mata o caso: "se tem esse aviso,
 * para que ter algo só para o funil?" — mover etapa virou ação do CABEÇALHO (clicar na etapa abre
 * o seletor) e o resto do funil já está a um clique no ↗ do lead. Uma aba a menos é uma linha a
 * menos de navegação para o mesmo trabalho.
 */
type Aba = "ficha" | "tarefas" | "agendadas" | "historico" | "midias";

const ABAS: Array<[Aba, string]> = [
  ["ficha", "Ficha"],
  ["tarefas", "Tarefas"],
  ["agendadas", "Agendadas"],
  ["historico", "Histórico"],
  ["midias", "Mídias"],
];

const ORIGEM: Record<string, string> = {
  wa: "WhatsApp", whatsapp: "WhatsApp", ig: "Instagram", instagram: "Instagram",
  meta: "Meta Ads", "meta ads": "Meta Ads", facebook: "Meta Ads", ind: "Indicação", indicacao: "Indicação",
};

function fmtTelefone(t: string | null): string {
  if (!t) return "—";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

function fmtValor(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function primeiroNome(s: string | null | undefined): string | null {
  if (!s) return null;
  const base = s.includes("@") ? s.split("@")[0] : s;
  return base.trim().split(/\s+/)[0] || null;
}

export function PainelLead({
  conversa,
  painel,
  etapas,
  mensagens,
  programadas,
  mencionaveis,
  quemAtende,
  dono,
  ensaio,
  onCancelarProgramado,
  avisar,
}: {
  conversa: ConversaResumo;
  painel: PainelLead | null;
  etapas: EtapaFunil[];
  mensagens: Mensagem[];
  programadas: EnvioProgramadoLinha[];
  mencionaveis: Mencionavel[];
  /** "Clara" | "Sara" | … — quem conduz a conversa agora */
  quemAtende: string;
  /** dono do lead (core.lead.dono) — null = sem dono */
  dono: string | null;
  ensaio: boolean;
  onCancelarProgramado: (id: string) => void;
  avisar: (m: string) => void;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("ficha");
  const agora = Date.now();
  const leadId = conversa.lead_id ?? null;
  const titulo = conversa.nome?.trim() || fmtTelefone(conversa.telefone);
  const valores = painel?.ficha.valores ?? {};
  const cidade = valores.cidade ? String(valores.cidade) : null;

  const pendentes = useMemo(() => (painel?.tarefas ?? []).filter((t) => t.status === "pendente"), [painel]);
  const proxima = useMemo(() => {
    if (pendentes.length === 0) return null;
    const ms = (t: TarefaLead) => (t.prazo ? new Date(t.prazo).getTime() : Number.MAX_SAFE_INTEGER);
    return [...pendentes].sort((a, b) => ms(a) - ms(b))[0];
  }, [pendentes]);
  const ultimaEntrada = useMemo(() => [...mensagens].reverse().find((m) => m.direcao === "entrada" && !m.programada_para) ?? null, [mensagens]);
  const ultimaSaida = useMemo(() => [...mensagens].reverse().find((m) => m.direcao === "saida" && !m.programada_para) ?? null, [mensagens]);
  const dias = diasNaEtapa(conversa.entrou_etapa_em ?? null, agora);
  const valor = fmtValor(conversa.valor);
  const pessoas = useMemo(() => mencionaveis.filter((m) => m.tipo === "humano" && m.ativo), [mencionaveis]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── identidade ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <h2 className="min-w-0 truncate text-[16px] font-[650] leading-[1.25] text-tinta">{titulo}</h2>
          {conversa.kommo_lead_id && <span className="shrink-0 font-mono text-[11px] text-mute">#{conversa.kommo_lead_id}</span>}
          <button
            type="button"
            onClick={() => router.push(`/funil${leadId ? `?lead=${leadId}` : ""}`)}
            title="Abrir no funil"
            aria-label="Abrir no funil"
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-mute hover:bg-hover hover:text-navy"
          >
            <ArrowUpRightIcon className="size-3.5" strokeWidth={2} />
          </button>
        </div>
        <p className="mt-0.5 text-[12px] text-suave">
          <span className="font-mono tabular-nums">{fmtTelefone(conversa.telefone)}</span>
          {conversa.nome_contato && conversa.nome_contato !== conversa.nome?.trim() && (
            <span> · WhatsApp: {conversa.nome_contato}</span>
          )}
          {cidade && <span> · {cidade}</span>}
          {conversa.idade != null && <span> · {conversa.idade} anos</span>}
        </p>
        <p className="mt-0.5 text-[12px] text-suave">
          {conversa.origem ? <span>origem {ORIGEM[conversa.origem.toLowerCase()] ?? conversa.origem}</span> : <span className="text-mute">origem não registrada</span>}
          <span> · </span>
          {dono ? <span>dono {dono}</span> : <span className="text-mute">sem dono</span>}
        </p>
        {(conversa.tags ?? []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(conversa.tags ?? []).map((t) => (
              <span key={t} className="rounded-full bg-hover px-2 py-px text-[11px] text-suave">
                {t}
              </span>
            ))}
          </div>
        )}
        {/* W-D3 v5 · UMA linha: etapa (clicável = mover) · tempo na etapa · quem atende. A régua
            de progresso saiu — ela custava 14px de altura para dizer o que a palavra já diz. */}
        <div className="mt-1.5 flex items-center gap-2 text-[12px]">
          <SeletorEtapa conversa={conversa} etapas={etapas} ensaio={ensaio} avisar={avisar} />
          {dias != null && <span className="shrink-0 text-suave">{dias === 0 ? "entrou hoje" : dias === 1 ? "1 dia" : `${dias} dias`}</span>}
          <span className="ml-auto shrink-0 truncate text-suave">{quemAtende} atende</span>
        </div>
      </div>

      {/* ── destaques: UMA linha (Diogo, 00:12: "não precisa desses cards gigantes de tarefa") ── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pt-2 text-[11.5px] leading-[16px] text-suave">
        {proxima ? (
          <button type="button" onClick={() => setAba("tarefas")} className="min-w-0 max-w-full truncate text-left underline-offset-2 hover:text-tinta hover:underline">
            <span className="text-mute">Próxima: </span>
            <span className="text-tinta">{proxima.titulo}</span>
            {proxima.prazo && (
              <span className={cn(estadoDoPrazo(proxima.prazo, agora) === "vencida" ? "text-vermelho" : "text-suave")}>
                {" "}
                · {estadoDoPrazo(proxima.prazo, agora) === "vencida" ? "venceu" : "vence"} {dataHoraCurta(proxima.prazo)}
              </span>
            )}
          </button>
        ) : (
          <span className="text-mute">Sem tarefa pendente</span>
        )}
        <span aria-hidden className="text-linha-forte">|</span>
        {ultimaEntrada ? (
          <span className="shrink-0">
            Último contato {tempoDesde(ultimaEntrada.criado_em, agora)}
            <span className="text-mute">
              {" "}
              · {ultimaSaida && new Date(ultimaSaida.criado_em) > new Date(ultimaEntrada.criado_em) ? "respondida" : "sem resposta"}
            </span>
          </span>
        ) : (
          <span className="shrink-0 text-mute">Nunca escreveu</span>
        )}
        <span aria-hidden className="text-linha-forte">|</span>
        {valor ? (
          <button type="button" onClick={() => setAba("ficha")} className="shrink-0 tabular-nums underline-offset-2 hover:text-tinta hover:underline">
            {valor} <span className="text-mute">{conversa.etapa === "ganho" ? "fechado" : "estimado"}</span>
          </button>
        ) : (
          <span className="shrink-0 text-mute">sem proposta</span>
        )}
      </div>

      {/* ── abas ──────────────────────────────────────────────────────────────── */}
      <div className="mt-3 flex gap-2.5 border-b border-linha px-4" role="tablist">
        {ABAS.map(([k, rot]) => {
          const qtd = k === "tarefas" ? pendentes.length : k === "agendadas" ? visiveisNaConversa(programadas).length : 0;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              className={cn(
                "whitespace-nowrap border-b-[1.5px] pb-1.5 pt-1 text-[12px] transition-colors focus-visible:outline-none",
                aba === k ? "border-navy font-semibold text-navy" : "border-transparent text-mute hover:text-tinta",
              )}
            >
              {rot}
              {qtd > 0 && <span className={cn("ml-1 text-[10.5px] font-normal tabular-nums", aba === k ? "text-suave" : "text-mute")}>{qtd}</span>}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {aba === "ficha" && <AbaFicha leadId={leadId} painel={painel} ensaio={ensaio} avisar={avisar} />}
        {aba === "tarefas" && <AbaTarefas leadId={leadId} tarefas={painel?.tarefas ?? []} pessoas={pessoas} ensaio={ensaio} avisar={avisar} agora={agora} />}
        {aba === "agendadas" && <AbaAgendadas programadas={programadas} onCancelar={onCancelarProgramado} agora={agora} />}
        {aba === "historico" && (
          <div className="px-1">
            {painel ? (
              <AbaHistorico
                historico={painel.historico.eventos}
                donoLegado={painel.historico.donoLegado}
                pessoas={mapaDePessoas(mencionaveis)}
                agentes={mapaDeAgentes(mencionaveis)}
                etapas={mapaDeEtapas(etapas)}
              />
            ) : (
              <Vazio>Conversa sem lead vinculado — o histórico nasce com o lead.</Vazio>
            )}
          </div>
        )}
        {aba === "midias" && <AbaMidias mensagens={mensagens} />}
      </div>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] leading-relaxed text-mute">{children}</p>;
}

// ───────────────────────────── Ficha ─────────────────────────────

function AbaFicha({ leadId, painel, ensaio, avisar }: { leadId: string | null; painel: PainelLead | null; ensaio: boolean; avisar: (m: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locais, setLocais] = useState<Record<string, unknown>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  if (!leadId || !painel) return <Vazio>Conversa sem lead vinculado — a ficha aparece quando o lead existir no funil.</Vazio>;
  const grupos = painel.ficha.grupos ?? [];
  const valores = { ...(painel.ficha.valores ?? {}), ...locais };
  if (grupos.length === 0) return <Vazio>Nenhum campo configurado ainda. Os campos do paciente se configuram em Configurações → Ficha.</Vazio>;

  function abrir(c: CampoFicha) {
    if (!c.editavel) return;
    setEditando(c.slug);
    setRascunho(valorParaInput(c.tipo, valores[c.slug]));
  }
  function salvar(c: CampoFicha, bruto: string) {
    const parse = inputParaValor(c.tipo, bruto);
    if (!parse.ok) {
      avisar(`${c.nome}: ${parse.erro}`);
      return;
    }
    setEditando(null);
    if (valorParaInput(c.tipo, valores[c.slug]) === bruto) return;
    setLocais((v) => ({ ...v, [c.slug]: parse.valor }));
    startTransition(async () => {
      const r = ensaio ? await salvarCampoFichaEnsaio(leadId!, c.slug, parse.valor) : await salvarCampoFicha(leadId!, c.slug, parse.valor);
      if (!r.ok) {
        setLocais((v) => {
          const { [c.slug]: _, ...resto } = v;
          return resto;
        });
        avisar(`Não salvou ${c.nome}: ${r.motivo}`);
      } else router.refresh();
    });
  }

  return (
    <div className="px-4 py-1">
      {grupos.map((g) => (
        <GrupoFicha key={g.chave} grupo={g} valores={valores} unico={grupos.length === 1}>
          {g.campos.map((c) => {
            const emEdicao = editando === c.slug;
            const texto = textoDoCampo(c, valores[c.slug]);
            return (
              <div key={c.slug} className="flex min-h-[28px] items-center gap-3 border-b border-linha/60 last:border-b-0">
                <dt className="w-[44%] shrink-0 truncate text-[13px] text-mute" title={c.nome}>
                  {c.nome}
                </dt>
                <dd className="min-w-0 flex-1 text-right">
                  {emEdicao ? (
                    <Editor campo={c} valor={rascunho} onChange={setRascunho} onSalvar={(v) => salvar(c, v)} onCancelar={() => setEditando(null)} />
                  ) : c.tipo === "url" && texto !== "—" ? (
                    <span className="inline-flex max-w-full items-center gap-1">
                      <a href={String(valores[c.slug])} target="_blank" rel="noreferrer" className="truncate text-[12.5px] text-navy underline-offset-2 hover:underline">
                        abrir pasta
                      </a>
                      <button type="button" onClick={() => abrir(c)} className="rounded px-1 text-[11px] text-mute hover:bg-hover hover:text-tinta" aria-label={`Editar ${c.nome}`}>
                        editar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => abrir(c)}
                      disabled={!c.editavel || pending}
                      title={c.editavel ? "Clique para editar" : "Campo sem editor"}
                      className={cn(
                        "max-w-full whitespace-pre-line rounded px-1.5 py-0.5 text-right text-[13px] leading-[17px] text-tinta transition-colors",
                        c.editavel ? "hover:bg-hover" : "cursor-default",
                        texto === "—" && "text-mute",
                      )}
                    >
                      {texto}
                    </button>
                  )}
                </dd>
              </div>
            );
          })}
        </GrupoFicha>
      ))}
    </div>
  );
}

/** Endereço em objeto (`linha_0…`) vira linhas; arquivo vira o nome; o resto segue `valorParaTexto`. */
function textoDoCampo(c: CampoFicha, valor: unknown): string {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const o = valor as Record<string, unknown>;
    const linhas = Object.keys(o)
      .filter((k) => /^linha_\d+$/.test(k))
      .sort()
      .map((k) => String(o[k]))
      .filter(Boolean);
    if (linhas.length) return linhas.join("\n");
    if (typeof o.arquivo === "string") return o.arquivo;
    if (typeof o.nome === "string") return o.nome;
  }
  const t = valorParaTexto(c.tipo, valor);
  if (c.slug === "data_de_nascimento" && t !== "—") {
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const idade = Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / (365.25 * 86_400_000));
      return `${t} · ${idade} anos`;
    }
  }
  if (c.slug === "orcamento" && t !== "—" && typeof valor === "number") return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  return t;
}

/**
 * Grupo colapsável com "4 de 11 preenchidos" (Diogo): campo vazio mostra "—" e AINDA ASSIM
 * aparece — o vendedor precisa ver o que falta. Começa fechado só quando não tem nada preenchido.
 */
function GrupoFicha({ grupo, valores, unico, children }: { grupo: { chave: string; nome: string; campos: CampoFicha[] }; valores: Record<string, unknown>; unico: boolean; children: React.ReactNode }) {
  const total = grupo.campos.length;
  const preenchidos = grupo.campos.filter((c) => valores[c.slug] != null && valores[c.slug] !== "").length;
  // v5 · Identificação e os grupos COM dado abrem; grupo vazio nasce fechado, mostrando "0 de 8"
  const [aberto, setAberto] = useState(unico || grupo.chave === "identificacao" || preenchidos > 0);
  return (
    <section className="border-b border-linha py-1 last:border-b-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex h-7 w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40"
      >
        <span className="text-[12.5px] font-medium text-tinta">{grupo.nome}</span>
        <span className="text-[11px] tabular-nums text-mute">
          {preenchidos} de {total}
        </span>
        <ChevronDownIcon className={cn("ml-auto size-3.5 text-mute transition-transform", !aberto && "-rotate-90")} strokeWidth={2} aria-hidden />
      </button>
      {aberto && <dl className="pb-1">{children}</dl>}
    </section>
  );
}

/** Editor inline por tipo — Enter salva, Esc desiste, blur salva. Seleção/booleano = Select do preset. */
function Editor({
  campo,
  valor,
  onChange,
  onSalvar,
  onCancelar,
}: {
  campo: CampoFicha;
  valor: string;
  onChange: (v: string) => void;
  onSalvar: (v: string) => void;
  onCancelar: () => void;
}) {
  if (campo.tipo === "selecao" || campo.tipo === "booleano") {
    const opcoes = campo.tipo === "booleano" ? [["sim", "Sim"], ["nao", "Não"]] : campo.opcoes.map((o) => [o, o]);
    return (
      <Select
        value={valor || null}
        onValueChange={(v) => onSalvar(String(v ?? ""))}
        onOpenChange={(o) => {
          if (!o) setTimeout(onCancelar, 0);
        }}
        defaultOpen
        items={Object.fromEntries(opcoes)}
      >
        <SelectTrigger aria-label={campo.nome} className="ml-auto h-7 w-auto min-w-[120px] text-[12.5px]">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent align="end">
          {opcoes.map(([v, rot]) => (
            <SelectItem key={v} value={v}>
              {rot}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (campo.tipo === "texto_longo") {
    return (
      <Textarea
        autoFocus
        rows={3}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onSalvar(valor)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSalvar(valor);
          }
          if (e.key === "Escape") onCancelar();
        }}
        aria-label={campo.nome}
        className="min-h-0 w-full text-left text-[12.5px]"
      />
    );
  }
  const tipo = campo.tipo === "data" ? "date" : campo.tipo === "data_hora" ? "datetime-local" : campo.tipo === "numero" ? "text" : campo.tipo === "url" ? "url" : "text";
  return (
    <Input
      autoFocus
      type={tipo}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onSalvar(valor)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSalvar(valor);
        if (e.key === "Escape") onCancelar();
      }}
      aria-label={campo.nome}
      className="ml-auto h-7 w-full max-w-[200px] text-right text-[12.5px]"
    />
  );
}

// ────────────────────── etapa no cabeçalho (era a aba Funil) ──────────────────────

/**
 * A ETAPA É O BOTÃO. Clicar abre a lista das etapas do board com a atual marcada; escolher move
 * (`etapa_alterada` pela porta; no ensaio, cookie). "Perdido" não entra: ele pede motivo, e o
 * motivo se escolhe no funil — a tela diz isso em vez de abrir um caminho que recusa depois.
 */
function SeletorEtapa({ conversa, etapas, ensaio, avisar }: { conversa: ConversaResumo; etapas: EtapaFunil[]; ensaio: boolean; avisar: (m: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const leadId = conversa.lead_id ?? null;
  const doBoard = etapas.filter((e) => !e.no_board).sort((a, b) => a.ordem - b.ordem);
  const atual = etapas.find((e) => e.chave === conversa.etapa) ?? null;

  function mover(chave: string) {
    setAberto(false);
    if (!leadId || chave === conversa.etapa) return;
    startTransition(async () => {
      const r = ensaio ? await moverEtapaEnsaio(leadId, chave) : await moverCardEtapa(leadId, conversa.etapa ?? "", chave);
      if (!r.ok) avisar(`Não moveu: ${r.motivo}`);
      else {
        avisar(`Movido para ${etapas.find((e) => e.chave === chave)?.nome ?? chave}.`);
        router.refresh();
      }
    });
  }

  if (!leadId) return <span className="min-w-0 truncate font-medium text-tinta">{conversa.etapa_nome ?? "sem etapa"}</span>;
  return (
    <div className="relative min-w-0 shrink">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        title="Mover de etapa"
        className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40 disabled:opacity-60"
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: atual?.cor ?? "#252F63" }} aria-hidden />
        <span className="min-w-0 truncate font-medium text-tinta">{conversa.etapa_nome ?? "sem etapa"}</span>
        <svg viewBox="0 0 24 24" className="size-3 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} aria-hidden />
          <ul role="listbox" aria-label="Mover de etapa" className="absolute left-0 top-full z-30 mt-1 w-[220px] overflow-hidden rounded-lg border border-linha-forte bg-branco py-1 shadow-forte animate-rise">
            {doBoard.map((e) => {
              const perdida = e.tipo === "perdido";
              return (
                <li key={e.chave}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={e.chave === conversa.etapa}
                    onClick={() => (perdida ? (setAberto(false), router.push(`/funil?lead=${leadId}`)) : mover(e.chave))}
                    className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-hover", e.chave === conversa.etapa && "bg-board font-semibold")}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.cor }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-tinta">{e.nome}</span>
                    {e.chave === conversa.etapa && <CheckIcon className="size-3.5 shrink-0 text-navy" strokeWidth={2.5} />}
                    {perdida && <span className="shrink-0 text-[10.5px] text-mute">pede motivo</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Tarefas ─────────────────────────────

function AbaTarefas({
  leadId,
  tarefas,
  pessoas,
  ensaio,
  avisar,
  agora,
}: {
  leadId: string | null;
  tarefas: TarefaLead[];
  pessoas: Mencionavel[];
  ensaio: boolean;
  avisar: (m: string) => void;
  agora: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const ms = (t: TarefaLead) => (t.prazo ? new Date(t.prazo).getTime() : Number.MAX_SAFE_INTEGER);
  const pendentes = tarefas.filter((t) => t.status === "pendente" && !feitas.has(t.id)).sort((a, b) => ms(a) - ms(b));
  const concluidas = tarefas.filter((t) => t.status !== "pendente" || feitas.has(t.id)).slice(0, 5);
  const nomeDe = (t: TarefaLead) => primeiroNome(pessoas.find((p) => p.id === t.responsavel_id)?.nome ?? t.responsavel);

  function concluir(t: TarefaLead) {
    setFeitas((s) => new Set(s).add(t.id));
    startTransition(async () => {
      const r = ensaio ? await concluirTarefaEnsaio(t.id) : await concluirTarefaLead(leadId ?? "", t.id, "feita pela conversa");
      if (!r.ok) {
        setFeitas((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        });
        avisar(`Não concluiu: ${r.motivo}`);
      } else router.refresh();
    });
  }

  if (!leadId) return <Vazio>Conversa sem lead vinculado — tarefa precisa de um lead.</Vazio>;
  if (pendentes.length === 0 && concluidas.length === 0) {
    return (
      <Vazio>
        Nenhuma tarefa para este lead. Digite <kbd className="rounded border border-linha bg-board px-1 font-mono text-[11px]">/</kbd> no campo da conversa para criar uma.
      </Vazio>
    );
  }
  return (
    <div className="px-4 py-2">
      <ul>
        {pendentes.map((t) => {
          const estado = estadoDoPrazo(t.prazo, agora);
          return (
            <li key={t.id} className="flex items-start gap-2.5 border-b border-linha/80 py-2 last:border-b-0">
              <button
                type="button"
                onClick={() => concluir(t)}
                disabled={pending}
                aria-label={`Concluir: ${t.titulo}`}
                title="Concluir"
                className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-linha-forte text-transparent transition-colors hover:border-verde hover:bg-verde-bg hover:text-verde"
              >
                <CheckIcon className="size-2.5" strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-snug text-tinta">{t.titulo}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-suave">
                  {t.prazo ? (
                    <span className={cn(estado === "vencida" && "text-vermelho")}>
                      {estado === "vencida" ? "venceu" : "vence"} {dataHoraCurta(t.prazo)}
                    </span>
                  ) : (
                    <span>sem prazo</span>
                  )}
                  {nomeDe(t) && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{nomeDe(t)}</span>
                    </>
                  )}
                  {t.origem === "jarvis_conversa" && (
                    <>
                      <span aria-hidden>·</span>
                      <span>Jarvis</span>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {concluidas.length > 0 && (
        <ul className="mt-1">
          {concluidas.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 py-1.5 text-mute">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-verde-bg text-verde" aria-hidden>
                <CheckIcon className="size-2.5" strokeWidth={3} />
              </span>
              <p className="min-w-0 flex-1 text-[12px] leading-snug line-through">{t.titulo}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────── Agendadas ─────────────────────────────

function AbaAgendadas({ programadas, onCancelar, agora }: { programadas: EnvioProgramadoLinha[]; onCancelar: (id: string) => void; agora: number }) {
  const linhas = visiveisNaConversa(programadas);
  if (linhas.length === 0) {
    return <Vazio>Nada agendado nesta conversa. Escreva no campo e use a seta ao lado de Enviar para escolher quando a mensagem sai.</Vazio>;
  }
  return (
    <ul className="px-4 py-2">
      {linhas.map((l) => (
        <li key={l.id} className="border-b border-linha/80 py-2 last:border-b-0">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={cn("font-medium tabular-nums", l.status === "falhou" ? "text-vermelho" : "text-tinta")}>{l.status === "falhou" ? "não saiu" : fraseLinha(l, agora)}</span>
            {podeCancelar(l) && (
              <button type="button" onClick={() => onCancelar(l.id)} className="ml-auto text-[11.5px] text-suave underline-offset-2 hover:text-tinta hover:underline">
                cancelar
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-suave">“{previa(l.corpo)}”</p>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────────── Mídias ─────────────────────────────

function AbaMidias({ mensagens }: { mensagens: Mensagem[] }) {
  const visuais = mensagens.filter((m) => m.midia_url && /^(imagem|image|video)$/.test((m.tipo_conteudo ?? "").toLowerCase()));
  const docs = mensagens.filter((m) => m.documento);
  const [aberta, setAberta] = useState<Mensagem | null>(null);
  if (visuais.length === 0 && docs.length === 0) {
    return <Vazio>Imagens, vídeos e documentos trocados nesta conversa aparecem aqui.</Vazio>;
  }
  return (
    <div className="px-4 py-3">
      {visuais.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5">
          {[...visuais].reverse().map((m) => {
            const video = (m.tipo_conteudo ?? "").toLowerCase() === "video";
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setAberta(m)}
                  title={m.corpo ?? (video ? "Vídeo" : "Foto")}
                  className="relative block aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-muted/40 transition-colors hover:border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.midia_url!} alt={m.corpo ?? ""} className="size-full object-cover" loading="lazy" />
                  {video && (
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-7 place-items-center rounded-full bg-branco/90 text-navy">
                        <PlayIcon className="ml-px size-3.5 fill-current" />
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {docs.length > 0 && (
        <ul className={cn(visuais.length > 0 && "mt-3 border-t border-linha pt-2")}>
          {[...docs].reverse().map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 py-1.5">
              <FileTextIcon className="size-4 shrink-0 text-suave" strokeWidth={2} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-tinta">{m.documento!.nome}</span>
                <span className="block text-[11px] text-mute">
                  {m.documento!.tamanho} · {new Date(m.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {aberta && (
        <span role="dialog" aria-label="Mídia ampliada — clique para fechar" onClick={() => setAberta(null)} className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-navy/80 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aberta.midia_url!} alt={aberta.corpo ?? ""} className="max-h-full max-w-full rounded-lg shadow-forte" />
        </span>
      )}
    </div>
  );
}

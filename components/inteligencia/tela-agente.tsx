"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRightLeft,
  BarChart3,
  BellRing,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Columns3,
  FileText,
  Gauge,
  ListChecks,
  Megaphone,
  MessageSquare,
  Receipt,
  Scale,
  Send,
  ShieldCheck,
  SquarePen,
  UserRoundCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { alternarAgente, publicarPromptAgente } from "@/app/(app)/configuracoes/agentes/actions";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { TraceAgente, type ExecucaoTrace } from "@/components/ui/trace-agente";
import { ReguaAutonomia, type NivelAutonomia } from "@/components/jarvis/regua-autonomia";
import { cn } from "@/lib/utils";
import { CapaAgente, GlifoAgente } from "./glifos";
import { NumeroGrande, PontoEstado, Secao, TagAgente, VazioHonesto } from "./pecas";
import type { AgenteInteligencia, FerramentaAgente } from "@/lib/ensaio/inteligencia";
import type { TarefaCriadaPeloAgente } from "@/lib/dados/execucoes-jarvis";

/**
 * A TELA DE UM AGENTE — a tela inteira, não uma gaveta.
 *
 * A ordem das seções é a ordem das perguntas que alguém faz sobre um agente, na vida real:
 * o que ele consegue fazer (ferramentas) → até onde pode ir sozinho (autonomia) → mostra uma vez
 * (execuções, com o trace) → com que instrução (prompt) → quem confere e onde isso aparece.
 *
 * Agente desligado abre a MESMA tela. As ferramentas continuam listadas — elas existem — e o que
 * muda é o estado vazio, que diz a verdade em vez de fingir número: "ainda não executou".
 *
 * 14/09/2026 — OS CONTROLES GRAVAM, e um deles passou a dizer que não grava.
 *
 * Esta tela nasceu no ensaio e foi promovida ao caminho real em `aac6aec` com os handlers locais
 * intactos: `setLigado(v)` mostrava "parado" com o agente ativo, e "Publicar v+1" incrementava um
 * número enquanto o agente seguia com o prompt antigo. Interruptor e prompt agora passam por
 * `agentes/actions.ts` — o mesmo caminho da tela da Clara, com o agente como parâmetro.
 *
 * A RÉGUA DE AUTONOMIA É A EXCEÇÃO, e vale dizer por quê: ela não tem caminho no banco. O projetor
 * `porta.proj_config_agente` (0107) trata `ativo`, `config_patch` e `escopo_patch` — não há ramo de
 * autonomia, e `core.agente.autonomia_jsonb` não se altera por evento nenhum. Isso é LACUNA, não
 * regressão: nunca houve. Então fora do ensaio ela fica em leitura, com o motivo escrito na tela.
 * Deixá-la clicável seria repetir exatamente o defeito que este commit corrige.
 */

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  criar_tarefa: SquarePen,
  consultar_funil: Columns3,
  consultar_conversa: MessageSquare,
  consultar_tarefas: ListChecks,
  consultar_dashboard: BarChart3,
  consultar_marketing: Megaphone,
  agenda: CalendarDays,
  agendar: CalendarDays,
  responder: Send,
  mover_etapa: ArrowRightLeft,
  transbordar: UserRoundCheck,
  consultar_bureau: ShieldCheck,
  ler_ficha: FileText,
  calcular_score: Gauge,
  propor_condicao: Scale,
  ler_cobrancas: Receipt,
  enviar_lembrete: BellRing,
  cobrar_atraso: CalendarClock,
  avisar_gestora: UserRoundCheck,
};

/** "hoje 14:32" / "ontem 09:10" / "08/09 16:44" — hora sempre, porque é o que prova a passada. */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (dia(d) === dia(hoje)) return `hoje ${hora}`;
  if (dia(d) === dia(ontem)) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

export function TelaAgente({
  agente: a,
  gestao,
  criadas,
  ensaio = false,
}: {
  agente: AgenteInteligencia;
  gestao: boolean;
  /**
   * O que ele criou de verdade (`core.v_tarefa`, `origem = 'jarvis_conversa'`). `null` = não deu
   * para ler. Nos dois casos sem conteúdo a seção some — ordem do Diogo em 11/09: "preciso do
   * histórico do que ele cria; se isso não é documentado, remova a seção do front".
   */
  criadas?: TarefaCriadaPeloAgente[] | null;
  /** `true` só no ensaio, onde não há banco. Default `false`: quem esquecer vê um erro, não uma mentira. */
  ensaio?: boolean;
}) {
  const router = useRouter();
  const [ligado, setLigado] = React.useState(a.ativo);
  const [autonomia, setAutonomia] = React.useState(a.autonomia);
  const [gravando, setGravando] = React.useState(false);
  const impedido = a.pendencias.length > 0;

  React.useEffect(() => setLigado(a.ativo), [a.ativo]);

  function mudarAutonomia(chave: string, nivel: NivelAutonomia) {
    setAutonomia((linhas) =>
      linhas.map((l) => (l.chave === chave ? { ...l, nivel, alteradaPor: "você · agora" } : l)),
    );
  }

  const alternar = async (v: boolean) => {
    if (ensaio) {
      setLigado(v);
      return;
    }
    setGravando(true);
    try {
      const r = await alternarAgente(a.chave, v);
      if (!r.ok) {
        toast.error(v ? "Não ligou." : "Não desligou.", { description: r.motivo ?? "o servidor recusou" });
        return;
      }
      setLigado(v);
      toast.success(v ? `${a.nome} no ar.` : `${a.nome} parado.`, {
        description: "Vale na próxima mensagem, e ficou registrado no ledger.",
      });
      router.refresh();
    } catch (e) {
      toast.error("Não gravou.", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGravando(false);
    }
  };

  const lendo = a.ferramentas.filter((f) => f.acesso === "leitura" && !f.futura).length;
  const escrevendo = a.ferramentas.filter((f) => f.acesso === "escrita" && !f.futura).length;

  return (
    <div className="w-full px-6 pb-12 pt-5 2xl:px-8">
      <nav className="mb-4 text-[12px] text-muted-foreground">
        <Link href="/configuracoes/inteligencia" className="underline-offset-4 hover:underline">
          Inteligência
        </Link>
        <span className="px-1.5 text-muted-foreground/50">/</span>
        <Link href="/configuracoes/agentes" className="underline-offset-4 hover:underline">
          Agentes
        </Link>
        <span className="px-1.5 text-muted-foreground/50">/</span>
        <span className="text-foreground">{a.nome}</span>
      </nav>

      {/* cabeçalho */}
      <header className="relative overflow-hidden rounded-lg border border-border bg-card">
        <CapaAgente chave={a.glifo} tom={a.tom} ligado={ligado} altura={72} className="border-b-0" />
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 px-6 pb-5 pt-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="-mt-9 inline-flex size-[60px] shrink-0 items-center justify-center rounded-xl border border-border bg-card"
              style={{ color: ligado ? `var(--chart-${a.tom})` : "var(--muted-foreground)" }}
            >
              <GlifoAgente chave={a.glifo} tamanho={32} rotulo={a.nome} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold leading-none tracking-[-0.025em] text-foreground">{a.nome}</h1>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                {a.papel} · {a.area}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
                <PontoEstado situacao={ligado ? "ligado" : a.situacao} />
                {a.ultima_acao && ligado && <span>· {a.ultima_acao.texto}</span>}
                {!ligado && a.pendencias[0] && <span>· {a.pendencias[0]}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            {a.numeros.map((n) => (
              <NumeroGrande key={n.rotulo} rotulo={n.rotulo} valor={n.valor} />
            ))}
            <div className="flex items-center gap-2.5">
              {a.chave === "jarvis" && (
                <Link href="/jarvis" className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Perguntar
                </Link>
              )}
              <HintTooltip
                title={impedido && !ligado ? "Não dá para ligar ainda" : ligado ? "Desligar" : "Ligar"}
                content={
                  impedido && !ligado
                    ? a.pendencias.join(" · ")
                    : gestao
                      ? "Vale na hora, e fica registrado com quem mudou."
                      : "Só gestão liga e desliga agente."
                }
              >
                <span className="flex items-center gap-2">
                  <Switch
                    checked={ligado}
                    onCheckedChange={(v) => void alternar(v)}
                    disabled={!gestao || gravando || (impedido && !ligado)}
                    aria-label={`${ligado ? "Desligar" : "Ligar"} ${a.nome}`}
                  />
                  <span className="text-[12.5px] text-muted-foreground">{ligado ? "no ar" : "parado"}</span>
                </span>
              </HintTooltip>
            </div>
          </div>
        </div>
      </header>

      <Secao
        titulo="Ferramentas"
        descricao={`O que ele consegue fazer, e por onde. ${lendo} leem, ${escrevendo} ${escrevendo === 1 ? "escreve" : "escrevem"}.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {a.ferramentas.map((f) => (
            <CartaoFerramenta key={f.chave} ferramenta={f} />
          ))}
        </div>
      </Secao>

      <Secao
        titulo="Autonomia"
        descricao={
          ensaio
            ? "Até onde ele vai sozinho, por tipo de ação. Mudar aqui vale na hora — não precisa de deploy."
            : "Até onde ele vai sozinho, por tipo de ação. Hoje só se lê: mudar por esta tela ainda não existe."
        }
      >
        <ReguaAutonomia
          linhas={autonomia}
          podeEditar={ensaio && gestao && ligado}
          onMudar={mudarAutonomia}
          agente={{ id: a.chave, nome: a.nome }}
        />
        {!ensaio && (
          <p className="mt-2 max-w-[80ch] text-[12.5px] text-muted-foreground">
            A régua está em leitura porque não existe caminho de gravação: o projetor de config de
            agente (0107) aplica <code>ativo</code>, <code>config_patch</code> e{" "}
            <code>escopo_patch</code> — nenhum deles toca <code>autonomia_jsonb</code>. Mudar a
            autonomia hoje é migration, não configuração. Isto está dito aqui em vez de um controle
            que aceita o clique e não muda nada.
          </p>
        )}
      </Secao>

      {/* O passo a passo de cada passada (o trace) NÃO é gravado em lugar nenhum — só existe como
          fixture, no ensaio. O que É gravado é a consequência: a tarefa que o agente abriu, com
          hora e com o motivo escrito por ele (`core.v_tarefa`, `origem`). Então fora do ensaio a
          seção mostra ISSO, e o vazio diz a verdade sobre o estado do agente em vez de afirmar
          "ainda não executou · está desligado" sobre um que está ligado e executando. */}
      {a.execucoes.length > 0 ? (
        <Secao
          titulo="Últimas execuções"
          descricao="Cada passo que ele deu, na ordem, com o que voltou e quanto durou. Arraste o marcador para varrer a execução."
          acao={<span className="text-[12px] text-muted-foreground">{a.execucoes.length} de hoje</span>}
        >
          <Execucoes execucoes={a.execucoes} />
        </Secao>
      ) : criadas && criadas.length > 0 ? (
        <Secao
          titulo="O que ele criou"
          descricao="Cada tarefa que ele abriu sozinho, da mais recente para a mais antiga, com o motivo que ele mesmo escreveu."
          acao={
            <span className="text-[12px] text-muted-foreground">
              {criadas.length} {criadas.length === 1 ? "tarefa" : "tarefas"}
            </span>
          }
        >
          <ol className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
            {criadas.map((t) => (
              <li key={t.id} className="px-3.5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[12px] tabular-nums text-muted-foreground">{quando(t.criado_em)}</span>
                  <span className="text-[13.5px] font-medium text-foreground">{t.titulo}</span>
                  {t.lead_nome && (
                    <Link
                      href={t.lead_id ? `/funil?lead=${t.lead_id}` : "/tarefas"}
                      className="text-[12.5px] text-muted-foreground underline-offset-4 hover:underline"
                    >
                      · {t.lead_nome}
                    </Link>
                  )}
                  <span className="text-[12px] text-muted-foreground">
                    · {t.status === "concluida" ? "concluída" : t.status === "pendente" ? "aberta" : t.status}
                    {t.responsavel ? ` · ${t.responsavel}` : ""}
                  </span>
                </div>
                {(t.por_que || t.fazer) && (
                  <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
                    {t.por_que}
                    {t.por_que && t.fazer ? " — " : ""}
                    {t.fazer}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Secao>
      ) : (
        <Secao
          titulo="O que ele criou"
          descricao="Cada tarefa que ele abre sozinho aparece aqui, com o motivo que ele mesmo escreveu."
        >
          <VazioHonesto
            titulo={criadas === null ? "Não deu para ler agora" : "Nada criado ainda"}
            linha={
              criadas === null
                ? `O histórico de ${a.nome} existe no banco, mas esta leitura falhou. Recarregue a página.`
                : a.situacao === "esperando_credencial"
                  ? `${a.nome} está pronto, mas falta a credencial: ${a.pendencias.join(" · ")}.`
                  : ligado
                    ? `${a.nome} está ligado e ainda não criou nada. Quando criar, a tarefa aparece aqui com hora e motivo.`
                    : `${a.nome} está desligado. Quando ligar, cada tarefa que ele criar aparece aqui.`
            }
          />
        </Secao>
      )}

      <Secao
        titulo="Instrução"
        descricao="O texto que ele recebe antes de cada execução. A versão anterior fica no histórico."
      >
        <BlocoPrompt agente={a} podeEditar={gestao} ensaio={ensaio} />
      </Secao>

      <section className="grid gap-8 border-t border-border/60 py-7 lg:grid-cols-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Quem valida</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Quem aceita, ajusta ou descarta o que {a.nome} propõe.
          </p>
          <ul className="mt-4 divide-y divide-border/60 rounded-md border border-border/60">
            {a.validadores.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3.5 py-2.5">
                {v.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.foto} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                    {v.nome.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground">{v.nome}</p>
                  <p className="text-[12px] text-muted-foreground">{v.papel}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Onde ele aparece</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            As telas em que a equipe encontra {a.nome} sem procurar por ele.
          </p>
          <ul className="mt-4 divide-y divide-border/60 rounded-md border border-border/60">
            {a.aparece.map((d) => (
              <li key={d.rotulo}>
                <Link
                  href={d.href}
                  className="flex items-baseline gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/60"
                >
                  <span className="w-[92px] shrink-0 text-[13.5px] font-medium text-foreground">{d.rotulo}</span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">{d.onde}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CartaoFerramenta({ ferramenta: f }: { ferramenta: FerramentaAgente }) {
  const Icone = ICONES[f.chave] ?? FileText;
  const escreve = f.acesso === "escrita";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-3.5 py-3",
        f.futura ? "border-dashed border-border bg-transparent" : "border-border/60 bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <Icone
          className={cn(
            "size-4 shrink-0",
            f.futura ? "text-muted-foreground/50" : escreve ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className={cn("text-[13.5px] font-medium", f.futura ? "text-muted-foreground" : "text-foreground")}>
          {f.rotulo}
        </span>
      </div>
      <p className="text-[12.5px] leading-snug text-muted-foreground">{f.descricao}</p>
      <div className="mt-auto flex items-center gap-2 pt-1.5 text-[11.5px] text-muted-foreground">
        <TagAgente>{escreve ? "escreve" : "lê"}</TagAgente>
        <span>
          {f.futura ? "ainda não construída" : f.usos7d === null ? "sem uso ainda" : `${f.usos7d.toLocaleString("pt-BR")} usos · 7 d`}
        </span>
      </div>
    </div>
  );
}

function Execucoes({ execucoes }: { execucoes: ExecucaoTrace[] }) {
  const [aberta, setAberta] = React.useState<string | null>(execucoes[0]?.id ?? null);
  return (
    <div className="flex flex-col gap-2.5">
      {execucoes.map((e, i) => {
        const ativa = aberta === e.id;
        if (i === 0 || ativa) {
          return (
            <div key={e.id}>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => setAberta(null)}
                  className="mb-1.5 flex w-full items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="size-3.5 rotate-180" />
                  fechar
                </button>
              )}
              <TraceAgente execucao={e} tocarAoEntrar={i === 0 || ativa} />
            </div>
          );
        }
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => setAberta(e.id)}
            className="flex items-center gap-3 rounded-md border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:border-foreground/20"
          >
            <span className="font-mono text-[12px] text-foreground">{e.id}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
              {e.quando} · {e.passos.length} passos · {(e.duracaoMs / 1000).toFixed(1).replace(".", ",")} s
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * O PROMPT — e a justificativa que o caminho versionado exige.
 *
 * Publicar é `api.propor_atualizacao_prompt` + `api.validar_sugestao` (0007/0008): a proposta nasce
 * com lock otimista por `versao_base`, e a aprovação gera `prompt_atualizado`. Duas consequências
 * que aparecem na tela:
 *  · a JUSTIFICATIVA é obrigatória de verdade — o banco recusa sem ela, e é o que fica legível no
 *    histórico meses depois. Antes não havia campo, porque nada era publicado;
 *  · publicar sobre uma versão que mudou no meio do caminho FALHA em vez de sobrescrever. O motivo
 *    volta do Postgres e aparece inteiro.
 */
function BlocoPrompt({
  agente: a,
  podeEditar,
  ensaio,
}: {
  agente: AgenteInteligencia;
  podeEditar: boolean;
  ensaio: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(a.prompt);
  const [justificativa, setJustificativa] = React.useState("");
  const [versao, setVersao] = React.useState(a.versao_prompt);
  const [publicada, setPublicada] = React.useState<number | null>(null);
  const [publicando, setPublicando] = React.useState(false);
  const mudou = texto.trim() !== a.prompt.trim();
  const podePublicar = mudou && (ensaio || justificativa.trim().length > 0);

  const publicar = async () => {
    if (ensaio) {
      setVersao((v) => v + 1);
      setPublicada(versao + 1);
      setEditando(false);
      return;
    }
    setPublicando(true);
    try {
      const r = await publicarPromptAgente(a.chave, texto, justificativa, versao);
      if (!r.ok) {
        toast.error("O prompt não foi publicado.", { description: r.motivo ?? "o servidor recusou" });
        return;
      }
      setVersao((v) => v + 1);
      setPublicada(versao + 1);
      setJustificativa("");
      setEditando(false);
      toast.success(`Prompt v${versao + 1} publicado.`, { description: `${a.nome} passa a usar na próxima passada.` });
      router.refresh();
    } catch (e) {
      toast.error("Não gravou.", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-2.5">
        <span className="text-[13px] font-medium text-foreground">v{versao}</span>
        <span className="text-[12px] text-muted-foreground">
          {publicada ? `publicada agora por você` : `publicada em ${data(a.prompt_publicado_em)}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {editando ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={publicando}
                onClick={() => {
                  setTexto(a.prompt);
                  setJustificativa("");
                  setEditando(false);
                }}
              >
                Cancelar
              </Button>
              <Button size="sm" disabled={!podePublicar || publicando} onClick={() => void publicar()}>
                {publicando ? "Publicando…" : `Publicar v${versao + 1}`}
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/configuracoes/auditoria"
                className="text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Histórico
              </Link>
              {podeEditar && (
                <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                  Editar
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {editando ? (
        <>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={14}
            className="min-h-[280px] resize-y rounded-none border-0 text-[13px] leading-relaxed focus-visible:ring-0"
          />
          {!ensaio && (
            <div className="border-t border-border/60 px-4 py-3">
              <label htmlFor="prompt-justificativa" className="text-[12.5px] font-medium text-foreground">
                O que mudou
              </label>
              <Input
                id="prompt-justificativa"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Ex.: passa a perguntar a cidade antes de oferecer avaliação"
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Obrigatório — é o que fica legível no histórico daqui a seis meses. Sem isso o banco
                recusa a publicação.
              </p>
            </div>
          )}
        </>
      ) : (
        <pre className="max-h-[340px] max-w-[86ch] overflow-auto whitespace-pre-wrap px-4 py-3.5 font-sans text-[13px] leading-relaxed text-foreground">
          {texto}
        </pre>
      )}

      <AnimatePresence>
        {publicada && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-border/60 px-4 py-2 text-[12.5px] text-muted-foreground"
          >
            v{publicada} publicada. A anterior fica no histórico, e a próxima execução já usa esta.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function data(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

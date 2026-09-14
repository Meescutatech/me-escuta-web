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
import {
  alterarAutonomiaAgente,
  alternarAgente,
  definirResponsavelPadrao,
  publicarPromptAgente,
} from "@/app/(app)/configuracoes/agentes/actions";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { TraceAgente, type ExecucaoTrace } from "@/components/ui/trace-agente";
import { ReguaAutonomia, type NivelAutonomia } from "@/components/jarvis/regua-autonomia";
import { cn } from "@/lib/utils";
import { CapaAgente, GlifoAgente } from "./glifos";
import { NumeroGrande, PontoEstado, Secao, TagAgente, VazioHonesto } from "./pecas";
import type { MembroEscolhivel } from "@/lib/agentes/regua-real";
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
 * ── 14/09, mais tarde · A RÉGUA TAMBÉM GRAVA, e o parágrafo que dizia o contrário era FALSO ────
 *
 * Estava escrito aqui, e na tela: "a régua está em leitura porque não existe caminho de gravação;
 * o projetor de config de agente (0107) aplica ativo, config_patch e escopo_patch — nenhum deles
 * toca autonomia_jsonb". O erro é de leitura minha: li `porta.proj_config_agente` e concluí sobre
 * uma capacidade que vive em OUTRO projetor. Medido no banco vivo:
 *
 *     porta.projetor_registro  autonomia_alterada → porta.proj_autonomia_agente  (sem_projetor=f)
 *     porta.proj_autonomia_agente  update core.agente set autonomia_jsonb = … || {cap: nivel}
 *
 * O caminho existia desde a 0104/0165, com SEIS guardas vivas em `api.registrar_evento`. Concluir
 * "não existe" pelo projetor errado é a mesma classe de erro que E-360 ("tela vazia ≠ feature
 * ausente"), com o objeto trocado.
 *
 * O que continua verdade, e ficou no lugar do parágrafo: a régua oferece DOIS estados, não três.
 * O gate do runtime é binário (`lerGateJarvis`: `criar_tarefa` diferente de `auto` = o Jarvis
 * cala, não propõe), então "Propõe" seria um botão que promete fila de sugestões e entrega
 * silêncio. Decisão do Diogo: "corta essa feature por enquanto. Só liga ou desliga".
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
  membros,
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
  /** Quem pode ser o responsável padrão — `core.v_membro` ativos. Vazio fora do caminho real. */
  membros?: MembroEscolhivel[];
  /** `true` só no ensaio, onde não há banco. Default `false`: quem esquecer vê um erro, não uma mentira. */
  ensaio?: boolean;
}) {
  const router = useRouter();
  const [ligado, setLigado] = React.useState(a.ativo);
  const [autonomia, setAutonomia] = React.useState(a.autonomia);
  const [gravando, setGravando] = React.useState(false);
  const [gravandoCap, setGravandoCap] = React.useState<ReadonlySet<string>>(new Set());
  const impedido = a.pendencias.length > 0;

  React.useEffect(() => setLigado(a.ativo), [a.ativo]);
  React.useEffect(() => setAutonomia(a.autonomia), [a.autonomia]);

  /**
   * Liga/desliga UMA capacidade. No ensaio é estado local (não há banco); no caminho real é
   * `autonomia_alterada` pelo ponto único de escrita, e o estado da tela só muda DEPOIS de o
   * servidor confirmar a projeção. A ordem importa: pintar antes de gravar é o defeito que esta
   * tela inteira existiu para tirar.
   */
  const mudarAutonomia = async (chave: string, nivel: NivelAutonomia) => {
    if (ensaio) {
      setAutonomia((linhas) =>
        linhas.map((l) => (l.chave === chave ? { ...l, nivel, alteradaPor: "você · agora" } : l)),
      );
      return;
    }
    const ligar = nivel === "auto";
    setGravandoCap((s) => new Set(s).add(chave));
    try {
      const r = await alterarAutonomiaAgente(a.chave, chave, ligar);
      if (!r.ok) {
        toast.error(ligar ? "Não ligou." : "Não desligou.", { description: r.motivo ?? "o servidor recusou" });
        return;
      }
      setAutonomia((linhas) =>
        linhas.map((l) => (l.chave === chave ? { ...l, nivel, alteradaPor: "você · agora" } : l)),
      );
      toast.success(ligar ? "Passa a fazer sozinho." : "Deixa de fazer.", {
        description: "Vale na próxima passada do agente, e ficou registrado no ledger.",
      });
      router.refresh();
    } catch (e) {
      toast.error("Não gravou.", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGravandoCap((s) => {
        const n = new Set(s);
        n.delete(chave);
        return n;
      });
    }
  };

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
        descricao="O que ele faz sozinho, por tipo de ação. Ligar vale na próxima passada — não precisa de deploy."
      >
        <ReguaAutonomia
          linhas={autonomia}
          podeEditar={gestao}
          gravando={gravandoCap}
          onMudar={(chave, nivel) => void mudarAutonomia(chave, nivel)}
          agente={{ id: a.chave, nome: a.nome }}
        />
        {!ensaio && autonomia.length === 0 && (
          <p className="mt-2 max-w-[80ch] text-[12.5px] text-muted-foreground">
            {a.nome} não tem nenhuma capacidade gravada em <code>autonomia_jsonb</code>. Não é
            defeito de leitura: é o estado do agente no banco. Dar a primeira capacidade a um agente
            é migration, porque a régua liga e desliga o que já existe — não cria.
          </p>
        )}
      </Secao>

      {a.chave === "jarvis" && (
        <Secao
          titulo="Responsável padrão"
          descricao="Para quem a tarefa vai quando o lead não tem dono claro."
        >
          <ResponsavelPadrao
            agente={a}
            membros={membros ?? []}
            podeEditar={gestao && !ensaio}
            ensaio={ensaio}
          />
        </Secao>
      )}

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

/**
 * O RESPONSÁVEL PADRÃO — uma pessoa fixa, escolhida aqui, para quando não há dono claro.
 *
 * ── O degrau que este campo ocupa ──────────────────────────────────────────────────────────
 * O Jarvis resolve o responsável em três degraus (runtime, `resolverDestinoTarefa`): dono ativo do
 * lead → gestor do departamento de entrada → owner. Medido em produção em 14/09,
 * `core.usuario_departamento` tem ZERO linhas — então o segundo degrau nunca casa e TODA tarefa
 * sem dono cai no owner. Este campo troca o ÚLTIMO degrau. O rodízio por departamento continua
 * valendo no dia em que houver lotação: isto não o substitui, fica embaixo dele.
 *
 * ── 🔴 A METADE QUE NÃO EXISTE, dita na tela e não só no PR ────────────────────────────────
 * O runtime ainda NÃO lê `config_jsonb.responsavel_padrao`. Gravar aqui é auditável e vale como
 * decisão registrada no ledger, mas hoje NÃO muda para onde a tarefa vai. Está escrito embaixo do
 * campo, em vez de num changelog: um campo que finge funcionar é pior que um campo ausente, e a
 * pessoa que escolhe é justamente quem precisa saber disso.
 */
function ResponsavelPadrao({
  agente: a,
  membros,
  podeEditar,
  ensaio,
}: {
  agente: AgenteInteligencia;
  membros: MembroEscolhivel[];
  podeEditar: boolean;
  ensaio: boolean;
}) {
  const router = useRouter();
  const [escolhido, setEscolhido] = React.useState<string | null>(a.responsavel_padrao ?? null);
  const [gravando, setGravando] = React.useState(false);

  React.useEffect(() => setEscolhido(a.responsavel_padrao ?? null), [a.responsavel_padrao]);

  const escolher = async (uid: string) => {
    if (ensaio) {
      setEscolhido(uid);
      return;
    }
    setGravando(true);
    try {
      const r = await definirResponsavelPadrao(a.chave, uid);
      if (!r.ok) {
        toast.error("Não gravou o responsável padrão.", { description: r.motivo ?? "o servidor recusou" });
        return;
      }
      setEscolhido(uid);
      const nome = membros.find((m) => m.id === uid)?.nome ?? "a pessoa escolhida";
      toast.success(`Responsável padrão: ${nome}.`, {
        description: "Ficou registrado no ledger. O runtime ainda não lê este campo.",
      });
      router.refresh();
    } catch (e) {
      toast.error("Não gravou.", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGravando(false);
    }
  };

  if (membros.length === 0) {
    return (
      <VazioHonesto
        titulo="Não há ninguém para escolher"
        linha={
          ensaio
            ? "No ensaio não há banco, então a lista de pessoas não é carregada."
            : "A lista sai de `core.v_membro` (pessoas ativas) e voltou vazia. Sem pessoa ativa, não há para quem mandar a tarefa."
        }
      />
    );
  }

  const atual = membros.find((m) => m.id === escolhido) ?? null;

  return (
    <div className="max-w-[80ch] rounded-md border border-border/60 bg-card px-4 py-3.5">
      <label htmlFor="responsavel-padrao" className="text-[13.5px] font-medium text-foreground">
        Quando não houver dono claro, a tarefa vai para
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Select
          value={escolhido ?? ""}
          onValueChange={(v) => void escolher(String(v))}
          disabled={!podeEditar || gravando}
        >
          <SelectTrigger id="responsavel-padrao" className="w-[320px] max-w-full">
            <SelectValue placeholder="Ninguém escolhido — hoje cai no owner" />
          </SelectTrigger>
          <SelectContent>
            {membros.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.nome} · {m.papel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {gravando && <span className="text-[12px] text-muted-foreground">gravando…</span>}
        {!podeEditar && !ensaio && (
          <span className="text-[12px] text-muted-foreground">Só gestão muda isto.</span>
        )}
      </div>

      <p className="mt-2.5 text-[12.5px] leading-snug text-muted-foreground">
        O dono do lead vem primeiro, sempre. Depois o gestor do departamento de entrada — que hoje
        não casa com ninguém, porque nenhuma pessoa está lotada em departamento. {atual ? atual.nome : "O owner"}{" "}
        é o último degrau.
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
        ⚠️ O motor ainda não lê este campo: a escolha fica gravada e auditável, mas hoje ela não muda
        para onde a tarefa vai. Falta o degrau correspondente no runtime.
      </p>
    </div>
  );
}

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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, LinkIcon, MoreHorizontalIcon, PlusIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Departamento } from "@/lib/departamentos/escopo";
import { expiraEm, type ConviteEnsaio, type MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { formatarE164 } from "@/lib/ensaio/fixtures/canais";
import { CARGOS_ATIVOS, cargoDe, cargoDoConvite, cargoPorChave, conviteDoCargo, type Cargo } from "@/lib/ensaio/fixtures/cargos";
import { gerarAtividadeMembro } from "@/lib/ensaio/fixtures/membro-atividade";
import { fotosEnsaio } from "@/lib/ensaio/fotos";
import { CabecalhoCartaoPessoa, CartaoPessoa, desdeQuando, type NumeroDaPessoa, type Pessoa } from "@/components/pessoas/cartao-pessoa";
import { PainelPessoa } from "@/components/pessoas/painel-pessoa";
import { emailConviteValido } from "@/lib/membros";
import {
  gerarConvitePorCargo,
  mudarCargo as acaoMudarCargo,
  reativarAcesso as acaoReativarAcesso,
  reenviarConvite as acaoReenviarConvite,
  revogarAcesso as acaoRevogarAcesso,
  revogarConvite as acaoRevogarConvite,
} from "@/app/(app)/configuracoes/membros/actions";
import { CascaConfig, Contagem } from "./casca-config";

/**
 * /configuracoes/membros — quem entra no sistema, e **com que cargo**.
 *
 * Refeita em 11/09. O que mudou em relação à de ontem:
 *  · a linha é o `CartaoPessoa` (`components/pessoas/`), a mesma peça do painel de perfil e do que
 *    os irmãos montarem em funil e tarefas — antes cada tela remontava a pessoa à mão, que é o
 *    defeito que o Twenty e o LiderHub têm;
 *  · o **cargo** é o que se lê embaixo do nome; papel e departamento continuam existindo (é o que
 *    o banco grava, D91), mas como consequência do cargo, não como dois campos soltos;
 *  · o convite pede **um cargo**, e o bloco abaixo do seletor diz o que a pessoa vai receber —
 *    papel, lotação, se entra como gestora, e o que ela não vai alcançar.
 *
 * O link continua sendo o meio (D91 R5: `canal='link'`, e-mail desligado). Pendentes com "expira
 * em": Twenty `SettingsWorkspaceMembersInviteTab.tsx:147-236`.
 *
 * 14/09/2026 — ESTA TELA VOLTA A GRAVAR. Os três commits de 11/09 que a promoveram ao caminho real
 * religaram a LEITURA e deixaram a ESCRITA nos handlers locais do ensaio: revogar acesso era
 * `setMembros`, revogar convite era `setConvites` com o toast "o link não abre mais" enquanto o
 * link abria, e convidar fabricava `token: cnv_${Math.random()}` no NAVEGADOR — um convite que
 * aparecia na lista, subia o contador e não existia em `core.convite` (medido: zero linhas no dia).
 *
 * A correção é de fiação, não de funcionalidade: as sete actions reais sempre estiveram em
 * `membros/actions.ts`. Agora cada handler tem dois ramos, e o `ensaio` é quem escolhe:
 *  · `ensaio === true`  → setState local. É o comportamento CERTO ali: a tela de demonstração não
 *    tem banco, e o estado local é o que a faz funcionar sem um.
 *  · `ensaio === false` → a action decide. O estado local só muda DEPOIS do servidor confirmar, e
 *    recusa vira toast de erro com o motivo que o Postgres devolveu — nunca sucesso silencioso.
 */
export function MembrosEnsaio({
  meuId,
  meuPapel,
  membros: membrosIniciais,
  convites: convitesIniciais,
  departamentos,
  canais,
  agoraIso,
  ensaio = false,
}: {
  meuId: string;
  meuPapel: "owner" | "admin" | "membro" | "marketing";
  membros: MembroEnsaio[];
  convites: ConviteEnsaio[];
  departamentos: Departamento[];
  canais: CanalEnsaio[];
  agoraIso: string;
  /**
   * `true` só no modo ensaio. Esta tela serve os DOIS caminhos desde 11/09, e a atividade por
   * pessoa (mensagens · tarefas · com IA) é gerada por molde — no caminho real ela afirmaria
   * número que ninguém mediu, sobre gente de verdade. Default `false`: quem esquecer vê de menos.
   */
  ensaio?: boolean;
}) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [membros, setMembros] = useState(membrosIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  /** id do alvo em gravação — trava o botão e evita a segunda escrita em cima da primeira. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** link devolvido pelo servidor ao renovar um convite (o antigo morre no ato). */
  const [linkRenovado, setLinkRenovado] = useState<{ nome: string; url: string } | null>(null);

  // Depois de gravar, o servidor é quem manda: as actions chamam `revalidatePath` e o
  // `router.refresh()` reexecuta a página, trazendo props novas. Sem este resync, uma mudança que
  // entrou PELA METADE (mudar cargo são até três eventos, não uma transação) continuaria na tela
  // como se tivesse entrado inteira — que é a classe de mentira que esta rodada existe para tirar.
  useEffect(() => {
    setMembros(membrosIniciais);
  }, [membrosIniciais]);
  useEffect(() => {
    setConvites(convitesIniciais);
  }, [convitesIniciais]);
  const [busca, setBusca] = useState("");
  const [cargoFiltro, setCargoFiltro] = useState<string>("todos");
  const [convidando, setConvidando] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const podeGerir = meuPapel === "owner" || meuPapel === "admin";
  const fotos = useMemo(() => fotosEnsaio(), []);

  const rotuloDep = (chave: string) => departamentos.find((d) => d.chave === chave)?.rotulo ?? chave;

  const termo = busca.trim().toLowerCase();
  const visiveis = membros.filter((m) => {
    if (termo && !m.nome.toLowerCase().includes(termo) && !m.email.toLowerCase().includes(termo)) return false;
    if (cargoFiltro !== "todos" && cargoDe(m)?.chave !== cargoFiltro) return false;
    return true;
  });
  const pendentes = convites.filter((c) => c.status === "pendente" || c.status === "expirado");

  const numerosDe = (m: MembroEnsaio): NumeroDaPessoa[] =>
    canais
      .filter((c) => c.responsavel_id === m.id)
      .map((c) => ({ canal_id: c.canal_id, apelido: c.apelido, numero: formatarE164(c.numero_e164), ativo: c.ativo }));

  const metricasDe = (m: MembroEnsaio) => {
    if (!ensaio) return undefined;
    const r = gerarAtividadeMembro(m, agora).resumo7d;
    return [
      { rotulo: "mensagens", valor: r[0].valor },
      { rotulo: "tarefas", valor: r[1].valor },
      { rotulo: "com IA", valor: r[2].valor },
    ];
  };

  const comoPessoa = (m: MembroEnsaio): Pessoa => ({
    id: m.id,
    nome: m.nome,
    email: m.email,
    papel: m.papel,
    funcao: m.funcao,
    ativo: m.ativo,
    departamentos: m.departamentos,
    ultimoAcessoEm: m.ultimo_acesso_em,
    entrouEm: m.criado_em,
    foto: fotos[m.id] ?? null,
  });

  /**
   * O casco comum das quatro escritas. `aoConfirmar` só roda quando o servidor aceitou — é o
   * ponto inteiro desta correção. Recusa devolve o motivo do Postgres, que já vem em PT-BR
   * ("sem permissao: ...", "o owner nao pode ser revogado"), e não um "algo deu errado".
   */
  const gravar = async (
    chave: string,
    acao: () => Promise<{ ok: boolean; motivo?: string }>,
    aoConfirmar: () => void,
  ): Promise<boolean> => {
    setOcupado(chave);
    try {
      const r = await acao();
      if (!r.ok) {
        toast.error("Não gravou.", { description: r.motivo ?? "o servidor recusou, sem motivo declarado" });
        return false;
      }
      aoConfirmar();
      router.refresh();
      return true;
    } catch (e) {
      toast.error("Não gravou.", { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Copiar o link de um convite que JÁ existe só é possível no ensaio.
   *
   * Fora dele o token não volta: `core.v_convite` não o expõe e `ops.convite_token` guarda só o
   * hash — quem tem o token entra, então guardá-lo legível seria guardar a credencial. Recuperar
   * um link perdido é RENOVAR (o antigo morre no ato). Por isso o botão só aparece quando há token.
   */
  const copiarLink = async (c: ConviteEnsaio) => {
    const url = `${window.location.origin}/convite/aceitar?token=${c.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.", { description: "Mande pelo WhatsApp da pessoa. Vale 7 dias." });
    } catch {
      toast(url);
    }
  };

  const renovar = async (c: ConviteEnsaio) => {
    if (ensaio) {
      setConvites((xs) =>
        xs.map((x) =>
          x.id === c.id
            ? { ...x, status: "pendente" as const, expira_em: new Date(agora.getTime() + 7 * 86_400_000).toISOString(), token: `cnv_${Math.random().toString(36).slice(2, 12)}` }
            : x,
        ),
      );
      toast.success("Convite renovado.", { description: "Link novo, 7 dias. O anterior não abre mais." });
      return;
    }
    setOcupado(`convite:${c.id}`);
    try {
      const r = await acaoReenviarConvite(c.id);
      if (!r.ok || !r.url) {
        toast.error("Não gravou.", { description: r.motivo ?? "o servidor não devolveu o link novo" });
        return;
      }
      setConvites((xs) =>
        xs.map((x) => (x.id === c.id ? { ...x, status: "pendente" as const, expira_em: r.expira_em ?? x.expira_em } : x)),
      );
      setLinkRenovado({ nome: c.nome ?? c.email ?? "quem foi convidado", url: r.url });
      router.refresh();
    } finally {
      setOcupado(null);
    }
  };

  const revogarConvite = async (c: ConviteEnsaio) => {
    const tirar = () => setConvites((xs) => xs.filter((x) => x.id !== c.id));
    const avisar = () =>
      toast("Convite revogado.", { description: `O link de ${c.nome ?? c.email ?? "quem foi convidado"} não abre mais.` });
    if (ensaio) {
      tirar();
      avisar();
      return;
    }
    if (await gravar(`convite:${c.id}`, () => acaoRevogarConvite(c.id), tirar)) avisar();
  };

  const revogarAcesso = async (m: MembroEnsaio) => {
    const virar = () => setMembros((xs) => xs.map((x) => (x.id === m.id ? { ...x, ativo: !x.ativo } : x)));
    const avisar = () => toast(m.ativo ? "Acesso revogado." : "Acesso devolvido.", { description: m.nome });
    if (ensaio) {
      virar();
      avisar();
      return;
    }
    // Revogar e devolver são eventos DIFERENTES (`acesso_revogado` / `acesso_reativado`, 0035),
    // não um interruptor — o ledger registra os dois sentidos com autor e hora.
    const acao = m.ativo ? () => acaoRevogarAcesso(m.id) : () => acaoReativarAcesso(m.id);
    if (await gravar(`membro:${m.id}`, acao, virar)) avisar();
  };

  const mudarCargo = async (m: MembroEnsaio, chave: string) => {
    const c = cargoPorChave(chave);
    if (!c) return;
    const { papel, departamentos: deps } = conviteDoCargo(c);
    const aplicar = () => setMembros((xs) => xs.map((x) => (x.id === m.id ? { ...x, papel, departamentos: deps } : x)));
    const avisar = () => toast.success(`${m.nome.split(" ")[0]} agora é ${c.nome}.`, { description: c.resumo });
    if (ensaio) {
      aplicar();
      avisar();
      return;
    }
    // Quem expande o cargo em papel + lotação é o BANCO (`core.expandir_cargo`); o que a tela
    // mostra acima é a mesma expansão, não uma segunda verdade.
    setOcupado(`membro:${m.id}`);
    try {
      const r = await acaoMudarCargo(m.id, chave);
      if (!r.ok) {
        const entrou = r.passos.filter((x) => x.ok).length;
        toast.error(entrou > 0 ? "O cargo mudou pela metade." : "Não gravou.", {
          description: r.motivo ?? "o servidor recusou, sem motivo declarado",
        });
        // Mesmo na falha parcial: o que entrou, entrou. Recarregar é o que faz a tela contar a
        // verdade em vez de continuar mostrando o cargo antigo — ou o novo.
        if (entrou > 0) router.refresh();
        return;
      }
      aplicar();
      avisar();
      router.refresh();
    } finally {
      setOcupado(null);
    }
  };

  const aberto = membros.find((m) => m.id === abertoId) ?? null;

  return (
    <CascaConfig
      titulo="Membros"
      descricao="Quem entra no sistema e com que cargo. O convite é um link: a pessoa abre, escolhe a senha e já cai no lugar certo."
      acao={
        podeGerir ? (
          <Button onClick={() => setConvidando(true)}>
            <PlusIcon data-icon="inline-start" />
            Convidar
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="relative block w-[260px]">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-8" aria-label="Buscar pessoa" />
          </label>
          {/* Filtrar por cargo: é o filtro que o Linear tem em Members (lá por papel) — aqui pelo
              nome que a operação usa. */}
          <Select
            value={cargoFiltro}
            onValueChange={(v) => setCargoFiltro(String(v))}
            // `items` faz o gatilho mostrar o RÓTULO e não o valor cru — sem ele o filtro exibia
            // "todos" em minúscula, que é a chave, não o nome da opção.
            items={[{ value: "todos", label: "Todos os cargos" }, ...CARGOS_ATIVOS.map((c) => ({ value: c.chave, label: c.nome }))]}
          >
            <SelectTrigger aria-label="Filtrar por cargo" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cargos</SelectItem>
              {CARGOS_ATIVOS.map((c) => (
                <SelectItem key={c.chave} value={c.chave}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Contagem>
          {membros.filter((m) => m.ativo).length} com acesso
          {pendentes.length > 0 ? ` · ${pendentes.length} ${pendentes.length === 1 ? "convite pendente" : "convites pendentes"}` : ""}
        </Contagem>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <CabecalhoCartaoPessoa metricas={ensaio} />
        {visiveis.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-muted-foreground">
            {termo || cargoFiltro !== "todos" ? "Ninguém com esse nome ou nesse cargo." : "Ninguém tem acesso ainda. Comece convidando alguém."}
          </p>
        ) : (
          visiveis.map((m, i) => (
            <CartaoPessoa
              key={m.id}
              pessoa={comoPessoa(m)}
              variante="linha"
              agora={agora}
              rotuloDepartamento={rotuloDep}
              numeros={numerosDe(m)}
              metricas={metricasDe(m)}
              souEu={m.id === meuId}
              onAbrir={() => setAbertoId(m.id)}
              className={cn(i > 0 && "border-t border-border")}
              acoes={
                podeGerir && m.id !== meuId && m.papel !== "owner" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${m.nome}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setAbertoId(m.id)}>Abrir o perfil</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={ocupado === `membro:${m.id}`}
                        onClick={() => void revogarAcesso(m)}
                      >
                        {m.ativo ? "Revogar acesso" : "Devolver acesso"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
          ))
        )}
      </div>

      {pendentes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-ui-13 font-semibold text-foreground">Convites pendentes</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {pendentes.map((c, i) => {
              const cargo = cargoDoConvite(c);
              const prazo = expiraEm(c.expira_em, agora);
              return (
                <div key={c.id} className={cn("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground">
                    <LinkIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-[1.6]">
                    <div className="truncate text-[15px] font-semibold text-foreground">{c.nome ?? c.email ?? "Convite por link"}</div>
                    <div className="mt-0.5 text-[13px]">
                      <span className="font-medium text-foreground">{cargo?.nome ?? "Sem cargo"}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {c.departamentos.length ? c.departamentos.map((d) => rotuloDep(d.departamento)).join(", ") : "sem lotação"}
                      </span>
                    </div>
                  </div>
                  <span className={cn("shrink-0 text-[13px]", prazo.urgente ? "text-warning-ink" : "text-muted-foreground")}>{prazo.texto}</span>
                  <span className="hidden w-[150px] shrink-0 text-right text-[13px] text-muted-foreground lg:block">criado {desdeQuando(c.criado_em, agora)}</span>
                  {podeGerir && (
                    <div className="flex shrink-0 items-center gap-1">
                      {c.token ? (
                        <Button variant="outline" size="sm" onClick={() => copiarLink(c)}>
                          <CopyIcon data-icon="inline-start" />
                          Copiar link
                        </Button>
                      ) : (
                        // Sem token guardado não há link para copiar — e é de propósito. O botão
                        // diz o que de fato acontece: gera um link NOVO e mata o anterior.
                        <Button variant="outline" size="sm" disabled={ocupado === `convite:${c.id}`} onClick={() => void renovar(c)}>
                          <RefreshCwIcon data-icon="inline-start" />
                          Gerar link novo
                        </Button>
                      )}
                      {c.token && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Renovar convite"
                          disabled={ocupado === `convite:${c.id}`}
                          onClick={() => void renovar(c)}
                        >
                          <RefreshCwIcon />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Revogar convite"
                        disabled={ocupado === `convite:${c.id}`}
                        onClick={() => void revogarConvite(c)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {aberto && (
        <PainelPessoa
          membro={aberto}
          eu={meuId}
          gestao={podeGerir}
          rotuloDepartamento={rotuloDep}
          canais={canais}
          fotos={fotos}
          agora={agora}
          ensaio={ensaio}
          onFechar={() => setAbertoId(null)}
          onRevogar={(m) => void revogarAcesso(m)}
          onMudarCargo={(m, chave) => void mudarCargo(m, chave)}
        />
      )}

      <DialogoConvite
        aberto={convidando}
        aoFechar={() => setConvidando(false)}
        rotuloDepartamento={rotuloDep}
        agora={agora}
        criadoPor={meuId}
        ensaio={ensaio}
        aoGerar={(c) => setConvites((xs) => [...xs, c])}
        aoGravar={() => router.refresh()}
      />

      <DialogoLinkNovo aberto={linkRenovado} aoFechar={() => setLinkRenovado(null)} />
    </CascaConfig>
  );
}

/**
 * CONVIDAR — um campo que importa: o CARGO.
 *
 * A versão anterior pedia papel e depois um checkbox por departamento com um seletor de gestora em
 * cada linha: três decisões para quem só sabe que "a Priscila vai cuidar de cobrança". Agora é uma
 * escolha, e o bloco abaixo do seletor mostra o que o banco vai receber (D91 R5) — quem precisa
 * conferir confere, quem não precisa não lê.
 */
function DialogoConvite({
  aberto,
  aoFechar,
  rotuloDepartamento,
  agora,
  aoGerar,
  aoGravar,
  criadoPor,
  ensaio,
}: {
  aberto: boolean;
  aoFechar: () => void;
  rotuloDepartamento: (c: string) => string;
  agora: Date;
  aoGerar: (c: ConviteEnsaio) => void;
  /** avisa a tela que o servidor gravou, para ela recarregar da fonte. */
  aoGravar: () => void;
  criadoPor: string;
  ensaio: boolean;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [chaveCargo, setChaveCargo] = useState<string>("sdr");
  const [gerado, setGerado] = useState<ConviteEnsaio | null>(null);
  const [linkReal, setLinkReal] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargo = (cargoPorChave(chaveCargo) ?? CARGOS_ATIVOS[0]) as Cargo;
  const emailOk = emailConviteValido(email);

  const fechar = () => {
    aoFechar();
    setTimeout(() => {
      setNome("");
      setEmail("");
      setChaveCargo("sdr");
      setGerado(null);
      setLinkReal(null);
      setErro(null);
      setCopiado(false);
    }, 200);
  };

  /**
   * GERAR O CONVITE.
   *
   * No ensaio o convite é de mentira e isso é o certo — não há banco. Fora do ensaio quem gera é o
   * runtime: ele sorteia `randomBytes(32).toString("base64url")` (43 caracteres, sem prefixo),
   * grava só o HASH em `ops.convite_token` e devolve a URL montada. A tela nunca inventa token:
   * era exatamente isso que produzia o link `cnv_…` que abria e não entrava ninguém.
   */
  const gerar = async () => {
    if (ensaio) {
      const { papel, departamentos } = conviteDoCargo(cargo);
      const c: ConviteEnsaio = {
        id: `c0000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
        nome: nome.trim() || null,
        email: email.trim() || null,
        papel,
        departamentos,
        criado_em: agora.toISOString(),
        expira_em: new Date(agora.getTime() + 7 * 86_400_000).toISOString(),
        status: "pendente",
        token: `cnv_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`,
        criado_por: criadoPor,
      };
      setGerado(c);
      aoGerar(c);
      return;
    }

    setErro(null);
    setGerando(true);
    try {
      const r = await gerarConvitePorCargo(email, chaveCargo);
      if (!r.ok || !r.url) {
        setErro(r.motivo ?? "o servidor não devolveu o link");
        return;
      }
      const { papel, departamentos } = conviteDoCargo(cargo);
      setLinkReal(r.url);
      setGerado({
        id: r.convite_id ?? "",
        nome: nome.trim() || null,
        email: email.trim().toLowerCase(),
        papel,
        departamentos,
        criado_em: agora.toISOString(),
        expira_em: r.expira_em ?? new Date(agora.getTime() + 7 * 86_400_000).toISOString(),
        status: "pendente",
        // vazio de propósito: o token existe uma vez só, na resposta. Guardá-lo na tela seria
        // guardar a credencial em memória do navegador sem motivo — o link já está em `linkReal`.
        token: "",
        criado_por: criadoPor,
      });
      aoGravar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };

  const link =
    linkReal ??
    (gerado?.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/convite/aceitar?token=${gerado.token}` : "");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* o campo continua selecionável */
    }
  };

  const oQueRecebe = (() => {
    const { papel, departamentos } = conviteDoCargo(cargo);
    const p = papel === "admin" ? "admin" : papel === "marketing" ? "marketing" : "membro";
    if (departamentos.length === 0) return `Entra como ${p}, sem lotação em departamento.`;
    const d = departamentos[0];
    return `Entra como ${p} e é lotada em ${rotuloDepartamento(d.departamento)}${d.papel_no_departamento === "gestor" ? ", como gestora" : ""}.`;
  })();

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-[520px]">
        {!gerado ? (
          <>
            <DialogHeader>
              <DialogTitle>Convidar alguém</DialogTitle>
              <DialogDescription>
                Escolha o cargo e gere o link. A pessoa abre pelo WhatsApp, escolhe a senha e já entra com tudo no lugar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <FormItemLayout label="Cargo" required htmlFor="convite-cargo">
                <Select value={chaveCargo} onValueChange={(v) => setChaveCargo(String(v))}>
                  <SelectTrigger id="convite-cargo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGOS_ATIVOS.map((c) => (
                      <SelectItem key={c.chave} value={c.chave}>
                        <span className="flex flex-col">
                          <span className="text-ui-13 font-medium text-foreground">{c.nome}</span>
                          <span className="text-ui-11 text-muted-foreground">{c.resumo}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItemLayout>

              <div className="rounded-lg border border-border bg-muted/30 p-3.5">
                <p className="text-[13.5px] text-foreground">{oQueRecebe}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {cargo.ve.slice(0, 2).map((v) => (
                    <li key={v} className="text-ui-12 text-muted-foreground">
                      {v}
                    </li>
                  ))}
                  {cargo.esconde.length > 0 && <li className="text-ui-12 text-muted-foreground">Não alcança: {cargo.esconde.join(" · ")}</li>}
                </ul>
              </div>

              <FormItemLayout
                label="E-mail"
                required
                htmlFor="convite-email"
                description="É por ele que o convite é DESTA pessoa: o aceite confere o e-mail, e só quem o tiver entra por este link."
              >
                <Input
                  id="convite-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErro(null);
                  }}
                  placeholder="priscila@meescuta.com"
                />
              </FormItemLayout>

              <FormItemLayout label="Nome" htmlFor="convite-nome" description="Opcional — só para você lembrar para quem mandou.">
                <Input id="convite-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Priscila Martins" />
              </FormItemLayout>

              {erro && (
                <p role="alert" className="text-[13px] text-destructive">
                  {erro}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button disabled={!emailOk || gerando} onClick={() => void gerar()}>
                {gerando ? "Gerando…" : "Gerar link"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Link pronto</DialogTitle>
              <DialogDescription>
                {gerado.nome ? `${gerado.nome} entra como ${cargo.nome}.` : `${gerado.email ?? "Quem abrir"} entra como ${cargo.nome}.`} O link vale 7 dias e serve uma vez só.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="font-mono text-ui-12" onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
              <Button variant="outline" onClick={copiar} className="shrink-0">
                {copiado ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-ui-12 text-muted-foreground">
              Mande pelo WhatsApp dela. Enquanto não for aceito, o convite fica em pendentes e você pode revogar.
            </p>
            <DialogFooter>
              <Button onClick={fechar}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * LINK NOVO depois de renovar um convite.
 *
 * O link aparece UMA vez, e só aqui: renovar troca o token e o antigo morre no ato (spec §4.3).
 * Se esta janela fechar sem ninguém copiar, o caminho é renovar de novo — não há onde reler.
 */
function DialogoLinkNovo({ aberto, aoFechar }: { aberto: { nome: string; url: string } | null; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!aberto) return;
    try {
      await navigator.clipboard.writeText(aberto.url);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* o campo continua selecionável */
    }
  };
  return (
    <Dialog open={aberto !== null} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Link novo</DialogTitle>
          <DialogDescription>
            O convite de {aberto?.nome} foi renovado: vale 7 dias e o link anterior não abre mais. Copie agora — ele não
            volta a aparecer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={aberto?.url ?? ""}
            className="font-mono text-ui-12"
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link do convite"
          />
          <Button variant="outline" onClick={() => void copiar()} className="shrink-0">
            {copiado ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Selo de cargo — para quem precisar mostrar o cargo fora do cartão de pessoa. */
export function SeloCargo({ cargo, className }: { cargo: Cargo | null; className?: string }) {
  if (!cargo)
    return (
      <Badge variant="muted" size="sm" className={className}>
        sem cargo
      </Badge>
    );
  return (
    <Badge variant="outline" size="sm" className={cn("bg-card", className)}>
      {cargo.nome}
    </Badge>
  );
}

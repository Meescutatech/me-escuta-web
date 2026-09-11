"use client";

import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon, LinkIcon, MoreHorizontalIcon, PlusIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { iniciaisMembro, rotuloPapel } from "@/lib/membros";
import type { Departamento } from "@/lib/departamentos/escopo";
import {
  expiraEm,
  haQuantoTempo,
  type ConviteEnsaio,
  type MembroEnsaio,
  type PapelNoDepartamento,
  type VinculoDepartamento,
} from "@/lib/ensaio/fixtures/membros";
import { CascaConfig, Contagem } from "./casca-config";
import { SheetMembro } from "./sheet-membro";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";

/**
 * /configuracoes/membros (ensaio) — UMA tabela de quem tem acesso, os convites pendentes logo
 * abaixo na mesma grade, e o convite que gera LINK (V1 do contrato: e-mail desligado).
 *
 * O que a tela decide, e que a antiga não mostrava: EM QUAL DEPARTAMENTO cada pessoa está e se
 * é gestora dele (R5). É a coluna que faz o Jarvis saber para quem mandar a tarefa (R7). O
 * badge "gestora" fica colado ao departamento porque é atributo do vínculo, não da pessoa.
 *
 * Referências: LiderHub `members-settings.tsx` + `member-row.tsx` (casca, linha, menu ⋯);
 * Twenty `SettingsWorkspaceMembersInviteTab.tsx` (link público + pendentes com "expira em").
 */

const PAPEIS_CONVITE: Array<{ valor: "membro" | "admin" | "marketing"; rotulo: string; descricao: string }> = [
  { valor: "membro", rotulo: "Membro", descricao: "Atende, vê os leads e conversas dos seus departamentos." },
  { valor: "admin", rotulo: "Admin", descricao: "Tudo o que membro faz, mais configurações, canais e agentes." },
  { valor: "marketing", rotulo: "Marketing", descricao: "Só a captação e os relatórios de mídia. Não vê conversas." },
];

export function MembrosEnsaio({
  meuId,
  meuPapel,
  membros: membrosIniciais,
  convites: convitesIniciais,
  departamentos,
  canais,
  agoraIso,
}: {
  meuId: string;
  meuPapel: "owner" | "admin" | "membro" | "marketing";
  membros: MembroEnsaio[];
  convites: ConviteEnsaio[];
  departamentos: Departamento[];
  canais: CanalEnsaio[];
  agoraIso: string;
}) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [membros, setMembros] = useState(membrosIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  const [busca, setBusca] = useState("");
  const [convidando, setConvidando] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const podeGerir = meuPapel === "owner" || meuPapel === "admin";

  const termo = busca.trim().toLowerCase();
  const membrosVisiveis = membros.filter(
    (m) => !termo || m.nome.toLowerCase().includes(termo) || m.email.toLowerCase().includes(termo),
  );
  const pendentes = convites.filter((c) => c.status === "pendente" || c.status === "expirado");

  const rotuloDep = (chave: string) => departamentos.find((d) => d.chave === chave)?.rotulo ?? chave;

  const copiarLink = async (c: ConviteEnsaio) => {
    const url = `${window.location.origin}/convite/aceitar?token=${c.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.", { description: "Mande pelo WhatsApp da pessoa. Vale 7 dias." });
    } catch {
      toast(url);
    }
  };

  const reenviar = (c: ConviteEnsaio) => {
    const novo = { ...c, status: "pendente" as const, expira_em: new Date(agora.getTime() + 7 * 86_400_000).toISOString(), token: `cnv_${Math.random().toString(36).slice(2, 12)}` };
    setConvites((xs) => xs.map((x) => (x.id === c.id ? novo : x)));
    toast.success("Convite renovado.", { description: "Novo link, novos 7 dias. O anterior não abre mais." });
  };

  const revogar = (c: ConviteEnsaio) => {
    setConvites((xs) => xs.filter((x) => x.id !== c.id));
    toast("Convite revogado.", { description: `O link de ${c.nome ?? c.email ?? "convidado"} não abre mais.` });
  };

  const desativar = (m: MembroEnsaio) => {
    setMembros((xs) => xs.map((x) => (x.id === m.id ? { ...x, ativo: !x.ativo } : x)));
    toast(m.ativo ? "Acesso desativado." : "Acesso reativado.", { description: m.nome });
  };

  return (
    <CascaConfig
      largo
      titulo="Membros"
      descricao="Quem entra no sistema, o que cada pessoa pode fazer e de qual departamento ela cuida. O convite é um link — a pessoa abre, escolhe a senha e já entra no lugar certo."
      acao={
        podeGerir ? (
          <Button onClick={() => setConvidando(true)}>
            <PlusIcon data-icon="inline-start" />
            Convidar
          </Button>
        ) : null
      }
    >
      <div className="flex items-center justify-between gap-4">
        <label className="relative block w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-8"
            aria-label="Buscar membro"
          />
        </label>
        <Contagem>
          {membros.filter((m) => m.ativo).length} com acesso
          {pendentes.length > 0 ? ` · ${pendentes.length} ${pendentes.length === 1 ? "convite pendente" : "convites pendentes"}` : ""}
        </Contagem>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table className="table-fixed">
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <TableHeader>
            <TableRow className="[&>th]:text-[12.5px]">
              <TableHead>Pessoa</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Departamentos</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {membrosVisiveis.length === 0 ? (
              <TableEmpty colSpan={5}>{termo ? "Ninguém com esse nome ou e-mail." : "Nenhum membro ainda."}</TableEmpty>
            ) : (
              membrosVisiveis.map((m) => (
                <TableRow
                  key={m.id}
                  className={cn("cursor-pointer [&>td]:py-3.5", !m.ativo && "opacity-60")}
                  onClick={() => setAbertoId(m.id)}
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAbertoId(m.id)}
                  aria-label={`Abrir perfil de ${m.nome}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar size="lg" variant={m.id === meuId ? "solid" : "subtle"}>
                        <AvatarFallback>{iniciaisMembro(m.nome, m.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15.5px] font-semibold leading-tight text-foreground">{m.nome}</span>
                          {m.id === meuId && <span className="text-ui-12 text-muted-foreground">(você)</span>}
                          {!m.ativo && <Badge variant="muted" size="sm">sem acesso</Badge>}
                        </div>
                        <div className="mt-0.5 truncate text-[13.5px] text-muted-foreground">{m.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[14.5px] text-foreground">{rotuloPapel(m.papel)}</span>
                    {m.funcao && <div className="truncate text-[12.5px] text-muted-foreground">{m.funcao}</div>}
                  </TableCell>
                  <TableCell>
                    <Vinculos vinculos={m.departamentos} rotuloDep={rotuloDep} papel={m.papel} />
                  </TableCell>
                  <TableCell className="text-[14px] text-muted-foreground">{haQuantoTempo(m.ultimo_acesso_em, agora)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {podeGerir && m.id !== meuId && m.papel !== "owner" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${m.nome}`} />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => toast("Em breve: editar papel e departamentos.")}>Editar papel e departamentos</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => desativar(m)}>
                            {m.ativo ? "Desativar acesso" : "Reativar acesso"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pendentes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-ui-13 font-semibold text-foreground">Convites pendentes</h2>
            <span className="text-ui-12 text-muted-foreground">O link vale 7 dias. Quem abrir escolhe a senha.</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-dashed border-border bg-card/60">
            <Table className="table-fixed">
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <TableBody>
                {pendentes.map((c) => {
                  const ex = expiraEm(c.expira_em, agora);
                  return (
                    <TableRow key={c.id} className="[&>td]:py-3.5">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar size="lg" variant="muted">
                            <AvatarFallback>{c.nome ? iniciaisMembro(c.nome, c.email ?? "x@x") : <LinkIcon className="size-3.5" />}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-semibold text-foreground">{c.nome ?? "Convite por link"}</div>
                            <div className="mt-0.5 truncate text-[13.5px] text-muted-foreground">{c.email ?? "sem e-mail — só o link"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[14.5px] text-foreground">{rotuloPapel(c.papel)}</TableCell>
                      <TableCell>
                        <Vinculos vinculos={c.departamentos} rotuloDep={rotuloDep} papel={c.papel} />
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-[14px]", ex.urgente ? "font-medium text-warning-ink" : "text-muted-foreground")}>{ex.texto}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Copiar link do convite" onClick={() => void copiarLink(c)}>
                            <CopyIcon />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Mais ações do convite" />}>
                              <MoreHorizontalIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => void copiarLink(c)}>
                                <CopyIcon /> Copiar link
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => reenviar(c)}>
                                <RefreshCwIcon /> Gerar link novo (+7 dias)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => revogar(c)}>
                                <XIcon /> Revogar convite
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <SheetMembro
        membro={membros.find((m) => m.id === abertoId) ?? null}
        eu={meuId}
        gestao={podeGerir}
        departamentos={departamentos}
        canais={canais}
        agora={agora}
        onFechar={() => setAbertoId(null)}
        onDesativar={(m) => desativar(m)}
      />

      <DialogoConvite
        aberto={convidando}
        aoFechar={() => setConvidando(false)}
        departamentos={departamentos}
        agora={agora}
        aoGerar={(c) => {
          setConvites((xs) => [...xs, c]);
        }}
        criadoPor={meuId}
      />
    </CascaConfig>
  );
}

function Vinculos({
  vinculos,
  rotuloDep,
  papel,
}: {
  vinculos: VinculoDepartamento[];
  rotuloDep: (chave: string) => string;
  papel: string;
}) {
  if (vinculos.length === 0) {
    return (
      <span className="text-[13.5px] text-muted-foreground">
        {papel === "owner" || papel === "admin" ? "todos" : papel === "marketing" ? "captação" : "—"}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {vinculos.map((v) => (
        <span key={v.departamento} className="inline-flex items-center gap-1">
          <Badge variant="outline" size="sm" className="bg-card text-[12px]">
            {rotuloDep(v.departamento)}
          </Badge>
          {v.papel_no_departamento === "gestor" && (
            <Badge variant="info" size="sm" className="text-[12px]">
              gestora
            </Badge>
          )}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────── convite ───────────────────────────────

function DialogoConvite({
  aberto,
  aoFechar,
  departamentos,
  agora,
  aoGerar,
  criadoPor,
}: {
  aberto: boolean;
  aoFechar: () => void;
  departamentos: Departamento[];
  agora: Date;
  aoGerar: (c: ConviteEnsaio) => void;
  criadoPor: string;
}) {
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"membro" | "admin" | "marketing">("membro");
  const [vinculos, setVinculos] = useState<Record<string, PapelNoDepartamento | undefined>>({});
  const [gerado, setGerado] = useState<ConviteEnsaio | null>(null);
  const [copiado, setCopiado] = useState(false);

  const folhas = departamentos.filter((d) => d.ativo && !departamentos.some((x) => x.pai === d.chave));
  const escolhidos = Object.entries(vinculos).filter(([, p]) => p).map(([d, p]) => ({ departamento: d, papel_no_departamento: p! }));
  const precisaDepartamento = papel === "membro";
  const podeGerar = !precisaDepartamento || escolhidos.length > 0;

  const fechar = () => {
    aoFechar();
    setTimeout(() => {
      setNome("");
      setPapel("membro");
      setVinculos({});
      setGerado(null);
      setCopiado(false);
    }, 200);
  };

  const gerar = () => {
    const c: ConviteEnsaio = {
      id: `c0000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
      nome: nome.trim() || null,
      email: null,
      papel,
      departamentos: papel === "marketing" ? [] : escolhidos,
      criado_em: agora.toISOString(),
      expira_em: new Date(agora.getTime() + 7 * 86_400_000).toISOString(),
      status: "pendente",
      token: `cnv_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`,
      criado_por: criadoPor,
    };
    setGerado(c);
    aoGerar(c);
  };

  const link = gerado ? `${typeof window !== "undefined" ? window.location.origin : ""}/convite/aceitar?token=${gerado.token}` : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* o campo abaixo continua selecionável */
    }
  };

  const resumo = (() => {
    const p = PAPEIS_CONVITE.find((x) => x.valor === papel)!.rotulo.toLowerCase();
    if (papel === "marketing") return `entra como ${p}`;
    if (escolhidos.length === 0) return `entra como ${p}`;
    const partes = escolhidos.map((e) => {
      const r = departamentos.find((d) => d.chave === e.departamento)?.rotulo ?? e.departamento;
      return e.papel_no_departamento === "gestor" ? `gestora de ${r}` : `membro de ${r}`;
    });
    return `entra como ${p} · ${partes.join(", ")}`;
  })();

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-[520px]">
        {!gerado ? (
          <>
            <DialogHeader>
              <DialogTitle>Convidar alguém</DialogTitle>
              <DialogDescription>
                Você gera um link e manda pelo WhatsApp da pessoa. Ela abre, escolhe a senha e já entra no departamento certo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <FormItemLayout label="Nome" htmlFor="convite-nome" description="Opcional — só para você lembrar para quem mandou.">
                <Input id="convite-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Priscila Martins" autoFocus />
              </FormItemLayout>

              <FormItemLayout label="Papel" required htmlFor="convite-papel">
                <Select value={papel} onValueChange={(v) => setPapel(v as typeof papel)}>
                  <SelectTrigger id="convite-papel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPEIS_CONVITE.map((p) => (
                      <SelectItem key={p.valor} value={p.valor}>
                        {p.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-ui-12 text-muted-foreground">{PAPEIS_CONVITE.find((p) => p.valor === papel)!.descricao}</p>
              </FormItemLayout>

              {papel !== "marketing" && (
                <FormItemLayout
                  label="Departamentos"
                  required={precisaDepartamento}
                  description={
                    papel === "admin"
                      ? "Admin vê tudo. Marque um departamento só se ela também for a gestora dele."
                      : "Ela vê os leads e conversas destes departamentos. Gestora recebe as tarefas do Jarvis que não têm dono."
                  }
                >
                  <div className="overflow-hidden rounded-lg border border-border">
                    {folhas.map((d, i) => {
                      const marcado = !!vinculos[d.chave];
                      return (
                        <div
                          key={d.chave}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2",
                            i > 0 && "border-t border-border",
                            marcado && "bg-primary/[0.04]",
                          )}
                        >
                          <Checkbox
                            id={`dep-${d.chave}`}
                            checked={marcado}
                            onCheckedChange={(v) => setVinculos((s) => ({ ...s, [d.chave]: v ? "membro" : undefined }))}
                          />
                          <label htmlFor={`dep-${d.chave}`} className="flex-1 cursor-pointer text-ui-13 text-foreground">
                            {d.rotulo}
                            {d.entrada && <span className="ml-1.5 text-ui-11 text-muted-foreground">entrada dos leads</span>}
                          </label>
                          <div
                            role="radiogroup"
                            aria-label={`Papel em ${d.rotulo}`}
                            className={cn("inline-flex rounded-md border border-border p-0.5 text-ui-11", !marcado && "invisible")}
                          >
                            {(["membro", "gestor"] as const).map((p) => (
                              <button
                                key={p}
                                type="button"
                                role="radio"
                                aria-checked={vinculos[d.chave] === p}
                                onClick={() => setVinculos((s) => ({ ...s, [d.chave]: p }))}
                                className={cn(
                                  "rounded-[5px] px-2 py-0.5 transition-colors",
                                  vinculos[d.chave] === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                                )}
                              >
                                {p === "gestor" ? "gestora" : "membro"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </FormItemLayout>
              )}
            </div>
            <DialogFooter className="items-center sm:justify-between">
              <span className="text-ui-12 text-muted-foreground">{resumo}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fechar}>
                  Cancelar
                </Button>
                <Button onClick={gerar} disabled={!podeGerar}>
                  <LinkIcon data-icon="inline-start" />
                  Gerar link
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Link pronto</DialogTitle>
              <DialogDescription>
                {gerado.nome ? `${gerado.nome} ` : "Quem abrir "}
                {resumo}. Mande pelo WhatsApp — vale por 7 dias e abre uma vez.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2 pl-3">
              <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent font-mono text-ui-12 text-foreground outline-none"
                aria-label="Link do convite"
              />
              <Button size="sm" onClick={() => void copiar()} variant={copiado ? "success" : "default"}>
                {copiado ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fechar}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

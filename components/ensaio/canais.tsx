"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { InfoIcon, MoreHorizontalIcon, PlusIcon, SmartphoneIcon, ShieldCheckIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { cn } from "@/lib/utils";
import type { Departamento } from "@/lib/departamentos/escopo";
import type { PessoaEnsaio } from "@/lib/ensaio/modo";
import { formatarE164, type CanalEnsaio, type NivelCanal } from "@/lib/ensaio/fixtures/canais";
import type { MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import { CascaConfig, Contagem } from "./casca-config";

/**
 * /configuracoes/canais (ensaio) — os números de WhatsApp da empresa, um por linha.
 *
 * A tabela responde as quatro perguntas do contrato D91 §1 sobre um número: de QUAL departamento
 * ele é (R1), QUEM é a dona (R1), QUEM pode responder por ele (nível, 0323) e se está NO AR
 * (ativo + pareado). O Switch de ligar/desligar fica na linha porque é a ação mais frequente e
 * a única que a dona de um Lite pode fazer sozinha (R1 estendida: `canal_ativado` para membro no
 * próprio `lite:%`).
 *
 * Membro vê SÓ o próprio número (policies `canal_whatsapp_sel_responsavel` + `_departamento`);
 * admin/owner veem todos. O botão "Conectar meu número" leva ao fluxo de QR (R6).
 *
 * Referência: LiderHub `connected-channels-table.tsx` (colunas, menu ⋯, AlertDialog de
 * desconectar) e `manage-channel-sheet.tsx` (Switch + Select por seção).
 */

const NIVEIS: Record<NivelCanal, { rotulo: string; descricao: string }> = {
  estrito: { rotulo: "Estrito", descricao: "Só a dona responde por este número." },
  responde_qualquer_um: { rotulo: "Do departamento", descricao: "Qualquer pessoa do departamento responde; a dona continua sendo a dona." },
  aberto: { rotulo: "Aberto", descricao: "Qualquer pessoa com acesso à conversa responde." },
};

export function CanaisEnsaio({
  eu,
  canais: canaisIniciais,
  membros,
  departamentos,
  agoraIso,
}: {
  eu: PessoaEnsaio;
  canais: CanalEnsaio[];
  membros: MembroEnsaio[];
  departamentos: Departamento[];
  agoraIso: string;
}) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [canais, setCanais] = useState(canaisIniciais);
  const gestao = eu.papel === "owner" || eu.papel === "admin";

  const rotuloDep = (chave: string) => departamentos.find((d) => d.chave === chave)?.rotulo ?? chave;
  const dona = (id: string | null) => (id ? membros.find((m) => m.id === id) ?? null : null);
  const podeMexer = (c: CanalEnsaio) => gestao || c.responsavel_id === eu.id;
  const meu = canais.find((c) => c.responsavel_id === eu.id) ?? null;

  const ligar = (c: CanalEnsaio, ativo: boolean) => {
    setCanais((xs) => xs.map((x) => (x.canal_id === c.canal_id ? { ...x, ativo } : x)));
    toast(ativo ? "Número ligado." : "Número desligado.", {
      description: ativo
        ? `${c.apelido} volta a receber e enviar mensagens.`
        : `${c.apelido} para de receber. As conversas ficam guardadas.`,
    });
  };

  const mudarNivel = (c: CanalEnsaio, nivel: NivelCanal) => {
    setCanais((xs) => xs.map((x) => (x.canal_id === c.canal_id ? { ...x, nivel } : x)));
    toast.success(`Nível alterado para ${NIVEIS[nivel].rotulo.toLowerCase()}.`, { description: c.apelido });
  };

  return (
    <CascaConfig
      largo
      titulo="Números de WhatsApp"
      descricao={
        gestao
          ? "Por quais números a empresa fala. Cada número pertence a um departamento e tem uma dona; o nível diz quem pode responder por ele."
          : "O número pelo qual você atende. Você pode ligar, desligar e reconectar; o departamento e o nível são da gestão."
      }
      acao={
        gestao ? (
          <>
            <Button variant="outline" onClick={() => toast("Em breve: conectar número oficial (WABA).")}>
              Número oficial
            </Button>
            <Button render={<Link href="/configuracoes/canais/meu-numero" />}>
              <PlusIcon data-icon="inline-start" />
              Conectar meu número
            </Button>
          </>
        ) : !meu ? (
          <Button render={<Link href="/configuracoes/canais/meu-numero" />}>
            <SmartphoneIcon data-icon="inline-start" />
            Conectar meu número
          </Button>
        ) : null
      }
    >
      <div className="flex items-center justify-between">
        <Contagem>
          {canais.filter((c) => c.ativo).length} de {canais.length} no ar
        </Contagem>
        <span className="text-ui-12 text-muted-foreground">Últimos 7 dias</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table className="table-fixed">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Provedor</TableHead>
              <TableHead>Departamento · dona</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Quem responde
                  <HintTooltip
                    title="Nível do número"
                    content="Estrito: só a dona. Do departamento: qualquer pessoa lotada nele. Aberto: qualquer pessoa com a conversa."
                  >
                    <InfoIcon className="size-3.5 text-muted-foreground" />
                  </HintTooltip>
                </span>
              </TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ligado</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {canais.map((c) => {
              const d = dona(c.responsavel_id);
              const pareado = c.provedor === "waba" || c.pareamento === "pareado";
              const noAr = c.ativo && pareado;
              return (
                <TableRow key={c.canal_id} className={cn(!c.ativo && "opacity-70")}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full",
                          c.provedor === "waba" ? "bg-success-tint text-success-ink" : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {c.provedor === "waba" ? <ShieldCheckIcon className="size-4" /> : <SmartphoneIcon className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-ui-13 font-medium text-foreground">{c.apelido}</span>
                          {c.finalidade === "producao" && c.provedor === "waba" && (
                            <Badge variant="success" size="xs">
                              produção
                            </Badge>
                          )}
                          {c.responsavel_id === eu.id && <Badge variant="info" size="xs">seu</Badge>}
                        </div>
                        <div className="font-mono text-ui-12 tabular-nums text-muted-foreground">{formatarE164(c.numero_e164)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-ui-13 text-foreground">{c.provedor === "waba" ? "Oficial" : "Lite"}</span>
                    <div className="text-ui-11 text-muted-foreground">{c.provedor === "waba" ? "Cloud API da Meta" : "celular pareado"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" size="xs" className="bg-card">
                      {rotuloDep(c.departamento)}
                    </Badge>
                    <div className="mt-1 flex items-center gap-1.5">
                      {d ? (
                        <>
                          <Avatar size="xs" variant="muted">
                            <AvatarFallback>{d.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}</AvatarFallback>
                          </Avatar>
                          <span className="truncate text-ui-12 text-muted-foreground">{d.nome}</span>
                        </>
                      ) : (
                        <span className="text-ui-12 text-muted-foreground">da empresa</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {gestao ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<button className="rounded-md border border-border px-2 py-1 text-ui-12 text-foreground hover:bg-muted" />}
                        >
                          {NIVEIS[c.nivel].rotulo}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          {(Object.keys(NIVEIS) as NivelCanal[]).map((n) => (
                            <DropdownMenuItem key={n} onClick={() => mudarNivel(c, n)} className="flex-col items-start gap-0.5 py-1.5">
                              <span className={cn("text-ui-13", c.nivel === n && "font-semibold")}>{NIVEIS[n].rotulo}</span>
                              <span className="text-ui-11 text-muted-foreground">{NIVEIS[n].descricao}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-ui-13 text-foreground">{NIVEIS[c.nivel].rotulo}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          noAr ? "bg-success-ink" : !pareado ? "bg-warning" : "bg-muted-foreground/50",
                        )}
                        aria-hidden
                      />
                      <span className="text-ui-13 text-foreground">
                        {noAr ? "no ar" : !pareado ? (c.pareamento === "expirado" ? "pareamento venceu" : "não pareado") : "desligado"}
                      </span>
                    </div>
                    <div className="text-ui-11 tabular-nums text-muted-foreground">
                      {c.conversas_7d} conversas · última {haQuantoTempo(c.ultima_mensagem_em, agora)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      size="sm"
                      checked={c.ativo}
                      disabled={!podeMexer(c) || !pareado}
                      onCheckedChange={(v) => ligar(c, !!v)}
                      aria-label={`${c.ativo ? "Desligar" : "Ligar"} ${c.apelido}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {podeMexer(c) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${c.apelido}`} />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {c.provedor === "nao_oficial" && (
                            <DropdownMenuItem render={<Link href="/configuracoes/canais/meu-numero?reconectar=1" />}>Reconectar (novo QR)</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => toast("Em breve: renomear o número.")}>Renomear</DropdownMenuItem>
                          {gestao && <DropdownMenuItem onClick={() => toast("Em breve: trocar departamento.")}>Trocar departamento</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => toast("Em breve: desparear o número.")}>
                            {c.provedor === "waba" ? "Remover número" : "Desparear celular"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-ui-12 leading-relaxed text-muted-foreground">
        A resposta sai sempre pelo número que recebeu a mensagem. Para falar com a mesma pessoa por
        outro número, o composer abre uma conversa nova naquele número — os fios não se misturam.
      </p>
    </CascaConfig>
  );
}

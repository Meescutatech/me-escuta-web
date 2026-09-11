"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, EyeIcon, PencilLineIcon, UnplugIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { PessoaEnsaio } from "@/lib/ensaio/modo";
import { ENDERECO_MCP, type ConexaoMcp, type EscopoMcp } from "@/lib/ensaio/fixtures/claude";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/claude (ensaio) — o FLUXO INTEIRO de conectar o Claude à Me Escuta, pensado de
 * ponta a ponta (Diogo, 22:00): entrar → ver o que VOCÊ vai poder fazer (depende do cargo) →
 * "Conectar" → tela de consentimento nossa (`/oauth/autorizar`) → volta conectada, com as
 * ferramentas listadas e o botão de desconectar. Desfazer é um clique, e a lista de quem está
 * conectado (gestão) mostra o alcance do que foi aberto.
 *
 * Por que a página fala de CARGO antes de falar de tecnologia: quem conecta precisa saber o que
 * está abrindo. "Sara · gestora de Pré-venda: conversas, leads e tarefas de Pré-venda" é uma
 * frase que ela consegue julgar; "12 tools via SSE" não é.
 */

export function ClaudeMcpEnsaio({
  eu,
  escopo,
  conexoes: iniciais,
  gestao,
  conectadoAgora,
  agoraIso,
}: {
  eu: PessoaEnsaio;
  escopo: EscopoMcp;
  conexoes: ConexaoMcp[];
  gestao: boolean;
  /** veio de `/oauth/autorizar` com "Autorizar" — a tela nasce no estado conectado. */
  conectadoAgora: boolean;
  agoraIso: string;
}) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [conexoes, setConexoes] = useState<ConexaoMcp[]>(() =>
    conectadoAgora && !iniciais.some((c) => c.usuario_id === eu.id)
      ? [{ usuario_id: eu.id, nome: eu.nome, cliente: "Claude Desktop", conectado_em: agoraIso, ultimo_uso_em: null, chamadas_7d: 0 }, ...iniciais]
      : iniciais,
  );
  const minha = conexoes.find((c) => c.usuario_id === eu.id) ?? null;
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(ENDERECO_MCP);
      setCopiado(true);
      toast.success("Endereço copiado.", { description: "Cole em Claude › Configurações › Conectores › Adicionar." });
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast(ENDERECO_MCP);
    }
  };

  const desconectar = (c: ConexaoMcp) => {
    setConexoes((xs) => xs.filter((x) => x.usuario_id !== c.usuario_id));
    toast(c.usuario_id === eu.id ? "Claude desconectado." : `Acesso de ${c.nome.split(" ")[0]} revogado.`, {
      description: "O token deixa de valer agora; o Claude pede para conectar de novo na próxima vez.",
    });
  };

  return (
    <CascaConfig
      largo
      titulo="Claude (MCP)"
      descricao="Conecte o Claude à Me Escuta com o seu login. Ele passa a ler e agir aqui como você — com exatamente o que o seu cargo permite, nem mais nem menos."
    >
      {/* ── O MEU ACESSO ── */}
      <section className={cn("rounded-xl border bg-card p-6", minha ? "border-success-line" : "border-border")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[560px]">
            <div className="flex items-center gap-2">
              <h2 className="text-h3 font-semibold text-foreground">{minha ? "Você está conectada" : "Adicionar ao Claude"}</h2>
              {minha && (
                <Badge variant="success" size="xs">
                  <CheckIcon className="size-3" /> conectado
                </Badge>
              )}
            </div>
            <p className="mt-1 text-ui-13 text-muted-foreground">
              Como <span className="font-medium text-foreground">{eu.nome}</span> · {escopo.titulo}
            </p>
            <p className="mt-3 text-ui-13 leading-relaxed text-foreground">{escopo.frase}</p>
          </div>
          {!minha ? (
            <Button size="lg" onClick={() => router.push(`/oauth/autorizar?client=claude&volta=${encodeURIComponent("/configuracoes/claude")}`)}>
              Conectar ao Claude
            </Button>
          ) : (
            <Button variant="outline" onClick={() => desconectar(minha)}>
              <UnplugIcon data-icon="inline-start" />
              Desconectar
            </Button>
          )}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {escopo.ferramentas.map((f) => (
            <div key={f.chave} className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5">
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", f.tipo === "ler" ? "bg-muted text-muted-foreground" : "bg-navy/10 text-navy")}>
                {f.tipo === "ler" ? <EyeIcon className="size-3" /> : <PencilLineIcon className="size-3" />}
              </span>
              <span className="min-w-0">
                <span className="block text-ui-13 font-medium text-foreground">{f.rotulo}</span>
                <span className="block text-ui-12 text-muted-foreground">{f.descricao}</span>
              </span>
            </div>
          ))}
        </div>

        {minha && (
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
            <div className="text-ui-12 text-muted-foreground">
              Conectado {haQuantoTempo(minha.conectado_em, agora)} pelo {minha.cliente} · {minha.ultimo_uso_em ? `último uso ${haQuantoTempo(minha.ultimo_uso_em, agora)}` : "ainda sem uso"} ·{" "}
              {minha.chamadas_7d} chamadas em 7 dias
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 pl-3">
              <span className="text-ui-12 text-muted-foreground">Endereço do conector</span>
              <code className="min-w-0 flex-1 truncate font-mono text-ui-12 text-foreground">{ENDERECO_MCP}</code>
              <Button size="sm" variant={copiado ? "success" : "outline"} onClick={() => void copiar()}>
                {copiado ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <ol className="grid gap-1.5 text-ui-12 text-muted-foreground sm:grid-cols-3">
              <li className="rounded-md bg-background px-3 py-2"><span className="font-medium text-foreground">1.</span> Abra o Claude › Configurações › Conectores.</li>
              <li className="rounded-md bg-background px-3 py-2"><span className="font-medium text-foreground">2.</span> Adicionar conector e cole o endereço.</li>
              <li className="rounded-md bg-background px-3 py-2"><span className="font-medium text-foreground">3.</span> Entre com o seu login da Me Escuta quando ele pedir.</li>
            </ol>
          </div>
        )}
      </section>

      {/* ── QUEM ESTÁ CONECTADO (gestão) ── */}
      {gestao && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-ui-13 font-semibold text-foreground">Quem está conectado</h2>
            <span className="text-ui-12 text-muted-foreground">Cada pessoa vê pelo Claude só o que vê na tela. Revogar derruba na hora.</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {conexoes.length === 0 ? (
              <p className="px-4 py-6 text-center text-ui-13 text-muted-foreground">Ninguém conectou ainda.</p>
            ) : (
              conexoes.map((c, i) => (
                <div key={c.usuario_id} className={cn("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border")}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-ui-11 font-semibold text-muted-foreground">
                    {c.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui-13 font-medium text-foreground">
                      {c.nome} {c.usuario_id === eu.id && <span className="text-muted-foreground">(você)</span>}
                    </span>
                    <span className="block text-ui-12 text-muted-foreground">
                      {c.cliente} · conectado {haQuantoTempo(c.conectado_em, agora)} · {c.ultimo_uso_em ? `usou ${haQuantoTempo(c.ultimo_uso_em, agora)}` : "sem uso"} · {c.chamadas_7d} chamadas/7d
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => desconectar(c)}>
                    Revogar
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <p className="text-ui-12 leading-relaxed text-muted-foreground">
        O Claude nunca recebe senha nem token da empresa: cada pessoa autoriza com o próprio login e o acesso pode ser revogado por ela ou pela gestão.
        {" "}
        <Link href="/configuracoes/membros" className="underline underline-offset-2 hover:text-foreground">
          O que cada cargo pode
        </Link>{" "}
        é o mesmo da tela.
      </p>
    </CascaConfig>
  );
}

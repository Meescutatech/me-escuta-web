"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon, PaperclipIcon, ArrowUpRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import type { RelatoSuporte } from "@/lib/ensaio/fixtures/operacao";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/suporte (ensaio) — os RELATOS que a equipe abriu pelo "!" do header, com a tela
 * de onde vieram. Lista à esquerda (abertos primeiro), fio à direita: quem relatou, o que
 * escreveu, o que quem constrói respondeu, e o botão de resolver. É o canal entre quem usa e
 * quem constrói — por isso "Suporte" não é ajuste de workspace, mas vive aqui para a gestão
 * enxergar o que está travando a operação.
 */
export function SuporteEnsaio({ relatos: iniciais, gestao, eu, agoraIso }: { relatos: RelatoSuporte[]; gestao: boolean; eu: string; agoraIso: string }) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [relatos, setRelatos] = useState(iniciais);
  const [filtro, setFiltro] = useState<"abertos" | "todos">("abertos");
  const [abertoId, setAbertoId] = useState<string | null>(iniciais.find((r) => r.status === "aberto")?.id ?? iniciais[0]?.id ?? null);
  const [texto, setTexto] = useState("");

  const visiveis = relatos.filter((r) => filtro === "todos" || r.status === "aberto").sort((a, b) => (a.status === b.status ? b.criado_em.localeCompare(a.criado_em) : a.status === "aberto" ? -1 : 1));
  const aberto = relatos.find((r) => r.id === abertoId) ?? null;
  const abertos = relatos.filter((r) => r.status === "aberto").length;

  const comentar = () => {
    if (!aberto || !texto.trim()) return;
    setRelatos((xs) => xs.map((r) => (r.id === aberto.id ? { ...r, comentarios: [...r.comentarios, { autor: eu, texto: texto.trim(), em: agora.toISOString(), construtor: gestao }] } : r)));
    setTexto("");
    toast.success("Comentário enviado.");
  };
  const resolver = () => {
    if (!aberto) return;
    setRelatos((xs) => xs.map((r) => (r.id === aberto.id ? { ...r, status: "resolvido", resolvido_em: agora.toISOString() } : r)));
    toast.success(`Relato #${aberto.numero} resolvido.`, { description: "Quem abriu recebe o aviso no sino." });
  };
  const reabrir = () => {
    if (!aberto) return;
    setRelatos((xs) => xs.map((r) => (r.id === aberto.id ? { ...r, status: "aberto", resolvido_em: null } : r)));
    toast(`Relato #${aberto.numero} reaberto.`);
  };

  return (
    <CascaConfig
      largo
      titulo="Suporte"
      descricao="O que a equipe relatou pelo botão de relato do topo, com a tela de onde veio. Quem constrói responde aqui; quem relatou recebe o aviso no sino."
      acao={
        <div role="radiogroup" aria-label="Filtrar relatos" className="inline-flex rounded-md border border-border p-0.5 text-[12.5px]">
          {(
            [
              ["abertos", `Abertos · ${abertos}`],
              ["todos", "Todos"],
            ] as Array<["abertos" | "todos", string]>
          ).map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={filtro === v} onClick={() => setFiltro(v)} className={cn("rounded-[5px] px-2.5 py-1", filtro === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {r}
            </button>
          ))}
        </div>
      }
    >
      {relatos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">Nenhum relato ainda</p>
          <p className="mx-auto mt-1.5 max-w-[420px] text-ui-13 leading-relaxed text-muted-foreground">Quando alguém da equipe tocar no "!" do topo e descrever o que travou, aparece aqui com a tela de onde veio.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[340px_1fr]">
          <ol className="flex flex-col gap-1.5">
            {visiveis.length === 0 && (
              <li className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-ui-13 text-muted-foreground">Nada aberto — tudo resolvido.</li>
            )}
            {visiveis.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setAbertoId(r.id)}
                  aria-current={abertoId === r.id}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    abertoId === r.id ? "border-input bg-card" : "border-transparent hover:bg-card/70",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground">#{r.numero}</span>
                    <Badge variant={r.status === "aberto" ? "warning" : "success"} size="xs">
                      {r.status}
                    </Badge>
                    <span className="ml-auto text-ui-11 text-muted-foreground">{haQuantoTempo(r.criado_em, agora)}</span>
                  </span>
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug text-foreground">{r.titulo}</span>
                  <span className="text-ui-12 text-muted-foreground">
                    {r.autor.split(" ")[0]} · <span className="font-mono">{r.rota}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {aberto ? (
            <article className="flex flex-col rounded-xl border border-border bg-card">
              <header className="flex items-start gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground">#{aberto.numero}</span>
                    <Badge variant={aberto.status === "aberto" ? "warning" : "success"} size="xs">
                      {aberto.status}
                    </Badge>
                  </div>
                  <h2 className="mt-1 text-[16px] font-semibold leading-snug text-foreground">{aberto.titulo}</h2>
                  <p className="mt-1 text-ui-12 text-muted-foreground">
                    {aberto.autor} · {haQuantoTempo(aberto.criado_em, agora)} · na tela{" "}
                    <Link href={aberto.rota} className="inline-flex items-center gap-0.5 font-mono text-foreground underline-offset-2 hover:underline">
                      {aberto.rota} <ArrowUpRightIcon className="size-3" />
                    </Link>
                    {aberto.resolvido_em && ` · resolvido ${haQuantoTempo(aberto.resolvido_em, agora)}`}
                  </p>
                </div>
                {gestao &&
                  (aberto.status === "aberto" ? (
                    <Button size="sm" onClick={resolver}>
                      <CheckIcon data-icon="inline-start" />
                      Resolver
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={reabrir}>
                      Reabrir
                    </Button>
                  ))}
              </header>
              <ol className="flex flex-col gap-4 px-5 py-4">
                {aberto.comentarios.map((c, i) => (
                  <li key={i} className={cn("flex flex-col gap-1", c.construtor && "items-end")}>
                    <span className="text-ui-11 text-muted-foreground">
                      {c.autor}
                      {c.construtor && " · constrói"} · {haQuantoTempo(c.em, agora)}
                    </span>
                    <p className={cn("max-w-[80%] rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed", c.construtor ? "bg-[#EAECF5] text-foreground" : "border border-border bg-background text-foreground")}>{c.texto}</p>
                  </li>
                ))}
                {aberto.anexo && (
                  <li className="text-ui-12 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
                      <PaperclipIcon className="size-3.5" /> {aberto.anexo}
                    </span>
                  </li>
                )}
              </ol>
              <footer className="border-t border-border p-4">
                <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={aberto.status === "aberto" ? "Responder…" : "Comentar (o relato está resolvido)…"} aria-label="Comentário" />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" disabled={!texto.trim()} onClick={comentar}>
                    Enviar
                  </Button>
                </div>
              </footer>
            </article>
          ) : (
            <div className="grid place-items-center rounded-xl border border-dashed border-border text-ui-13 text-muted-foreground">Escolha um relato à esquerda.</div>
          )}
        </div>
      )}
    </CascaConfig>
  );
}

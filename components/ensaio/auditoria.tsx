"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRightIcon, HistoryIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import type { ConfigPublicada } from "@/lib/ensaio/fixtures/operacao";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/auditoria (ensaio) — TODA configuração publicada, com quem publicou, quando, a
 * versão e o que mudou. É o que "Avançado" era, sem o balde: aqui não se edita nada — cada linha
 * leva para a tela que edita aquela config, e "voltar para a versão anterior" é a única ação.
 * Constituição §1.4: configuração é dado, e dado tem história.
 */
export function AuditoriaEnsaio({ configs, gestao, agoraIso }: { configs: ConfigPublicada[]; gestao: boolean; agoraIso: string }) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const visiveis = configs.filter((c) => !termo || c.rotulo.toLowerCase().includes(termo) || c.nome.includes(termo) || c.por.toLowerCase().includes(termo));

  return (
    <CascaConfig
      largo
      titulo="Auditoria e histórico"
      descricao="Toda configuração publicada — quem, quando, versão e o que mudou. Nada se edita aqui: cada linha leva para a tela que cuida daquela configuração."
    >
      <div className="flex items-center justify-between gap-4">
        <label className="relative block w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por configuração ou pessoa" className="pl-8" aria-label="Buscar configuração" />
        </label>
        <span className="text-ui-12 tabular-nums text-muted-foreground">{configs.length} configurações publicadas</span>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-foreground">Nenhuma configuração com esse nome</p>
          <p className="mt-1 text-ui-13 text-muted-foreground">Tente o nome da tela (funil, prazo, prompt) ou de quem publicou.</p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {visiveis.map((c, i) => (
            <li key={c.nome} className={cn("grid grid-cols-[1fr_120px_200px_auto] items-center gap-4 px-4 py-3.5", i > 0 && "border-t border-border")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={c.href} className="inline-flex items-center gap-1 text-[15px] font-semibold text-foreground underline-offset-2 hover:underline">
                    {c.rotulo} <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
                  </Link>
                  <span className="font-mono text-[12px] text-muted-foreground">{c.nome}</span>
                </div>
                <div className="mt-0.5 text-[13.5px] text-muted-foreground">
                  <span className="text-foreground">v{c.versao}:</span> {c.o_que_mudou}
                </div>
              </div>
              <div className="text-ui-12 text-muted-foreground">{c.secao}</div>
              <div className="text-[13.5px] text-muted-foreground">
                {c.por.split(" ")[0]} · {haQuantoTempo(c.publicado_em, agora)}
              </div>
              <div className="flex justify-end">
                {gestao && c.versao > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => toast(`Voltar ${c.rotulo} para a v${c.versao - 1}?`, { description: "Em breve: publica a versão anterior como v" + (c.versao + 1) + ", com o diff invertido." })}>
                    <HistoryIcon data-icon="inline-start" />
                    v{c.versao - 1}
                  </Button>
                ) : (
                  <span className="text-ui-11 text-muted-foreground">primeira versão</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-ui-12 leading-relaxed text-muted-foreground">
        Voltar uma versão não apaga nada: publica a anterior como versão nova, e a história continua inteira. É o ledger valendo para configuração.
      </p>
    </CascaConfig>
  );
}

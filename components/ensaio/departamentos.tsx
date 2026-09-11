"use client";

import { useMemo, useState } from "react";
import { PlusIcon, CornerDownRightIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { iniciaisMembro } from "@/lib/membros";
import type { Departamento } from "@/lib/departamentos/escopo";
import type { MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { CascaConfig, Contagem } from "./casca-config";

/**
 * /configuracoes/departamentos (ensaio) — a ÁRVORE de departamentos, com quem está lotado em cada
 * um, quem é gestora e quais números pertencem a ele. É a tela que responde "para quem o Jarvis
 * manda a tarefa sem dono?" (R7: gestora do departamento de entrada) e "quem vê o quê?" (R4).
 *
 * Desenho: uma linha por departamento, indentada pela hierarquia (filho logo abaixo do pai,
 * com a seta de canto), e três colunas de fato — pessoas (avatares), gestora (badge) e números.
 * "Entrada dos leads" é o único marcador de destaque: é o departamento em que todo lead nasce.
 *
 * Referência: LiderHub `teams-settings.tsx` + `team-form-fields.tsx` (time = departamento com
 * canais e membros), reduzido ao que a nossa árvore precisa.
 */
export function DepartamentosEnsaio({
  departamentos,
  membros,
  canais,
  gestao,
}: {
  departamentos: Departamento[];
  membros: MembroEnsaio[];
  canais: CanalEnsaio[];
  gestao: boolean;
}) {
  const [deps] = useState(departamentos);
  const ordenados = useMemo(() => {
    const saida: Departamento[] = [];
    const filhos = (pai: string | null) => deps.filter((d) => d.pai === pai).sort((a, b) => a.ordem - b.ordem);
    const andar = (pai: string | null) => {
      for (const d of filhos(pai)) {
        saida.push(d);
        andar(d.chave);
      }
    };
    andar(null);
    return saida;
  }, [deps]);

  const lotados = (chave: string) => membros.filter((m) => m.ativo && m.departamentos.some((v) => v.departamento === chave));
  const gestoras = (chave: string) => membros.filter((m) => m.ativo && m.departamentos.some((v) => v.departamento === chave && v.papel_no_departamento === "gestor"));
  const numeros = (chave: string) => canais.filter((c) => c.departamento === chave);
  const admins = membros.filter((m) => m.ativo && (m.papel === "owner" || m.papel === "admin"));

  return (
    <CascaConfig
      largo
      titulo="Departamentos e cargos"
      descricao="A árvore da empresa: quem está em cada departamento, quem é gestora dele e por quais números ele fala. É daqui que o sistema decide quem vê o quê e para quem vai a tarefa sem dono."
      acao={
        gestao ? (
          <Button variant="outline" onClick={() => toast("Em breve: criar departamento.", { description: "Hoje se cria em Auditoria e histórico › config departamentos." })}>
            <PlusIcon data-icon="inline-start" />
            Departamento
          </Button>
        ) : null
      }
    >
      <div className="flex items-center justify-between">
        <Contagem>
          {deps.filter((d) => d.ativo).length} departamentos · {admins.length} pessoas veem todos (admin/owner)
        </Contagem>
        <span className="text-ui-12 text-muted-foreground">Clínico é fronteira: só vê quem está lotado nele.</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_200px_180px_220px] gap-4 border-b border-border bg-table-header px-4 py-2 text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Departamento</span>
          <span>Pessoas</span>
          <span>Gestora</span>
          <span>Números</span>
        </div>
        {ordenados.map((d, i) => {
          const pessoas = lotados(d.chave);
          const gest = gestoras(d.chave);
          const nums = numeros(d.chave);
          return (
            <div
              key={d.chave}
              className={cn("grid grid-cols-[1fr_200px_180px_220px] items-center gap-4 px-4 py-3.5", i > 0 && "border-t border-border", !d.ativo && "opacity-60")}
            >
              <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${(d.nivel - 1) * 22}px` }}>
                {d.nivel > 1 && <CornerDownRightIcon className="size-3.5 shrink-0 text-muted-foreground/70" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{d.rotulo}</span>
                    {d.entrada && (
                      <Badge variant="info" size="sm">
                        entrada dos leads
                      </Badge>
                    )}
                    {d.chave === "clinico" && (
                      <Badge variant="outline" size="sm">
                        fronteira
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-[12px] text-muted-foreground">{d.chave}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {pessoas.length === 0 ? (
                  <span className="text-[13.5px] text-muted-foreground">{d.nivel === 1 && deps.some((x) => x.pai === d.chave) ? "pelos filhos" : "ninguém"}</span>
                ) : (
                  <>
                    <div className="flex -space-x-1.5">
                      {pessoas.slice(0, 4).map((p) => (
                        <Avatar key={p.id} size="sm" variant="subtle" className="ring-2 ring-card">
                          <AvatarFallback>{iniciaisMembro(p.nome, p.email)}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-[13.5px] text-foreground">{pessoas.map((p) => p.nome.split(" ")[0]).join(", ")}</span>
                  </>
                )}
              </div>
              <div>
                {gest.length === 0 ? (
                  <span className="text-[13.5px] text-muted-foreground">{d.entrada ? "— (tarefas caem no owner)" : "—"}</span>
                ) : (
                  gest.map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1.5 text-[14px] text-foreground">
                      {g.nome.split(" ")[0]}
                      <Badge variant="info" size="xs">
                        gestora
                      </Badge>
                    </span>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {nums.length === 0 ? (
                  <span className="text-[13.5px] text-muted-foreground">nenhum</span>
                ) : (
                  nums.map((c) => (
                    <span key={c.canal_id} className="flex items-center gap-1.5 text-[13.5px] text-foreground">
                      <span className={cn("size-1.5 rounded-full", c.ativo ? "bg-success-ink" : "bg-muted-foreground/50")} aria-hidden />
                      {c.apelido}
                      <span className="text-ui-11 text-muted-foreground">{c.provedor === "waba" ? "oficial" : "Lite"}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-ui-14 font-semibold text-foreground">Cargos</h2>
        <p className="mt-1 text-ui-13 text-muted-foreground">O cargo é o papel no workspace mais o papel no departamento. Não existe tabela de cargos — existem quatro combinações, e é isso que a tela mostra.</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-[200px_1fr]">
          <dt className="text-foreground">Proprietário / Admin</dt>
          <dd className="text-muted-foreground">vê todos os departamentos, inclusive Clínico; publica configuração; convida; liga e desliga agentes.</dd>
          <dt className="text-foreground">Gestora de departamento</dt>
          <dd className="text-muted-foreground">membro lotada com papel gestor: vê o departamento e os filhos; recebe as tarefas do Jarvis sem dono.</dd>
          <dt className="text-foreground">Membro de departamento</dt>
          <dd className="text-muted-foreground">vê os leads e conversas do departamento; pode ter o próprio número (Lite).</dd>
          <dt className="text-foreground">Marketing</dt>
          <dd className="text-muted-foreground">captação e relatórios; não vê conversa nem paciente.</dd>
        </dl>
      </section>
    </CascaConfig>
  );
}

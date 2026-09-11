"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronRightIcon, CornerDownRightIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MarcaJarvis } from "@/components/jarvis/marca";
import { useMovimento } from "@/components/jarvis/movimento";
import { cn } from "@/lib/utils";
import { iniciaisMembro } from "@/lib/membros";
import type { Departamento } from "@/lib/departamentos/escopo";
import type { MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { CARGOS_ATIVOS, CARGOS_DISPONIVEIS, cargoDe, cargoPorChave, type Cargo } from "@/lib/ensaio/fixtures/cargos";
import { fotosEnsaio } from "@/lib/ensaio/fotos";
import { CascaConfig, Contagem } from "./casca-config";

/**
 * /configuracoes/cargos — substitui "Departamentos e cargos", que o Diogo chamou de "uma merda".
 *
 * O defeito da anterior era de ordem: ela abria pela ÁRVORE DE DEPARTAMENTOS, que é como o banco
 * guarda o escopo (`core.usuario_departamento`, D91), e deixava os cargos como um bloco de texto
 * no rodapé. Só que ninguém convida alguém para um departamento — convida para um cargo. Aqui o
 * cargo é a tela, e a árvore virou o que ela é: o detalhe de implementação, no fim, em letra menor.
 *
 * Cada linha responde quatro perguntas na mesma ordem em que aparecem quando se contrata alguém:
 * quem tem esse cargo hoje · o que o banco grava · que telas a pessoa alcança · o que o Jarvis
 * manda para ela. Abrir a linha mostra o que ela vê e o que não alcança.
 *
 * Os nove perfis do PRD §14.1 estão todos listados — quatro vivos e o resto em "disponíveis". É
 * assim que o PRD fica visível sem virar promessa de tela que não existe.
 */
export function CargosEnsaio({
  departamentos,
  membros,
  canais,
}: {
  departamentos: Departamento[];
  membros: MembroEnsaio[];
  canais: CanalEnsaio[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const fotos = useMemo(() => fotosEnsaio(), []);
  const mov = useMovimento();

  const rotuloDep = (chave: string) => departamentos.find((d) => d.chave === chave)?.rotulo ?? chave;
  const doCargo = (c: Cargo) => membros.filter((m) => m.ativo && cargoDe(m)?.chave === c.chave);

  const ordenados = useMemo(() => {
    const saida: Departamento[] = [];
    const filhos = (pai: string | null) => departamentos.filter((d) => d.pai === pai).sort((a, b) => a.ordem - b.ordem);
    const andar = (pai: string | null) => {
      for (const d of filhos(pai)) {
        saida.push(d);
        andar(d.chave);
      }
    };
    andar(null);
    return saida;
  }, [departamentos]);

  return (
    <CascaConfig
      titulo="Cargos"
      descricao="Cada cargo amarra papel, departamento e telas. Quem convida escolhe um cargo — nunca dois campos soltos."
    >
      <div className="flex items-center justify-between">
        <Contagem>
          {CARGOS_ATIVOS.length} cargos em uso · {membros.filter((m) => m.ativo).length} pessoas
        </Contagem>
        <span className="text-ui-12 text-muted-foreground">Clique na linha para ver o que o cargo alcança.</span>
      </div>

      <LayoutGroup>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-4 border-b border-border bg-table-header px-4 py-2 text-ui-11 font-medium uppercase tracking-[0.06em] text-muted-foreground">
            <span className="w-[248px] shrink-0">Cargo</span>
            <span className="hidden w-[150px] shrink-0 lg:block">Quem é hoje</span>
            <span className="hidden w-[210px] shrink-0 md:block">O que o banco grava</span>
            <span className="min-w-0 flex-1">Telas que alcança</span>
            <span className="hidden w-[300px] shrink-0 xl:block">O que o Jarvis faz por ela</span>
            <span className="w-5 shrink-0" />
          </div>

          {CARGOS_ATIVOS.map((c, i) => {
            const pessoas = doCargo(c);
            const expandido = aberto === c.chave;
            return (
              <motion.div key={c.chave} layout={!mov.reduzido} className={cn(i > 0 && "border-t border-border")}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandido}
                  onClick={() => setAberto(expandido ? null : c.chave)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setAberto(expandido ? null : c.chave))}
                  className="flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <div className="w-[248px] shrink-0">
                    <div className="text-[15px] font-semibold leading-tight text-foreground">{c.nome}</div>
                    <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{c.resumo}</div>
                  </div>

                  <div className="hidden w-[150px] shrink-0 items-center gap-2 lg:flex">
                    {pessoas.length === 0 ? (
                      <span className="text-[13px] text-muted-foreground">ninguém</span>
                    ) : (
                      <>
                        <AvatarGroup>
                          {pessoas.slice(0, 3).map((p) => (
                            <Avatar key={p.id} size="xs" variant="subtle">
                              {fotos[p.id] ? <AvatarImage src={fotos[p.id]} alt="" /> : null}
                              <AvatarFallback>{iniciaisMembro(p.nome, p.email)}</AvatarFallback>
                            </Avatar>
                          ))}
                        </AvatarGroup>
                        <span className="truncate text-[13px] text-foreground">{pessoas.map((p) => p.nome.split(" ")[0]).join(", ")}</span>
                      </>
                    )}
                  </div>

                  <div className="hidden w-[210px] shrink-0 md:block">
                    <span className="font-mono text-[12px] text-foreground">{c.papeis.join(" ou ")}</span>
                    <span className="block font-mono text-[12px] text-muted-foreground">
                      {c.departamento ? `${c.departamento} · ${c.papel_no_departamento}` : "sem lotação"}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {c.telas.map((t) => (
                      <Badge key={t} variant="outline" size="sm" className="bg-card font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>

                  <div className="hidden w-[300px] shrink-0 items-start gap-1.5 xl:flex">
                    <MarcaJarvis tamanho={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="text-[13px] leading-snug text-muted-foreground">{c.jarvis}</span>
                  </div>

                  <motion.span animate={{ rotate: expandido ? 90 : 0 }} transition={{ duration: mov.reduzido ? 0 : 0.18 }} className="w-5 shrink-0 text-muted-foreground">
                    <ChevronRightIcon className="size-4" />
                  </motion.span>
                </div>

                <AnimatePresence initial={false}>
                  {expandido && (
                    <motion.div variants={mov.abrir} initial="hidden" animate="visible" exit="exit" className="overflow-hidden">
                      <div className="grid gap-6 border-t border-border bg-muted/20 px-4 py-4 md:grid-cols-2">
                        <Coluna rotulo="O que ela vê" itens={c.ve} />
                        <Coluna rotulo="O que não alcança" itens={c.esconde.length ? c.esconde : ["Nada — este cargo alcança o sistema inteiro."]} apagado />
                        <div className="md:col-span-2">
                          <Rotulo>No PRD</Rotulo>
                          <p className="text-[13.5px] text-muted-foreground">
                            {c.prd ? `Perfil "${c.prd}" (§14.1).` : "Não vem do PRD — nasceu do papel `marketing` da migration 0250."}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>

      <section className="flex flex-col gap-2">
        <h2 className="text-ui-13 font-semibold text-foreground">Disponíveis</h2>
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Os perfis que o PRD prevê e que ainda não têm ninguém. Aparecem aqui para que a próxima contratação escolha um nome que já existe, em vez de inventar outro.
        </p>
        <div className="overflow-hidden rounded-lg border border-dashed border-border">
          {CARGOS_DISPONIVEIS.map((c, i) => (
            <div key={c.chave} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5", i > 0 && "border-t border-border")}>
              <span className="w-[200px] shrink-0 text-[14px] font-medium text-muted-foreground">{c.nome}</span>
              <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{c.resumo}</span>
              {c.cobertoPor && (
                <span className="shrink-0 text-ui-12 text-muted-foreground">hoje entra como {cargoPorChave(c.cobertoPor)?.nome ?? c.cobertoPor}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-ui-13 font-semibold text-foreground">Departamentos</h2>
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Como o sistema guarda o escopo por trás do cargo: é a árvore que decide quem vê o quê e para quem vai a tarefa sem dono. Quem usa o sistema não escolhe daqui.
        </p>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {ordenados.map((d, i) => {
            const lotados = membros.filter((m) => m.ativo && m.departamentos.some((v) => v.departamento === d.chave));
            const gestoras = lotados.filter((m) => m.departamentos.some((v) => v.departamento === d.chave && v.papel_no_departamento === "gestor"));
            const nums = canais.filter((c) => c.departamento === d.chave);
            return (
              <div key={d.chave} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5", i > 0 && "border-t border-border")}>
                <div className="flex w-[280px] shrink-0 items-center gap-1.5" style={{ paddingLeft: `${(d.nivel - 1) * 20}px` }}>
                  {d.nivel > 1 && <CornerDownRightIcon className="size-3.5 shrink-0 text-muted-foreground/70" />}
                  <span className="text-[14px] font-medium text-foreground">{d.rotulo}</span>
                  {d.entrada && (
                    <Badge variant="info" size="xs">
                      entrada dos leads
                    </Badge>
                  )}
                  {d.chave === "clinico" && (
                    <Badge variant="outline" size="xs">
                      fronteira
                    </Badge>
                  )}
                </div>
                <span className="w-[220px] shrink-0 truncate text-[13px] text-muted-foreground">
                  {lotados.length === 0
                    ? departamentos.some((x) => x.pai === d.chave)
                      ? "pelos departamentos abaixo"
                      : "ninguém lotado"
                    : lotados.map((p) => `${p.nome.split(" ")[0]}${gestoras.includes(p) ? " (gestora)" : ""}`).join(", ")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  {/* vírgula e não "·": os apelidos já usam "·" dentro ("Kommo · Oficial"), e juntar com o mesmo
                      separador fundia dois números num nome só. */}
                  {nums.length === 0 ? "nenhum número" : nums.map((c) => c.apelido).join(", ")}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-muted-foreground/70">{d.chave}</span>
              </div>
            );
          })}
        </div>
      </section>
    </CascaConfig>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>;
}

function Coluna({ rotulo, itens, apagado }: { rotulo: string; itens: string[]; apagado?: boolean }) {
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <ul className="flex flex-col">
        {itens.map((t, i) => (
          <li key={t} className={cn("py-1 text-[13.5px] leading-snug", i > 0 && "border-t border-border/50", apagado ? "text-muted-foreground" : "text-foreground")}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

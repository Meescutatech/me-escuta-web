"use client";

import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { FiltrosTarefas, StatusFiltro } from "@/lib/dados/tarefas-visao-calculos";
import type { PessoaAtiva } from "./acoes-tarefa";

/*
 * A BARRA DE FILTROS — v2 (10/09, 22:40). Quatro controles, e nenhum a mais:
 *   Busca · Abertas | Concluídas · Responsável · Tipo
 * Tudo de components/ui (Input, ToggleGroup, Select): o `<select>` nativo do sistema saiu de
 * vez ("todos esses dropdowns zoados" — Diogo). Os recortes que a v1 expunha como controle
 * (vencidas, prazo, minhas, agrupar, exibição) continuam existindo na URL — são as ABAS que
 * os acionam agora, e a lista agrupada por dia já é o "agrupar".
 *
 * O que cada aba esconde: Hoje/Semana/Todas são "minhas" → Responsável some (não há o que
 * escolher). Concluídas não tem sentido em Hoje (é a fila de agora) → o segmento some lá.
 */

const TODOS = "todos";

export function FiltrosTarefas({
  filtros,
  onMudar,
  pessoas,
  tiposTarefa,
  mostrarResponsavel,
  mostrarStatus,
}: {
  filtros: FiltrosTarefas;
  onMudar: (parcial: Partial<FiltrosTarefas>) => void;
  pessoas: PessoaAtiva[];
  tiposTarefa: TipoTarefa[];
  mostrarResponsavel: boolean;
  mostrarStatus: boolean;
}) {
  const status: StatusFiltro = filtros.status === "concluidas" ? "concluidas" : "abertas";
  // `items` é o que faz o `SelectValue` mostrar o RÓTULO e não o valor cru (base-ui 1.3)
  const itensPessoas: Record<string, string> = { [TODOS]: "Todo mundo", ...Object.fromEntries(pessoas.map((p) => [p.id, p.nome])) };
  const itensTipos: Record<string, string> = { [TODOS]: "Qualquer tipo", ...Object.fromEntries(tiposTarefa.map((t) => [t.chave, t.rotulo])) };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" aria-hidden />
        <Input
          type="search"
          value={filtros.busca}
          onChange={(e) => onMudar({ busca: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") onMudar({ busca: "" });
          }}
          placeholder="Buscar tarefa ou lead…"
          aria-label="Buscar tarefa por título, descrição ou lead"
          className="h-8 w-[260px] pl-8 text-[13px]"
        />
      </div>

      {mostrarStatus && (
        <ToggleGroup
          value={[status]}
          onValueChange={(v) => {
            const escolhido = (v as string[])[0];
            if (escolhido === "abertas" || escolhido === "concluidas") onMudar({ status: escolhido, vencidas: false, prazo: filtros.prazo });
          }}
          variant="outline"
          size="sm"
          aria-label="Status"
        >
          <ToggleGroupItem value="abertas" className="px-3 text-[13px]">
            Abertas
          </ToggleGroupItem>
          <ToggleGroupItem value="concluidas" className="px-3 text-[13px]">
            Concluídas
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {mostrarResponsavel && (
        <Select
          items={itensPessoas}
          value={filtros.responsavelId ?? TODOS}
          onValueChange={(v) => onMudar({ responsavelId: v === TODOS || v == null ? null : (v as string), minhas: false })}
        >
          <SelectTrigger size="sm" className="text-[13px]" aria-label="Responsável">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo mundo</SelectItem>
            {pessoas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select items={itensTipos} value={filtros.tipo ?? TODOS} onValueChange={(v) => onMudar({ tipo: v === TODOS || v == null ? null : (v as string) })}>
        <SelectTrigger size="sm" className="text-[13px]" aria-label="Tipo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Qualquer tipo</SelectItem>
          {tiposTarefa.map((t) => (
            <SelectItem key={t.chave} value={t.chave}>
              {t.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

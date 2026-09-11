"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { paraDatetimeLocal } from "@/lib/dados/tarefa-calculos";
import { presetsAdiar } from "@/lib/tarefas/adiar";
import { ROTULO_PRIORIDADE, type Prioridade } from "@/lib/tarefas/dia";
import { cn } from "@/lib/utils";
import type { PessoaAtiva } from "./acoes-tarefa";
import type { NovaTarefa } from "./executor";
import type { ResultadoEvento } from "@/app/(app)/funil/actions";

/*
 * "E AGORA?" — o prompt depois de concluir (W-D5, 10/09 · benchmark §4 item 3).
 *
 * O Pipedrive força a próxima atividade ao fechar uma ("activity-based selling"); o nosso
 * concluía com resultado e PARAVA. É a origem do "sem próxima ação": a tarefa acaba, o lead fica
 * sem compromisso, e ninguém vê — até o card do funil acusar em cinza dias depois.
 *
 * O diálogo abre com o lead e o responsável já preenchidos (é a continuação, não um formulário
 * novo) e duas saídas honestas: "Criar tarefa" (emite `tarefa_criada` normal — [E] zero) e "Sem
 * próxima ação por agora" — que é uma ESCOLHA, registrada só na cabeça de quem fez, mas visível:
 * o card do funil vai dizer "sem próxima ação" em cinza. Fechar sem escolher (Esc, clique fora)
 * é o mesmo que a segunda saída.
 *
 * Tarefa sem lead não passa por aqui: não há a quem dever a próxima.
 */

export interface ConcluidaAgora {
  tarefa: TarefaVisao;
  resultado: string;
}

export function DialogoEAgora({
  concluida,
  pessoas,
  tiposTarefa,
  meuId,
  agora,
  criar,
  onFechar,
}: {
  concluida: ConcluidaAgora | null;
  pessoas: PessoaAtiva[];
  tiposTarefa: TipoTarefa[];
  meuId: string | null;
  agora: number;
  criar: (dados: NovaTarefa) => Promise<ResultadoEvento>;
  /** `criou` = a próxima existe; `false` = "sem próxima ação por agora" */
  onFechar: (criou: boolean) => void;
}) {
  return (
    <Dialog open={concluida != null} onOpenChange={(aberto) => !aberto && onFechar(false)}>
      {concluida && (
        <Formulario
          key={concluida.tarefa.id}
          concluida={concluida}
          pessoas={pessoas}
          tiposTarefa={tiposTarefa}
          meuId={meuId}
          agora={agora}
          criar={criar}
          onFechar={onFechar}
        />
      )}
    </Dialog>
  );
}

function Formulario({
  concluida,
  pessoas,
  tiposTarefa,
  meuId,
  agora,
  criar,
  onFechar,
}: {
  concluida: ConcluidaAgora;
  pessoas: PessoaAtiva[];
  tiposTarefa: TipoTarefa[];
  meuId: string | null;
  agora: number;
  criar: (dados: NovaTarefa) => Promise<ResultadoEvento>;
  onFechar: (criou: boolean) => void;
}) {
  const t = concluida.tarefa;
  const presets = useMemo(() => presetsAdiar(agora), [agora]);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<string>(t.tipo ?? "");
  const [responsavelId, setResponsavelId] = useState<string>(t.responsavel_id ?? meuId ?? "");
  const [prazoChave, setPrazoChave] = useState<string>(presets[0].chave);
  const [prazoOutra, setPrazoOutra] = useState<string>("");
  const [prioridade, setPrioridade] = useState<Prioridade>(t.prioridade ?? "media");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const prazoIso =
    prazoChave === "outra"
      ? prazoOutra
        ? new Date(prazoOutra).toISOString()
        : null
      : (presets.find((p) => p.chave === prazoChave)?.prazoIso ?? null);
  const pode = titulo.trim() !== "" && prazoIso != null && !ocupado;

  async function confirmar() {
    if (!pode || !t.lead_id) return;
    setOcupado(true);
    setErro(null);
    const r = await criar({
      leadId: t.lead_id,
      leadNome: t.lead_nome,
      titulo: titulo.trim(),
      tipo: tipo || null,
      responsavelId: responsavelId || null,
      prazoIso,
      prioridade,
    });
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível criar a próxima tarefa");
      return;
    }
    onFechar(true);
  }

  const SEM_TIPO = "__sem__";
  const itensPessoas: Record<string, string> = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]));
  if (responsavelId && !itensPessoas[responsavelId]) itensPessoas[responsavelId] = "outro membro";
  const itensTipos: Record<string, string> = { [SEM_TIPO]: "Sem tipo", ...Object.fromEntries(tiposTarefa.map((x) => [x.chave, x.rotulo])) };
  if (tipo && !itensTipos[tipo]) itensTipos[tipo] = tipo;

  return (
    <DialogContent className="sm:max-w-[440px]" showCloseButton={false}>
      <DialogHeader className="gap-1">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-verde">
          <CheckIcon className="size-3.5" aria-hidden />
          Concluída: <span className="truncate text-suave">{t.titulo}</span>
        </p>
        <DialogTitle className="text-[16px] font-semibold text-tinta">
          E agora{t.lead_nome ? ` com ${primeiroNome(t.lead_nome)}` : ""}?
        </DialogTitle>
        <DialogDescription className="text-[12.5px] text-suave">
          Lead sem próxima tarefa some da fila de todo mundo. Marque a próxima, ou diga que não há.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2.5">
        <Input
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirmar();
            if (e.key === "Escape") onFechar(false);
          }}
          placeholder="Próxima tarefa — o que fazer?"
          aria-label="Título da próxima tarefa"
          className="text-[13.5px]"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-mute">Para</span>
          {presets.map((p) => (
            <Pill key={p.chave} ativo={prazoChave === p.chave} onClick={() => setPrazoChave(p.chave)}>
              {p.rotulo}
            </Pill>
          ))}
          <Pill ativo={prazoChave === "outra"} onClick={() => setPrazoChave("outra")}>
            Outra data…
          </Pill>
        </div>
        {prazoChave === "outra" && (
          <input
            type="datetime-local"
            value={prazoOutra}
            min={paraDatetimeLocal(new Date(agora).toISOString())}
            onChange={(e) => setPrazoOutra(e.target.value)}
            aria-label="Prazo da próxima tarefa"
            className="w-full rounded-md border border-linha bg-branco px-2 py-1 font-mono text-[12px] text-suave outline-none focus:border-laranja"
          />
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <Select items={itensPessoas} value={responsavelId || null} onValueChange={(v) => setResponsavelId((v as string | null) ?? "")}>
            <SelectTrigger size="sm" className="w-full text-[13px]" aria-label="Responsável">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(itensPessoas).map(([id, nome]) => (
                <SelectItem key={id} value={id}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={itensTipos} value={tipo || SEM_TIPO} onValueChange={(v) => setTipo(v === SEM_TIPO || v == null ? "" : (v as string))}>
            <SelectTrigger size="sm" className="w-full text-[13px]" aria-label="Tipo da tarefa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(itensTipos).map(([chave, rotulo]) => (
                <SelectItem key={chave} value={chave}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-mute">Prioridade</span>
          {(["alta", "media", "baixa"] as Prioridade[]).map((p) => (
            <Pill key={p} ativo={prioridade === p} onClick={() => setPrioridade(p)}>
              {ROTULO_PRIORIDADE[p]}
            </Pill>
          ))}
        </div>

        {erro && <p className="text-[11.5px] font-semibold text-vermelho">{erro}</p>}
      </div>

      <div className="mt-1 flex items-center gap-2 border-t border-linha pt-3">
        <Button size="sm" onClick={() => void confirmar()} disabled={!pode}>
          {ocupado ? "Criando…" : "Criar tarefa"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onFechar(false)} className="ml-auto text-suave">
          Sem próxima ação por agora
        </Button>
      </div>
    </DialogContent>
  );
}

function Pill({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        ativo ? "border-navy bg-[#EAECF5] font-semibold text-navy" : "border-linha bg-branco text-suave hover:bg-hover hover:text-tinta",
      )}
    >
      {children}
    </button>
  );
}

function primeiroNome(nome: string): string {
  return nome.split(/\s+/)[0];
}

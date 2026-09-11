"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { salvarCanaisClara } from "@/app/(app)/configuracoes/clara/actions";
import type { CanalEscolhivel } from "@/components/clara/canais-da-clara";

/**
 * LIGAR A CLARA — o aviso e a escolha do número, antes e não depois (Diogo, 11/09 16:20).
 *
 * Por que um diálogo e não um interruptor direto: a Clara é o único agente que FALA COM PACIENTE
 * em tempo real. Os outros propõem e alguém valida; ela responde sozinha, no WhatsApp, para uma
 * pessoa de verdade, no segundo seguinte ao clique. Um interruptor silencioso trata as duas coisas
 * como iguais, e elas não são.
 *
 * E o canal é a parte que mais dói errar: sem escolha, `escopo_leitura.canais` fica vazio e vazio
 * significa TODOS — inclusive a WABA `627327023793464`, que é compartilhada com o Kommo. Ligar sem
 * marcar nada põe a Clara respondendo no mesmo número em que a equipe responde à mão, e a paciente
 * recebe duas respostas. Por isso a escolha é parte de LIGAR, não uma tela separada que alguém
 * visita depois.
 *
 * Grava em UM evento (`salvarCanaisClara(canais, true)` → `config_atualizada` com `escopo_patch` +
 * `ativo`): os dois fatos entram juntos ou não entram — nunca "ligada, escopo a definir".
 */
export function DialogoLigarClara({
  aberto,
  onFechar,
  canais,
  escolhidosIniciais,
  onLigou,
}: {
  aberto: boolean;
  onFechar: () => void;
  canais: CanalEscolhivel[];
  escolhidosIniciais: string[];
  onLigou: () => void;
}) {
  const [marcados, setMarcados] = useState<string[]>(escolhidosIniciais);
  const [enviando, iniciar] = useTransition();

  const alternar = (id: string) =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const ligar = () =>
    iniciar(async () => {
      const r = await salvarCanaisClara(marcados, true);
      if (r?.ok === false) {
        toast.error("Não deu para ligar a Clara.", { description: r.erro ?? undefined });
        return;
      }
      toast.success("Clara ligada.", {
        description:
          marcados.length > 0
            ? `Ela responde em ${marcados.length} ${marcados.length === 1 ? "número" : "números"}.`
            : "Ela responde em TODOS os números — inclusive o que a equipe usa.",
      });
      onLigou();
      onFechar();
    });

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ligar a Clara</DialogTitle>
          <DialogDescription>
            A partir do clique ela <strong>responde sozinha, em tempo real</strong>, a quem escrever
            nos números marcados abaixo. Não é rascunho nem sugestão: a mensagem sai para a paciente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-foreground">Em quais números ela responde</p>
          {canais.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-[13px] text-muted-foreground">
              Nenhum número legível agora. Ligar assim a deixa respondendo em todos — melhor
              resolver a leitura antes.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {canais.map((c) => (
                <li key={c.canal_id} className="flex items-start gap-3 px-3 py-2.5">
                  <Checkbox
                    id={`canal-${c.canal_id}`}
                    checked={marcados.includes(c.canal_id)}
                    onCheckedChange={() => alternar(c.canal_id)}
                    disabled={enviando}
                  />
                  <label htmlFor={`canal-${c.canal_id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-[13.5px] text-foreground">
                      {c.nome}
                      {c.numero ? <span className="ml-2 text-muted-foreground">{c.numero}</span> : null}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {c.provedor === "nao_oficial" ? "não oficial" : "oficial"}
                      {c.area_efetiva ? ` · ${c.area_efetiva}` : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {marcados.length === 0 && canais.length > 0 ? (
            // O aviso não some com o tempo nem depende de alguém ler a documentação: ele aparece
            // exatamente na situação que ele descreve, e desaparece quando ela deixa de valer.
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Nenhum número marcado: a Clara responde em <strong>todos</strong>, inclusive no que a
              equipe usa — e a paciente recebe duas respostas.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={ligar} disabled={enviando}>
            {enviando ? "Ligando…" : "Ligar a Clara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { reatribuirTarefaLead } from "@/app/(app)/lead/actions";
import type { PessoaAtiva } from "@/components/tarefas/acoes-tarefa";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * TROCAR O RESPONSÁVEL ONDE A TAREFA APARECE (Diogo, 15/09).
 *
 * O caminho de escrita já existia inteiro — `tarefa_reatribuida`, guarda e projetor vivos desde a
 * 0037 — mas só era alcançável pelo `⋯` de `/tarefas` e do painel do lead. Quem vive na conversa
 * via "para Sara" como TEXTO e não tinha como mudar sem sair da tela.
 *
 * Este componente não é uma funcionalidade nova: é o mesmo `reatribuirTarefaLead` da
 * `AcoesTarefa`, com a menor casca possível. O gatilho é o próprio nome — "para Sara ⌄" — porque
 * o que se troca é aquele nome, e um botão separado ao lado diria que são duas coisas.
 *
 * O que ele NÃO faz, de propósito: não mostra erro em faixa, não tem confirmação e não desfaz.
 * Reatribuir é reversível pelo mesmo controle (basta escolher de volta), e o ledger guarda as
 * duas passagens. Falhou, o nome volta ao que era e o motivo vai no `title` — a tela nunca
 * afirma uma troca que o banco não aceitou.
 */
export function SeletorResponsavel({
  leadId,
  tarefaId,
  atualId,
  atualNome,
  pessoas,
  aoTrocar,
  className,
}: {
  leadId: string | null;
  tarefaId: string;
  atualId: string | null;
  /** o que se lê hoje — "Sara", ou "sem responsável" */
  atualNome: string | null;
  pessoas: PessoaAtiva[];
  /** a tela recarrega o que depende da tarefa (a lista, a faixa do foco) */
  aoTrocar?: () => void;
  className?: string;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // otimista: o nome muda no ato e volta sozinho se a porta recusar
  const [nome, setNome] = useState<string | null>(atualNome);
  const [id, setId] = useState<string | null>(atualId);

  const outros = pessoas.filter((p) => p.id !== id);
  if (outros.length === 0) return <span className={className}>{rotulo(nome)}</span>;

  async function trocar(novoId: string | null) {
    const alvo = pessoas.find((p) => p.id === novoId);
    if (!alvo || ocupado) return;
    const antes = { id, nome };
    setOcupado(true);
    setErro(null);
    setId(alvo.id);
    setNome(primeiroNome(alvo.nome));
    const r = await reatribuirTarefaLead(leadId, tarefaId, alvo.id);
    setOcupado(false);
    if (!r.ok) {
      setId(antes.id);
      setNome(antes.nome);
      setErro(r.motivo ?? "não consegui reatribuir");
      return;
    }
    aoTrocar?.();
  }

  return (
    <Select value={id ?? ""} onValueChange={trocar} disabled={ocupado}>
      <SelectTrigger
        aria-label="Trocar o responsável pela tarefa"
        title={erro ?? "Trocar o responsável"}
        className={cn(
          "inline-flex h-auto w-auto gap-0.5 border-0 bg-transparent p-0 text-[12px] shadow-none",
          "hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/40 [&>svg]:hidden",
          erro && "text-vermelho",
          ocupado && "opacity-60",
          className,
        )}
      >
        <span className="truncate">{rotulo(nome)}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" aria-hidden />
      </SelectTrigger>
      <SelectContent align="start">
        {outros.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function rotulo(nome: string | null): string {
  return nome ? `para ${nome}` : "sem responsável";
}

function primeiroNome(nome: string): string {
  return nome.includes("@") ? nome.split("@")[0] : nome.trim().split(/\s+/)[0];
}

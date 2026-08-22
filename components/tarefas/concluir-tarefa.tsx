"use client";

import { useState } from "react";
import { concluirTarefaLead } from "@/app/(app)/lead/actions";
import { concluirTarefaNotificacao } from "@/app/(app)/notificacoes/actions";

/*
 * CONCLUIR DENTRO DA /tarefas (22/08) — o que faltava para a fila da Sarah esvaziar.
 *
 * Até aqui a /tarefas era só de LEITURA: o comentário no topo de visao-tarefas.tsx dizia com
 * todas as letras "nenhuma escrita nesta tela: clicar numa tarefa leva ao drawer do lead no
 * funil". Medido no caminho real, concluir custava 4 CLIQUES e passava por 2 ROTAS
 * (/tarefas → card → /funil?lead=… → abrir tarefas → marcar → escrever resultado), e a tarefa
 * SEM lead_id não era nem clicável — não tinha caminho nenhum. A tela que existe para dar fim
 * à fila era a única que não deixava dar fim a nada.
 *
 * Nada de comportamento novo foi inventado: o desenho (caixa de marcar → campo "Resultado —
 * o que aconteceu?" → botão) é o de components/lead/tarefas-lead.tsx, e as ações já existiam.
 *
 * POR QUE DUAS AÇÕES, e não uma:
 *   · `concluirTarefaLead(leadId, …)` exige `leadId: string` — é a ação do painel do lead, e o
 *     leadId ali ANCORA o evento no ledger daquele lead;
 *   · na /tarefas `lead_id` pode ser null (tarefa interna, tarefa do Jarvis ainda sem lead), e
 *     para esse caso já existe `concluirTarefaNotificacao(tarefaId, resultado)`, que emite o
 *     MESMO `tarefa_concluida {tarefa_id, resultado}` sem lead — a porta acha a tarefa pelo
 *     `tarefa_id`, como o comentário das ações de ciclo de vida já registrava.
 * Escolher pelo `lead_id` é o que mantém o evento ancorado quando dá, sem perder a tarefa
 * órfã quando não dá. Nenhuma das duas ações foi tocada.
 *
 * RESULTADO CONTINUA OBRIGATÓRIO (§4.1.2 — no Kommo só 29,1% das concluídas tinham resultado,
 * porque o obrigatório era do formulário). O botão não habilita em branco, e a porta recusa de
 * novo. `concluirTarefaNotificacao` tem um default "concluída" para o botão do sino; aqui ele
 * nunca chega a valer, porque a UI barra antes.
 */

/** A caixa de marcar — mesmo desenho do painel do lead, e o mesmo rótulo acessível. */
export function BotaoConcluir({
  titulo,
  aberto,
  onToggle,
}: {
  titulo: string;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // o card inteiro é role="link" para o drawer do funil (ver ComLead): sem isto, marcar
        // a tarefa navegava para outra tela em vez de concluir.
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      aria-label={`Concluir: ${titulo}`}
      aria-expanded={aberto}
      className={[
        "mt-px grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px]",
        "border-[1.5px] bg-branco transition-colors hover:border-navy",
        aberto ? "border-navy" : "border-mute",
      ].join(" ")}
    />
  );
}

/** O campo de resultado + confirmar. Só aparece com a caixa marcada. */
export function PainelConcluir({
  leadId,
  tarefaId,
  aoSucesso,
  onFechar,
}: {
  /** null = tarefa sem lead; cai na ação sem âncora de lead (ver bloco no topo). */
  leadId: string | null;
  tarefaId: string;
  aoSucesso: () => void;
  onFechar: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pode = resultado.trim() !== "" && !ocupado;

  async function concluir() {
    if (!pode) return;
    setOcupado(true);
    setErro(null);
    const r = leadId
      ? await concluirTarefaLead(leadId, tarefaId, resultado)
      : await concluirTarefaNotificacao(tarefaId, resultado);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível concluir");
      return;
    }
    onFechar();
    aoSucesso();
  }

  return (
    <div
      className="mt-2 border-t border-linha pt-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onFechar();
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void concluir();
          }}
          placeholder="Resultado — o que aconteceu?"
          aria-label="Resultado da tarefa (obrigatório)"
          className="min-w-0 flex-1 rounded-md border border-linha-forte bg-branco px-2 py-1 text-[12.5px] outline-none focus:border-laranja"
        />
        <button
          type="button"
          onClick={() => void concluir()}
          disabled={!pode}
          className="shrink-0 rounded-md bg-laranja px-2.5 py-1 text-[12px] font-semibold text-branco transition-colors hover:bg-laranja-esc disabled:opacity-50"
        >
          Concluir
        </button>
      </div>
      {erro && <p className="mt-1.5 text-[11.5px] font-semibold text-vermelho">{erro}</p>}
    </div>
  );
}

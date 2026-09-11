"use client";

import { useState } from "react";
import { concluirTarefaLead } from "@/app/(app)/lead/actions";
import { concluirTarefaNotificacao } from "@/app/(app)/notificacoes/actions";
import { desfechoDaConclusao } from "./regras/conclusao";
import type { AcoesDaTarefa } from "./executor";

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
 * RESULTADO OBRIGATÓRIO — e os DOIS CAMINHOS NÃO SÃO GUARDADOS PELAS MESMAS TRAVAS.
 * (correção de 22/08: este bloco afirmava "o botão não habilita em branco, e a porta recusa de
 * novo", sem distinguir os caminhos. A frase era verdadeira no caminho COM lead e falsa no da
 * tarefa órfã — que é justamente o caso novo que esta tela criou. Comentário que mente sobre a
 * própria guarda é pior que comentário nenhum, porque a próxima pessoa confia nele.)
 *
 * Motivo de tudo isso: §4.1.2 do benchmark — no Kommo só 29,1% das tarefas concluídas dizem o
 * que aconteceu, porque a obrigação vivia no formulário e mais nada.
 *
 * · CAMINHO COM LEAD (`concluirTarefaLead`) — três travas, e as três independentes:
 *     1. a UI: `desfechoDaConclusao` recusa em branco antes de chamar a ação;
 *     2. a AÇÃO: `if (!desfecho) return {ok:false}` em app/(app)/lead/actions.ts:152;
 *     3. a PORTA: migration 0037 levanta `check_violation` — "tarefa_concluida exige resultado
 *        não-vazio no payload (o desfecho é o dado, não o fechamento)".
 *
 * · CAMINHO DA TAREFA ÓRFÃ (`concluirTarefaNotificacao`) — UMA trava, a da UI.
 *     A porta EXIGE o resultado do mesmo jeito, mas nunca chega a ver o vazio: a ação faz
 *     `resultado.trim() || "concluída"` (app/(app)/notificacoes/actions.ts:133) e preenche por
 *     conta própria. Uma chamada com o campo vazio não é recusada — ela GRAVA no ledger um
 *     `resultado: "concluída"`, que é o mesmo nada dos 70,9% do Kommo, agora com carimbo de
 *     evento imutável.
 *
 * O QUE ESTA FRENTE FEZ: tirou a regra de dentro do componente para
 * `components/tarefas/regras/conclusao.ts`, onde ela é executada por teste
 * (tests/tarefa-conclusao-desfecho.test.ts) em vez de depender de um atributo `disabled`. Os dois
 * caminhos passam por ela — a órfã não alcança o default da ação por este botão.
 *
 * ⚠️ DÍVIDA DECLARADA (fora do alcance desta frente): o default mora em
 * `app/(app)/notificacoes/actions.ts:133` e não é meu arquivo nesta rodada. Ele não tem chamador
 * que precise dele — `components/notificacoes/item.tsx:117`, o botão do sino, passa a string
 * "concluída" LITERAL. Ou seja: trocar `resultado.trim() || "concluída"` por a mesma recusa do
 * caminho do lead não quebra nenhum chamador de hoje, e devolve a terceira trava à tarefa órfã.
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
  executor,
  autoFocus = true,
}: {
  /** null = tarefa sem lead; cai na ação sem âncora de lead (ver bloco no topo). */
  leadId: string | null;
  tarefaId: string;
  aoSucesso: () => void;
  onFechar: () => void;
  /** W-D5 · quem escreve (executor.ts). Ausente = as duas ações de sempre, escolhidas pelo lead_id. */
  executor?: AcoesDaTarefa;
  autoFocus?: boolean;
}) {
  const [resultado, setResultado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pode = desfechoDaConclusao(resultado).ok && !ocupado;

  async function concluir() {
    if (ocupado) return;
    // a MESMA regra do `disabled`, chamada de novo aqui: o Enter do campo entra por este caminho
    // sem passar pelo botão, e `disabled` não é guarda — é aparência.
    const d = desfechoDaConclusao(resultado);
    if (!d.ok) {
      setErro(d.motivo);
      return;
    }
    setOcupado(true);
    setErro(null);
    const r = executor?.concluir
      ? await executor.concluir(d.desfecho)
      : leadId
        ? await concluirTarefaLead(leadId, tarefaId, d.desfecho)
        : await concluirTarefaNotificacao(tarefaId, d.desfecho);
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
          autoFocus={autoFocus}
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

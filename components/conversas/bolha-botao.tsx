import type { Mensagem } from "@/lib/dados/conversas";

/*
 * Bolha de BOTÃO RECEBIDO (E3) — a paciente não digitou, ela tocou numa resposta rápida.
 *
 * Antes disto a mensagem caía no fallback genérico de mídia e a tela escrevia `Mensagem (botao)`
 * com ÍCONE DE FOTO. São 190 delas em produção, a última de hoje: `SIM`, `PREÇO`, `ONDE FICA`,
 * `QUERO SABER MAIS`. O dado sempre esteve certo; só o desenho não existia.
 *
 * DECISÕES QUE NÃO SÃO ESTILO:
 *
 * 1. NÃO é um <button>, e não pode parecer um. Isto é o REGISTRO de um toque que já aconteceu, do
 *    outro lado, no celular dela. Um elemento clicável aqui prometeria uma ação que não existe —
 *    e, pior, convidaria a Sara a clicar no meio de uma conversa. Daí `span`, sem hover, sem
 *    sombra, `cursor-default`.
 *
 * 2. O `laranja` fica de fora. Na casa ele é reservado a ação primária e foco; usá-lo aqui faria
 *    um registro passado virar a coisa mais clicável da tela. A pastilha usa `bg-hover` (#EAE9E3),
 *    que já é o token de mudança de superfície — nenhum token novo entra por causa desta bolha.
 *
 * 3. O rótulo vai COMO VEIO, em caixa alta. É a resposta da paciente e é fato; normalizar para
 *    caber no meu gosto tipográfico seria editar o dado.
 *
 * 4. O significado inteiro mora no `aria-label`, não numa legenda. O glifo diz "foi um toque" para
 *    quem vê; quem não vê recebe a frase completa. Uma terceira linha de texto dizendo o mesmo
 *    seria o acessório a mais.
 */

export function BolhaBotao({ m }: { m: Mensagem }) {
  const rotulo = m.corpo!.trim();
  return (
    <span
      role="img"
      aria-label={`Botão tocado: ${rotulo}`}
      className="inline-flex cursor-default select-none items-start gap-1.5 rounded-2xl bg-hover px-2.5 py-1 text-[0.82rem] font-medium leading-snug text-tinta"
    >
      {/* glifo de toque — decorativo, o sentido está no aria-label acima */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-[0.15rem] h-3.5 w-3.5 shrink-0 stroke-suave"
      >
        <path d="M9 11.5V5.5a1.5 1.5 0 0 1 3 0v5" />
        <path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v1.5" />
        <path d="M15 10.5V10a1.5 1.5 0 0 1 3 0v5a5 5 0 0 1-5 5h-1.6a4 4 0 0 1-3.1-1.48l-2.9-3.6a1.5 1.5 0 0 1 2.2-2l1.4 1.38" />
      </svg>
      {rotulo}
    </span>
  );
}

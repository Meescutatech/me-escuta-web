/**
 * QUAL BUILD ESTA NO AR — o carimbo de versao do front.
 *
 * Por que existe (medido em 22/08): producao esta fria desde 20-21/07 e NAO HA como saber, olhando
 * o app, qual commit esta servindo. `/health` do runtime nao diz SHA e a Vercel tampouco. O efeito
 * pratico e que todo problema do dia vira uma discussao sobre "sera que o deploy pegou?" em vez de
 * uma discussao sobre o problema. Na terca, com gente de verdade usando, isso custa a sessao.
 *
 * O valor entra em build time por `next.config.mjs` (NEXT_PUBLIC_SHA / NEXT_PUBLIC_AMBIENTE, lidos
 * de VERCEL_GIT_COMMIT_SHA e VERCEL_ENV). Fora da Vercel resolve pra "local" — e "local" aparecendo
 * em producao E a informacao util: quer dizer que o build nao veio da esteira.
 *
 * Discreto de proposito: 10px, mono, cinza, `pointer-events-none` pra nunca roubar um clique de
 * nada que esteja embaixo, e `select-none` pra nao entrar em copia de texto.
 */
const SHA = process.env.NEXT_PUBLIC_SHA ?? "local";
const AMBIENTE = process.env.NEXT_PUBLIC_AMBIENTE ?? "local";

/** Texto puro do carimbo — reaproveitado por quem quiser mostrar em outro canto. */
export const carimboBuild = AMBIENTE === "production" ? SHA : `${SHA} · ${AMBIENTE}`;

/** Carimbo fixo no rodape do shell autenticado. */
export function MarcaBuild() {
  return (
    <div
      // `fixed` no canto inferior direito: e o unico canto do shell que nenhuma das telas de altura
      // cheia (/funil, /conversas, /tarefas) usa pra acao. pointer-events-none garante que, mesmo
      // se um dia usar, o carimbo nao intercepta.
      className="pointer-events-none fixed bottom-1 right-2 z-10 select-none font-mono text-[10px] leading-none text-mute"
    >
      {/* Sem aria-hidden: quando alguem no suporte pergunta "que versao voce esta vendo?", quem usa
          leitor de tela precisa conseguir responder igual a todo mundo. */}
      <span className="sr-only">Build do front: </span>
      {carimboBuild}
    </div>
  );
}

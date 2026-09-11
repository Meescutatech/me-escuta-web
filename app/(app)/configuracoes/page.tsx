import { redirect } from "next/navigation";

/**
 * `/configuracoes` NÃO é uma tela — redireciona para Membros.
 *
 * O hub-índice morreu em 11/09 (Diogo, 22:50: "muda, troca tudo"): ele repetia em cards o que a
 * nav já diz em linhas, e o estado de cada seção, que era a única informação que ele acrescentava,
 * passou para a própria nav. Medido: nem o Twenty nem o LiderHub têm índice de configurações —
 * lá `/settings` também cai numa tela de verdade (o Perfil).
 */
export default function ConfiguracoesIndex() {
  redirect("/configuracoes/membros");
}

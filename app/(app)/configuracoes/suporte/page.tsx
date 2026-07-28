import { permanentRedirect } from "next/navigation";

/**
 * M5 (R18) · o suporte MUDOU de endereço: `/configuracoes/suporte` → `/suporte`.
 *
 * Esta rota não some — ela redireciona, e o redirect entra NO MESMO commit que move a tela. Link
 * de chamado já compartilhado (num grupo, num e-mail, colado numa tarefa) não pode quebrar porque
 * a navegação foi reorganizada: quem clica quer o chamado, não a rota.
 *
 * `permanentRedirect` (308) e não `redirect` (307), de propósito: a mudança é definitiva, o método
 * é preservado, e o navegador e os buscadores param de perguntar.
 */
export default function SuporteMudouDeEndereco(): never {
  permanentRedirect("/suporte");
}

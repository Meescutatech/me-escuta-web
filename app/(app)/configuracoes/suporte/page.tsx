import { headers } from "next/headers";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { lerTickets } from "@/components/suporte/dados/suporte";
import { ListaRelatos } from "@/components/suporte/lista-relatos";

export const dynamic = "force-dynamic";

/**
 * F12 · /configuracoes/suporte.
 *
 * A rota de origem do relato é a que o usuário VEIO, não esta — quem abre o formulário daqui está
 * relatando algo de outra tela. O `referer` é a melhor aproximação disponível no servidor; quando
 * o gatilho global entrar (sidebar), ele passa a rota real e este palpite deixa de ser usado.
 */
export default async function SuportePage() {
  const [papel, lidos] = await Promise.all([lerPapelAtual(), lerTickets()]);
  const ref = headers().get("referer") ?? "";
  let rota = "/configuracoes/suporte";
  try {
    if (ref) rota = new URL(ref).pathname;
  } catch {
    /* referer ilegível: fica a própria rota, que é honesto */
  }

  return (
    <ListaRelatos
      tickets={lidos.tickets}
      meuPapel={papel}
      indisponivel={lidos.indisponivel}
      rotaAtual={rota}
    />
  );
}

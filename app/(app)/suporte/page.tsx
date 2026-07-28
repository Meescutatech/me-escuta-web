import { headers } from "next/headers";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { lerTickets } from "@/components/suporte/dados/suporte";
import { ListaRelatos } from "@/components/suporte/lista-relatos";
import { normalizarRota } from "@/components/suporte/regras/suporte.ts";

export const dynamic = "force-dynamic";

/**
 * M5 · `/suporte` — a lista de chamados, em rota de PRIMEIRO NÍVEL.
 *
 * A ROTA DE ORIGEM DO RELATO É A QUE O USUÁRIO VEIO, não esta: quem abre o formulário daqui está
 * relatando algo de outra tela, e `onde` é o campo mais útil de um relato de bug.
 *
 * Antes isto era um PALPITE por `headers().get('referer')`, e o próprio arquivo dizia que o
 * palpite morreria "quando o gatilho global entrar (sidebar)". O gatilho global nunca entrou — e
 * medindo, descobri que ele nunca foi necessário: a sidebar JÁ é client component e JÁ tem a rota
 * em mão (`usePathname`, 41 linhas acima do item de suporte). Ela passa `?de=<rota>`, e o palpite
 * vira fallback em vez de fonte. Foi assim que a dependência do M6 dissolveu (E-066).
 *
 * Ordem de confiança, e ela importa: `?de=` é a rota REAL, dita por quem estava lá. O `referer` é
 * inferência — sobrevive porque quem chega por link colado não tem `?de=`, e uma rota inferida é
 * melhor que nenhuma. O que não vale é a inferência ganhar do dado.
 *
 * E o fallback do fallback mudou: antes, sem `referer`, gravava-se `/configuracoes/suporte` — ou
 * seja, o relato dizia ter nascido na própria tela de suporte, que é o único lugar onde ele
 * seguramente NÃO nasceu. Vazio é honesto; rota errada é pior que rota ausente.
 */
export default async function SuportePage({
  searchParams,
}: {
  searchParams?: { de?: string };
}) {
  const [papel, lidos] = await Promise.all([lerPapelAtual(), lerTickets()]);

  let rota = normalizarRota(searchParams?.de ?? "");
  if (!rota) {
    const ref = headers().get("referer") ?? "";
    try {
      if (ref) rota = normalizarRota(new URL(ref).pathname);
    } catch {
      /* referer ilegível: fica vazio, e vazio é honesto */
    }
  }
  if (rota === "/suporte") rota = "";

  return (
    <ListaRelatos
      tickets={lidos.tickets}
      meuPapel={papel}
      indisponivel={lidos.indisponivel}
      rotaAtual={rota}
    />
  );
}

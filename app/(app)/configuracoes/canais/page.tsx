import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { lerCanais } from "@/components/configuracoes/dados/canais";
import { lerSessao } from "@/components/configuracoes/dados/lite-sessao";
import { TabelaCanais, type CanalNaTela } from "@/components/configuracoes/tabela-canais";

export const dynamic = "force-dynamic";

/**
 * F9 · /configuracoes/canais — servidor sem lógica: papel + canais + estado de sessão dos não
 * oficiais, em paralelo, e o resto é do componente.
 *
 * O gate do F8 chega por ENV, não por heurística. Quem sabe se o F8 está em produção e verificado
 * por V8 é o Estaleiro; inventar aqui um "parece pronto" seria o jeito mais fácil de destravar o
 * pareamento de um número pessoal sem ninguém ter verificado nada. Sem a variável, o portão fica
 * FECHADO — o default é o lado seguro.
 */
export default async function CanaisPage() {
  const [papel, lidos] = await Promise.all([lerPapelAtual(), lerCanais()]);

  const canais: CanalNaTela[] = await Promise.all(
    lidos.canais.map(async (c) => {
      if (c.provedor !== "nao_oficial") return c;
      const { sessao } = await lerSessao(c.canal_id);
      return { ...c, sessao: sessao ? { status: sessao.status, viva: false } : null };
    }),
  );

  return (
    <TabelaCanais
      canais={canais}
      meuPapel={papel}
      indisponivel={lidos.indisponivel}
      f8Pronto={process.env.F8_EM_PRODUCAO === "sim"}
    />
  );
}

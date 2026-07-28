import { criarClienteServidor } from "@/lib/supabase/server";
import {
  lerCoberturaDePara,
  lerElegiveisVinculo,
  lerIdentidadesExternas,
  type CoberturaDePara,
  type LinhaDePara,
} from "@/lib/dados/identidades";
import { TabelaIdentidades } from "@/components/identidades/tabela-identidades";

export const dynamic = "force-dynamic";

/**
 * Configurações > Identidades externas (R18 · M3).
 *
 * A rota é `identidades`, não `kommo`: o ID do Kommo vira ORIGEM HISTÓRICA e a tabela por trás é
 * genérica por entidade, para receber leads, conversas e campos quando a migração continuar
 * (D3-dado). Uma rota `/configuracoes/kommo` teria de ser renomeada no desligamento, e rota
 * renomeada quebra link salvo.
 *
 * FALHA DE CARGA NÃO PODE VIRAR "NADA A DECIDIR". As três leituras são independentes e cada uma
 * degrada para o seu próprio estado honesto — em especial a cobertura, que só libera o passo
 * irreversível quando ela FOI LIDA e fecha.
 */
export default async function IdentidadesPage() {
  const supabase = criarClienteServidor();

  const [{ data: papel }, linhasRes, coberturaRes, elegiveisRes] = await Promise.all([
    supabase.schema("api").rpc("papel_atual"),
    lerIdentidadesExternas().catch(() => null),
    lerCoberturaDePara(),
    lerElegiveisVinculo().catch(() => null),
  ]);

  // `null` = falha de leitura. `[]` = leu e não há nada. São telas diferentes, e confundi-las aqui
  // custaria caro: "nenhum identificador pendente" diante de um erro convidaria alguém a concluir
  // que o de-para está completo.
  if (linhasRes === null) {
    return (
      <section>
        <h1>Identidades externas</h1>
        <p role="alert">
          <strong>Não foi possível ler o de-para.</strong> Isto não quer dizer que não haja nada a
          decidir — quer dizer que não sabemos. Recarregue; se persistir, é falha de leitura, não
          ausência de pendência.
        </p>
      </section>
    );
  }

  const cobertura: CoberturaDePara = coberturaRes;
  const linhas: LinhaDePara[] = linhasRes;

  return (
    <TabelaIdentidades
      meuPapel={(papel as string | null) ?? null}
      linhas={linhas}
      cobertura={cobertura}
      // lista vazia é estado de negócio (hoje: zero membros ativos); falha de leitura vira lista
      // vazia com o aviso do componente — que já distingue "ninguém para vincular" de erro.
      elegiveis={elegiveisRes ?? []}
    />
  );
}

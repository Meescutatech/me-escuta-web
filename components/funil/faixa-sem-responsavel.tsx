import type { LeadsSemResponsavel } from "@/lib/dados/identidades";

/**
 * Faixa "Sem responsável" do /funil (R18 · M3).
 *
 * POR QUE FAIXA E NÃO FILTRO — e é a diferença que decide se o item foi entregue: já existe
 * `SEM_RESPONSAVEL = "__sem__"` em `funil-filtros.ts` e um `opcoesResponsavel()`. Aquilo é o
 * FILTRO do painel, e filtro depende de alguém lembrar de ligá-lo. Esta faixa é VISÍVEL SEM
 * NINGUÉM LIGAR NADA. Reusar a constante é certo; confundir os dois conceitos entrega um filtro
 * onde se pediu um alarme.
 *
 * TRÊS ESTADOS, e nenhum deles é "não mostrar":
 *   · não lido  — a contagem falhou. Dizer isso é obrigatório: faixa ausente lê-se como zero.
 *   · zero      — hoje é A RESPOSTA CORRETA para "Meus leads" (dono_id nulo em 680 de 680), e
 *                 precisa ser EXPLICADO, não em branco. Vazio sem explicação vira ticket de bug.
 *   · > 0       — com o caminho de saída de CADA categoria, que são diferentes.
 */
export function FaixaSemResponsavel({ dados }: { dados: LeadsSemResponsavel }) {
  if (!dados.lido) {
    return (
      <div role="alert">
        <strong>Não foi possível contar os leads sem responsável.</strong> Isto não quer dizer que
        não haja nenhum.
      </div>
    );
  }

  if (dados.orfaos === 0 && dados.aguardandoDePara === 0) {
    return <div>Todo lead do funil tem responsável.</div>;
  }

  return (
    <div>
      {dados.orfaos > 0 ? (
        <p>
          <strong>{dados.orfaos} lead(s) sem responsável.</strong> Nasceram sem dono porque não
          havia ninguém lotado no departamento de entrada quando entraram. Saída: convidar e lotar
          em <a href="/configuracoes/membros">Membros</a>, ou atribuir à mão pelo card.
        </p>
      ) : null}

      {dados.aguardandoDePara > 0 ? (
        <p>
          <strong>{dados.aguardandoDePara} lead(s) aguardando o de-para.</strong> Estes{" "}
          <em>têm</em> dono conhecido — o responsável que eles tinham no Kommo —, só não traduzido
          para uma conta daqui. Não são órfãos, e atribuí-los à mão apagaria a procedência. Saída:{" "}
          <a href="/configuracoes/identidades">Identidades externas</a>.
        </p>
      ) : null}
    </div>
  );
}

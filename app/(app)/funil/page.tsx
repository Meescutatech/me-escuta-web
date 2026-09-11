import { lerFunil } from "@/lib/dados/funil";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Quadro } from "@/components/funil/quadro";
import { lerLeadsSemResponsavel } from "@/lib/dados/identidades";
import { lerMotivosPerda } from "@/lib/dados/motivo-perda";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarFunilEnsaio } from "@/lib/ensaio/fixtures/conversas";
import { mencionaveisEnsaio } from "@/lib/ensaio/fixtures/mencionaveis";
// W-D6: cidade, audiometria, departamento e PRÓXIMA TAREFA dos 40 leads + painel/conversa por lead
// para o drawer não ir ao banco em ensaio. `proximaTarefaDoLead` é stub do helper do W-D5.
import { enriquecerCardsEnsaio, ensaioDoFunil } from "@/lib/ensaio/funil-extra";
import { TIPOS_TAREFA_SEMENTE } from "@/lib/tarefa-tipos";

// Sempre lê o estado atual do funil (sem cache) — projeção do ledger.
export const dynamic = "force-dynamic";

export default async function FunilPage({
  searchParams,
}: {
  searchParams: { lead?: string; aba?: string };
}) {
  // W-D2 · modo ensaio: os 40 leads da fixture, zero leitura.
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agora = new Date();
    const motivos = await lerMotivosPerda(); // degrada para a semente embutida (cliente sem banco)
    const base = gerarFunilEnsaio(agora);
    const cards = enriquecerCardsEnsaio(base.cards, agora);
    return (
      <Quadro
        dados={{ ...base, cards }}
        geradoEm={agora.toISOString()}
        abrirLead={searchParams.lead ?? null}
        abaInicial={searchParams.aba ?? null}
        autorEmail={ensaio.email}
        autorId={ensaio.id}
        papel={ensaio.papel}
        mencionaveis={mencionaveisEnsaio(agora)}
        tiposTarefa={TIPOS_TAREFA_SEMENTE}
        motivosPerda={motivos.motivos}
        motivosDaConfig={motivos.daConfig}
        semResponsavel={{ orfaos: 9, aguardandoDePara: 0, lido: true }}
        ensaio={ensaioDoFunil(cards, agora)}
      />
    );
  }
  // board + autor exibido no drawer (o ator real é carimbado pela porta) + lista do `@` e
  // tipos de tarefa (R13 / Bloco C) em paralelo — o drawer é o caminho de criação a partir do
  // funil, e nada disto depende do funil (getUser vai à rede)
  const supabase = criarClienteServidor();
  const [dados, userRes, mencionaveis, tipos, semResponsavel, motivos] = await Promise.all([
    lerFunil(),
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
    // R18/M3: é ALARME, não filtro — visível sem ninguém ligar nada. F5: virou chip no cabeçalho do board.
    lerLeadsSemResponsavel(),
    // R20: vocabulário de motivo de perda (config `motivo_perda`; degrau para a semente embutida)
    lerMotivosPerda(),
  ]);
  const user = userRes.data.user;

  return (
    <Quadro
      dados={dados}
      geradoEm={new Date().toISOString()}
      abrirLead={searchParams.lead ?? null}
      abaInicial={searchParams.aba ?? null}
      autorEmail={user?.email ?? null}
      autorId={user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
      motivosPerda={motivos.motivos}
      motivosDaConfig={motivos.daConfig}
      semResponsavel={semResponsavel}
    />
  );
}

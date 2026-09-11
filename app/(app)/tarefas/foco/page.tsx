import { lerVisaoTarefas } from "@/lib/dados/tarefas-visao";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerEmAndamento } from "@/lib/tarefas/andamento";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { mencionaveisEnsaio } from "@/lib/ensaio/fixtures/mencionaveis";
import { TIPOS_TAREFA_SEMENTE } from "@/lib/tarefa-tipos";
import { visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";
import { tarefasAceitasComoVisao } from "@/lib/ensaio/conversas-extra";
import { comResumosDeEnsaio, contextoFocoEnsaio } from "@/lib/ensaio/tarefas-foco";
import { lerEstadoTarefasEnsaio } from "@/lib/ensaio/tarefas-sessao";
import { tarefaDoCookie } from "@/lib/tarefas/sessao-foco";
import { ModoFoco } from "@/components/tarefas/modo-foco";

/**
 * `/tarefas/foco` — o MODO FOCO (W-T, 10/09/2026 noite).
 *
 * Rota própria, e não um estado de `/tarefas`, por três motivos medidos nesta sessão: (1) a
 * tela é de largura cheia e sem lista, então metade do que `/tarefas` monta seria montado para
 * ficar escondido; (2) a fila congelada precisa sobreviver a um F5 (é o "3 de 12"), e uma URL é
 * o lugar natural de "estou no meio de um percurso"; (3) o percurso dentro da lista (`?foco=`)
 * continua existindo para quem chega por link — os dois convivem sem um ser modo do outro.
 *
 * O que muda entre ensaio e produção é só a origem do dado. Em produção a coluna da direita não
 * tem fio (`contexto` vazio): a leitura de `core.v_mensagem` por conversa ancorada ainda não é
 * feita aqui, e a tela DIZ isso em vez de desenhar um fio vazio fingindo conversa fria.
 */
export const dynamic = "force-dynamic";

export default async function FocoPage() {
  const ensaio = lerSessaoEnsaio();

  if (ensaio) {
    const agora = new Date();
    const { emAndamento: _ignorado, ...fixture } = visaoTarefasDeEnsaio(agora, { leadsDoFunil: true });
    const aceitas = tarefasAceitasComoVisao(undefined, agora);
    const idsAceitas = new Set(aceitas.map((t) => t.id));
    const estadoCookie = lerEstadoTarefasEnsaio();
    const mencionaveis = mencionaveisEnsaio(agora);
    const nomes = new Map(mencionaveis.map((m) => [m.id, m.nome]));
    const doCookie = estadoCookie.criadas.map((c) => tarefaDoCookie(c, nomes));

    // a fila do foco é "minhas abertas do dia": o recorte é feito no cliente (filaDoFoco), mas o
    // dono já vem filtrado aqui — o modo foco é sempre em primeira pessoa.
    const todas = comResumosDeEnsaio(
      [...aceitas, ...fixture.tarefas.filter((t) => !idsAceitas.has(t.id)), ...doCookie].filter((t) => t.responsavel_id === ensaio.id),
      agora,
    );

    return (
      <ModoFoco
        dados={{
          tarefas: todas,
          meuId: ensaio.id,
          mencionaveis,
          tiposTarefa: TIPOS_TAREFA_SEMENTE,
          contexto: contextoFocoEnsaio(todas, agora),
          ensaio: true,
          estadoCookie,
          podeIniciar: true,
        }}
      />
    );
  }

  const supabase = criarClienteServidor();
  const [dados, userRes, mencionaveis, tipos, emAndamento] = await Promise.all([
    lerVisaoTarefas(),
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
    lerEmAndamento(),
  ]);
  const meuId = userRes.data.user?.id ?? null;

  return (
    <ModoFoco
      dados={{
        tarefas: dados.tarefas.filter((t) => meuId != null && t.responsavel_id === meuId),
        meuId,
        mencionaveis,
        tiposTarefa: tipos.tipos,
        // a leitura do fio por tarefa ainda não existe neste caminho — a coluna da direita diz isso
        contexto: {},
        ensaio: false,
        estadoCookie: null,
        podeIniciar: emAndamento.disponivel,
      }}
    />
  );
}

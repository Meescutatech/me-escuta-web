import { lerVisaoTarefas } from "@/lib/dados/tarefas-visao";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { parseFiltros } from "@/lib/dados/tarefas-visao-calculos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { VisaoTarefas } from "@/components/tarefas/visao-tarefas";
import { lerEmAndamento } from "@/lib/tarefas/andamento";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { mencionaveisEnsaio } from "@/lib/ensaio/fixtures/mencionaveis";
import { TIPOS_TAREFA_SEMENTE } from "@/lib/tarefa-tipos";
import { visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";
import { propostasDeEnsaio } from "@/lib/dados/tarefas-ensaio-dia";
import { tarefasAceitasComoVisao } from "@/lib/ensaio/conversas-extra";

// Sempre lê o estado atual — projeção do ledger, nunca cache.
export const dynamic = "force-dynamic";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // W-D2 · modo ensaio: a fixture de /tarefas já existia (NEXT_PUBLIC_TAREFAS_ENSAIO); o que
  // vazava eram as leituras ao redor (getUser, mencionáveis, tipos, em-andamento).
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agora = new Date();
    // W-D5: `leadsDoFunil` — no ensaio sem banco a conversa que existe é a da fixture do funil
    const { emAndamento, ...fixture } = visaoTarefasDeEnsaio(agora, { leadsDoFunil: true });
    // W-D3: a tarefa que a Sara ACEITOU da nota do Jarvis no fio (/conversas) entra na fila —
    // vem do cookie do ensaio, com o id que o toast "ver em /tarefas" já linka (#tarefa-<id>).
    // Sem duplicar: se um id já veio do fio, a fixture não o repete.
    const aceitas = tarefasAceitasComoVisao(undefined, agora);
    const idsAceitas = new Set(aceitas.map((t) => t.id));
    const dados = { ...fixture, tarefas: [...aceitas, ...fixture.tarefas.filter((t) => !idsAceitas.has(t.id))] };
    const ver = Array.isArray(searchParams.ver) ? searchParams.ver[0] : searchParams.ver;
    const foco = Array.isArray(searchParams.foco) ? searchParams.foco[0] : searchParams.foco;
    // W-D5 · a SDR entra pela view do dia (benchmark §4 item 7: "redirect pós-login para SDR").
    // Só quando a URL não pede nada: `?ver=`, `?minhas=` etc. vencem. Admin/owner entram no
    // "Do time" de sempre — o dia deles não é uma fila, é o time.
    const semPedido = Object.keys(searchParams).filter((k) => k !== "como").length === 0;
    const filtros = parseFiltros(searchParams);
    const filtrosIniciais = semPedido && ensaio.papel === "membro" ? { ...filtros, exibicao: "hoje" as const, minhas: true } : filtros;
    return (
      <VisaoTarefas
        dados={dados}
        filtrosIniciais={filtrosIniciais}
        meuId={ensaio.id}
        mencionaveis={mencionaveisEnsaio(agora)}
        tiposTarefa={TIPOS_TAREFA_SEMENTE}
        emAndamento={{ ids: emAndamento, disponivel: true }}
        quadroInicial={ver === "quadro"}
        propostas={propostasDeEnsaio(agora)}
        focoInicial={foco ?? null}
        ensaio
      />
    );
  }

  // tarefas (v_tarefa, RLS) + usuário ("minhas tarefas") + membros e tipos (filtros/rótulos)
  const supabase = criarClienteServidor();
  const [dados, userRes, mencionaveis, tipos, emAndamento] = await Promise.all([
    lerVisaoTarefas(),
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
    lerEmAndamento(), // F8: degrada honesto sem a 0305 (conjunto vazio, disponivel=false)
  ]);
  const ver = Array.isArray(searchParams.ver) ? searchParams.ver[0] : searchParams.ver;
  const foco = Array.isArray(searchParams.foco) ? searchParams.foco[0] : searchParams.foco;

  return (
    <VisaoTarefas
      dados={dados}
      filtrosIniciais={parseFiltros(searchParams)}
      meuId={userRes.data.user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
      emAndamento={emAndamento}
      quadroInicial={ver === "quadro"}
      // W-D5: propostas do Jarvis (core.sugestao_ia, tipo tarefa, pendente) — a LEITURA ainda
      // não existe neste caminho; a tela sabe desenhar e decidir, o banco ainda não é lido.
      propostas={[]}
      focoInicial={foco ?? null}
    />
  );
}

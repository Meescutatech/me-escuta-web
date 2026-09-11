import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerContadoresSidebar } from "@/lib/dados/sidebar";
import { lerNotificacoes } from "@/lib/dados/notificacoes";
import { lerEstadoEscopo } from "@/lib/dados/departamentos";
import { contarNaoLidasPorArea } from "@/lib/dados/conversas";
import { lerNomeMembro } from "@/lib/dados/templates";
import { lerPapelAtual, podeVerMarketing } from "@/components/configuracoes/dados/porta";
import { chavesComPendencia } from "@/lib/departamentos/escopo";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { PresencaBatimento } from "@/components/presenca-batimento";
import { MarcaBuild } from "@/components/ui/marca-build";
import { lerSessaoEnsaio, estadoEscopoEnsaio } from "@/lib/ensaio/sessao";
import { PESSOAS } from "@/lib/ensaio/modo";
import { gerarConversasEnsaio, conversasVisiveisPara, gerarLeadsEnsaio } from "@/lib/ensaio/fixtures/conversas";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { VerComo } from "@/components/ensaio/ver-como";
import { Toaster } from "@/components/ui/sonner";

/**
 * Shell autenticado (r9): SIDEBAR de ícones retrátil — colapsada (60px) por padrão, expande no
 * hover em overlay. O main tem margem FIXA de 60px: o conteúdo nunca pula quando a sidebar abre.
 * Sem sessão → /login (defesa além do middleware).
 *
 * M6/R18 — O HEADER MORA AQUI, e com ele o ESCOPO DE DEPARTAMENTO.
 *
 * O sino saiu do `fixed right-4 top-2.5` e virou filho do header: o app passa a ter a barra de topo
 * compartilhada que este comentário declarava não existir. Ele não foi reescrito — foi movido.
 *
 * E este é o arquivo onde o escopo é LIDO NO SERVIDOR. A asserção (i) do C9 mede exatamente isto
 * (`cookies()` em `app/(app)/layout.tsx` ou em `lib/dados`), e ela nascia VERMELHA de propósito:
 * escopo lido no servidor e filtro aplicado no navegador são visualmente idênticos, e a única coisa
 * que os separa é o que viaja no HTML.
 *
 * CUSTO DECLARADO, porque leitura no layout é leitura em TODA tela: o header acrescenta duas —
 * `lerEstadoEscopo` (as views do M8) e `contarNaoLidasPorArea` (o ponto de pendência). O
 * `PLANO-TECNICO-M6.md` §5.3 previa "zero consulta a mais" para o ponto, e estava errado; o porquê
 * está no cabeçalho de `contarNaoLidasPorArea`.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // W-D2 · MODO ENSAIO: sessão da fixture, ZERO consulta ao Supabase. `lerSessaoEnsaio` só devolve
  // pessoa com `NEXT_PUBLIC_ENSAIO=1` E `NODE_ENV !== "production"` — fora disso é `null` e o
  // caminho real abaixo segue inalterado.
  const ensaio = lerSessaoEnsaio();
  if (ensaio) return <AppLayoutEnsaio pessoa={ensaio}>{children}</AppLayoutEnsaio>;

  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // O escopo vem ANTES dos contadores porque um deles depende dele: `naoLidas` aponta para
  // /conversas, que é a tela escopada. Os outros dois não — e essa incoerência é a certa
  // (o porquê está em `lib/dados/sidebar.ts`).
  const escopoEstado = await lerEstadoEscopo();

  const [contadores, notificacoes, porArea, nome, papel] = await Promise.all([
    lerContadoresSidebar(escopoEstado.escopo),
    lerNotificacoes(),
    contarNaoLidasPorArea(),
    lerNomeMembro(user.id),
    lerPapelAtual(),
  ]);

  // Falha na leitura por área devolve `null`, e `null` vira NENHUM ponto — nunca um ponto inventado.
  // "Não sei se tem pendência" e "não tem pendência" caem no mesmo lugar de propósito: o ponto é um
  // convite a olhar, e convite falso custa mais que convite ausente.
  const comPendencia = porArea
    ? chavesComPendencia(escopoEstado.visiveis, escopoEstado.arvore, escopoEstado.sinonimos, porArea)
    : [];

  return (
    <div className="min-h-screen pl-[60px]">
      <Sidebar
        contFunil={contadores.funil}
        contNaoLidas={contadores.naoLidas}
        contVencidas={contadores.tarefasVencidas}
        verMarketing={podeVerMarketing(papel)}
      />
      <Header
        departamentos={escopoEstado.visiveis}
        ativo={escopoEstado.ativo}
        comPendencia={comPendencia}
        escopoIndisponivel={escopoEstado.indisponivel}
        notificacoes={notificacoes.itens}
        notificacoesDisponiveis={notificacoes.disponivel}
        email={user.email ?? "usuario"}
        usuarioId={user.id}
        nome={nome}
        meuPapel={papel}
      />
      {/*
        O SHELL COMPENSA A ALTURA DO HEADER — e é isto que o C5 prova.
        O header é `fixed`, então não ocupa espaço no fluxo: sem este `padding-top`, as telas de
        altura cheia (/conversas, /funil, /tarefas) ganhariam 52px de estouro e a página inteira
        passaria a rolar — barra de rolagem numa tela desenhada para não rolar.
        A alternativa recusada era "o inbox não tem header": header que desaparece na tela mais densa
        faz o sino sumir justamente em /conversas, onde notificação mais importa — e elemento de
        shell que não está em toda tela não é elemento de shell. O custo real é 52px de 900 (≈5,8%),
        e ele vem junto com o pagamento do débito dos 58px.
      */}
      <main className="pt-[var(--altura-topo)]">{children}</main>
      <PresencaBatimento />
      {/*
        CARIMBO DE BUILD (W4, 22/08) — o front passa a dizer qual commit esta no ar.
        Fica no shell porque precisa estar em TODA tela: quem descobre o problema e quem esta
        usando, e a primeira pergunta que se faz e "que versao voce esta vendo?". `pointer-events-
        none` no componente garante que ele nunca intercepte clique de nada que esteja embaixo.
      */}
      <MarcaBuild />
    </div>
  );
}

/**
 * O shell autenticado em MODO ENSAIO — os mesmos `Sidebar` e `Header`, alimentados pela fixture
 * com as MESMAS funções puras de escopo (`visiveisPara`, `chavesComPendencia`). O que muda é só a
 * origem do dado; o que a pessoa vê por papel é o que ela veria em produção.
 */
async function AppLayoutEnsaio({
  pessoa,
  children,
}: {
  pessoa: NonNullable<ReturnType<typeof lerSessaoEnsaio>>;
  children: React.ReactNode;
}) {
  const escopoEstado = estadoEscopoEnsaio(pessoa);
  const agora = new Date();
  const { conversas } = gerarConversasEnsaio(agora);
  const canais = gerarCanaisEnsaio(agora);
  const visiveis = conversasVisiveisPara(pessoa, conversas, escopoEstado.escopo, canais);
  const naoLidas = visiveis.filter((c) => c.nao_lida).length;
  const porArea = new Map<string | null, number>();
  for (const c of conversasVisiveisPara(pessoa, conversas, null, canais)) {
    if (c.nao_lida) porArea.set(c.area ?? null, (porArea.get(c.area ?? null) ?? 0) + 1);
  }
  const comPendencia = chavesComPendencia(escopoEstado.visiveis, escopoEstado.arvore, escopoEstado.sinonimos, porArea);
  const leads = gerarLeadsEnsaio(agora);
  const abertos = leads.filter((l) => !["ganho", "perdido"].includes(l.etapa)).length;

  return (
    <div className="min-h-screen pl-[60px]">
      <Sidebar
        contFunil={abertos}
        contNaoLidas={naoLidas}
        contVencidas={3}
        verMarketing={podeVerMarketing(pessoa.papel)}
      />
      <Header
        departamentos={escopoEstado.visiveis}
        ativo={escopoEstado.ativo}
        comPendencia={comPendencia}
        escopoIndisponivel={false}
        notificacoes={[]}
        notificacoesDisponiveis={false}
        email={pessoa.email}
        usuarioId={pessoa.id}
        nome={pessoa.nome}
        meuPapel={pessoa.papel}
      />
      <main className="pt-[var(--altura-topo)]">{children}</main>
      <VerComo atual={pessoa} pessoas={PESSOAS} />
      <Toaster />
      <MarcaBuild />
    </div>
  );
}

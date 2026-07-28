import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerContadoresSidebar } from "@/lib/dados/sidebar";
import { lerNotificacoes } from "@/lib/dados/notificacoes";
import { lerEstadoEscopo } from "@/lib/dados/departamentos";
import { contarNaoLidasPorArea } from "@/lib/dados/conversas";
import { lerNomeMembro } from "@/lib/dados/templates";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { chavesComPendencia } from "@/lib/departamentos/escopo";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { PresencaBatimento } from "@/components/presenca-batimento";

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
        email={user.email ?? "usuario"}
        contFunil={contadores.funil}
        contNaoLidas={contadores.naoLidas}
        contVencidas={contadores.tarefasVencidas}
      />
      <Header
        departamentos={escopoEstado.visiveis}
        ativo={escopoEstado.ativo}
        comPendencia={comPendencia}
        escopoIndisponivel={escopoEstado.indisponivel}
        notificacoes={notificacoes.itens}
        notificacoesDisponiveis={notificacoes.disponivel}
        email={user.email ?? "usuario"}
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
    </div>
  );
}

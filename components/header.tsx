"use client";

import { ArcoHeader, NuvemJarvis } from "@/components/jarvis/arco-header";
import { usePathname } from "next/navigation";
import { lerTituloDaRota } from "@/lib/header/titulos";
import type { Departamento } from "@/lib/departamentos/escopo";
import type { Notificacao } from "@/lib/notificacoes";
import type { Papel } from "@/components/configuracoes/regras/canais.ts";

/**
 * HEADER DO SISTEMA — o recipiente que o r9 tirou no meio do caminho.
 *
 * Isto não inventa um header: **termina um que existiu e foi removido de propósito.** A topbar
 * interina viveu em `146c69f` (`app/(app)/layout.tsx:30`, `h-[52px]`, hairline embaixo, fundo
 * branco) e o `c0828e2` a removeu ao entregar a sidebar de ícones. O que o r9 tirou de propósito
 * foi a NAVEGAÇÃO, e ela não volta.
 *
 * A REGRA, e é uma regra, não uma lista (§4.1):
 *   **A sidebar responde "para onde eu vou". O header responde "onde eu estou, quem eu sou, e o que
 *   quer a minha atenção".**
 * Se o item é DESTINO — um lugar que existe sempre, igual em qualquer tela — é sidebar. Se é ESTADO
 * DO MOMENTO — muda com a tela, com o que aconteceu ou com quem está logado — é header.
 * D-DESIGN-2 cravou o mesmo: o header é RECIPIENTE, não navegação. **Zero destino de navegação no
 * topo** — as duas exceções (F4, 27/08) são ATOS com contexto, não destinos: o Jarvis sobre a tela
 * atual e, no menu do avatar, Configurações/Sair (identidade é header pela regra acima).
 *
 * ORDEM DA ESQUERDA PARA A DIREITA, e ela resolve um conflito que o D6-b criou (o Diogo pediu o
 * nome do workspace no canto esquerdo, onde a revisão 1 tinha posto o título da página):
 *
 *   │ (sidebar 60px) │ [Comercial ▾] │ Funil de vendas       [◇] [!] [🔔] [SA] │
 *                      └ escopo         └ contexto interno    Jarvis│relatar│sino│eu
 *
 * **Escopo antes de posição.** O departamento é o contexto EXTERNO — determina o CONJUNTO que a
 * tela mostra. O título é o contexto INTERNO — qual recorte desse conjunto estou vendo. Lido da
 * esquerda para a direita dá "Comercial → Funil de vendas", que é a frase verdadeira; o inverso
 * sugeriria que o departamento é atributo do funil, e ele não é: é o escopo.
 *
 * O QUE O HEADER NÃO CARREGA, por decisão:
 *  · navegação de qualquer espécie (C1) · busca global (§8, e é vizinha da recusa explícita de
 *    command palette no benchmark) · breadcrumb · seletor de tema · badge no favicon;
 *  · **a contagem de 405 sugestões pendentes** — D12 mandou `/agentes` para a sidebar e a contagem
 *    para a aba de entrada de lá. ARB-R17-33 continua valendo: **número só entra no header se uma
 *    pessoa conseguir zerá-lo numa sessão.** 405 com 9 dias de idade é mutirão, não sino — e o
 *    produto já sabia disso: *"no Kommo a fila vermelha tinha 755 itens e ninguém olhava"*
 *    (`components/sidebar.tsx:119-120`).
 *
 * ⛔ **`C17-dep` · O RODAPÉ "+ NOVO DEPARTAMENTO" NÃO ENTRA NA v1.** A condição está nas duas specs
 * com o mesmo nome, de propósito, para casar por busca de texto e não por memória de conversa: ele
 * só entra se o **C17 da SPEC-M8** passar — publicar config com `versao_base` defasada TEM de
 * devolver `serialization_failure`, senão a trava otimista nunca foi exercida e o verde é vício.
 * `config_publicada` tem **0 eventos na história** (medido): a trava é ESTREIA. Na R18 o C17 não
 * rodou — e "não rodou" não é "passou" (MÉTODO §10). Ninguém fica sem caminho: criar departamento
 * fica em Configurações → Departamentos, tela do M8, que tem readback próprio. Fica sem ATALHO.
 * Melhor um seletor sem botão do que um botão que perde o trabalho de alguém.
 */
export function Header({
  departamentos,
  ativo,
  comPendencia,
  escopoIndisponivel,
  notificacoes,
  notificacoesDisponiveis,
  email,
  nome,
  meuPapel,
  usuarioId,
}: {
  departamentos: Departamento[];
  ativo: Departamento | null;
  comPendencia: string[];
  escopoIndisponivel: boolean;
  notificacoes: Notificacao[];
  notificacoesDisponiveis: boolean;
  email: string;
  nome: string | null;
  meuPapel: Papel | null;
  usuarioId: string;
}) {
  const pathname = usePathname();
  const titulo = lerTituloDaRota(pathname);

  return (
    <header
      role="banner"
      /* z-40, ABAIXO da sidebar (z-50): a sidebar expande em overlay e DEVE cobrir o header.
         `left-[60px]` é a largura da sidebar colapsada, o mesmo 60 do `pl-[60px]` do shell.
         Altura pelo token `--altura-topo`, em UM lugar só — é o que impede o retorno do 52/58/0. */
      className="fixed inset-x-0 left-[60px] top-0 z-40 flex h-[var(--altura-topo)] items-center gap-4 border-b border-linha bg-branco pl-5 pr-4"
    >
      <div className="flex min-w-0 items-center gap-4">
        {/* CONTEXTO INTERNO. Não é link, não é breadcrumb, e vem de fonte única (lib/header/titulos).
            Único elemento elástico do header: trunca com elipse e nunca quebra em duas linhas —
            duas linhas custariam 104px do inbox, o pior resultado possível. */}
        {titulo && (
          <h1 className="truncate text-[20px] font-[650] tracking-[-0.01em] text-tinta">{titulo}</h1>
        )}

        {/* W-D2 (23:10, Diogo: "tira essa porra de departamentos"): NENHUM recorte de departamento
            no header. O filtro vive só dentro da toolbar da tela que o usa (dashboard tem o dele,
            conversas usa os chips). `departamentos`/`ativo` continuam chegando por prop porque o
            escopo é lido no servidor e outras partes do shell dependem dele — aqui não desenham nada. */}
        {escopoIndisponivel && <span className="sr-only">Departamento indisponível</span>}
      </div>

      {/*
        O ARCO, NO CENTRO — a presença do Jarvis (Diogo, 11/09 16:45). `absolute` + `-translate-x-1/2`
        porque o centro tem de ser o da TELA, não o do espaço que sobra: com `justify-center` num
        flex, o título à esquerda empurraria o arco e ele mudaria de lugar a cada rota. O ponto
        estável é o valor inteiro dele.

        Aqui havia TRÊS botões, e os três saíram: o gatilho que levava para `/jarvis` (ele não é
        mais um destino), o "relatar desta tela" e o SINO. O arco não os esconde — ele os substitui:
        quem nota que algo precisa de atenção é o Jarvis, então o aviso é dele. Sino ao lado seriam
        duas fontes para o mesmo fato, e a segunda envelhece.
      */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="pointer-events-auto">
          <ArcoHeader />
        </div>
      </div>
      <NuvemJarvis />
    </header>
  );
}

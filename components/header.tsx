"use client";

import { usePathname } from "next/navigation";
import { Sino } from "@/components/notificacoes/sino";
import { SeletorDepartamento } from "@/components/header/seletor-departamento";
import { RelatarDestaTela } from "@/components/header/relatar-desta-tela";
import { Identidade } from "@/components/header/identidade";
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
 * topo** — é o que o C1 mede, e é por isso que não há um único `href` neste arquivo.
 *
 * ORDEM DA ESQUERDA PARA A DIREITA, e ela resolve um conflito que o D6-b criou (o Diogo pediu o
 * nome do workspace no canto esquerdo, onde a revisão 1 tinha posto o título da página):
 *
 *   │ (sidebar 60px) │ [Comercial ▾] │ Funil de vendas       [◇] [!] [🔔] [SA] │
 *                      └ escopo         └ contexto interno    Jarvis│suporte│sino│eu
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
        {/* ESCOPO. Três estados, e os três são reais hoje. */}
        {ativo && departamentos.length > 1 && (
          <SeletorDepartamento
            departamentos={departamentos}
            ativo={ativo}
            comPendencia={comPendencia}
          />
        )}
        {ativo && departamentos.length === 1 && (
          /* C11 — UM DEPARTAMENTO SÓ NÃO RENDERIZA SELETOR. Dropdown de uma opção é ruído. Mesma
             posição, mesma tipografia, sem chevron, sem foco, sem nada para abrir. E este é o
             caminho NORMAL, não a exceção: `core.usuario` tem hoje uma conta real ativa e ZERO
             `membro` ativo. */
          <span className="truncate text-[13.5px] font-medium text-tinta">{ativo.rotulo}</span>
        )}
        {escopoIndisponivel && (
          /* Erro de leitura das views do M8: degrada para NADA e o escopo NÃO é aplicado. Nunca um
             rótulo que o servidor não conseguiu validar — rótulo errado é pior que rótulo ausente,
             porque o rótulo do topo é promessa dura. */
          <span className="sr-only">Departamento indisponível</span>
        )}

        {ativo && titulo && <span aria-hidden className="h-4 w-px flex-none bg-linha" />}

        {/* CONTEXTO INTERNO. Não é link, não é breadcrumb, e vem de fonte única (lib/header/titulos).
            Único elemento elástico do header: trunca com elipse e nunca quebra em duas linhas —
            duas linhas custariam 104px do inbox, o pior resultado possível. */}
        {titulo && (
          <h1 className="truncate text-[20px] font-[650] tracking-[-0.01em] text-tinta">{titulo}</h1>
        )}
      </div>

      <div className="ml-auto flex flex-none items-center gap-2">
        {/*
          SLOT DO JARVIS — 32×32 à esquerda do sino, e ele renderiza **NADA**.
          Não é botão desabilitado, não é ícone acinzentado, não é tooltip "em breve": nada focável,
          nada na ordem de Tab. Um affordance morto ensina a pessoa a ignorar aquele canto — e
          depois ela ignora o Jarvis de verdade.
          Está DECLARADO aqui, e não só omitido, porque a largura do agrupamento da direita é orçada
          agora: quando o Jarvis chegar, ninguém re-litiga onde ele vai nem rearruma o header.
          Contrato de quem vier ocupar: um GATILHO ÚNICO que abre a superfície do Jarvis em overlay,
          recebendo `{ rota_atual, entidade_em_foco? }`. Ele NÃO é link para `/jarvis` — `/jarvis`
          continua sendo página (destino) e, pela regra do §4.1, se um dia precisar de entrada de
          menu, a entrada é na SIDEBAR. O que vive aqui é o ATO do Jarvis sobre a tela atual.
        */}
        <span aria-hidden className="h-8 w-8" data-slot="jarvis" />

        <RelatarDestaTela meuPapel={meuPapel} />

        {/* O SINO É O COMPONENTE EXISTENTE, MOVIDO — não reescrito. É o modo de falha mais provável
            desta entrega (alguém redesenha o sino aqui dentro e deixa o antigo morrendo no layout),
            e o C3 vigia isso pelo path do SVG: ele tem de casar com UM arquivo só. */}
        <Sino inicial={notificacoes} disponivel={notificacoesDisponiveis} />

        <Identidade email={email} nome={nome} departamentos={departamentos} />
      </div>
    </header>
  );
}

import { cookies } from "next/headers";
import { COOKIE_DEPARTAMENTO as NOME_COOKIE } from "@/lib/departamentos/cookie";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  escolherAtivo,
  ordenar,
  resolverEscopo,
  visiveisPara,
  type Departamento,
  type Escopo,
  type ParAncestral,
  type Sinonimo,
} from "@/lib/departamentos/escopo";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";

/**
 * LEITURA DO DEPARTAMENTO ATIVO — server-side, e o "server-side" é o item, não um detalhe.
 *
 * O C9 é o único critério da rodada capaz de distinguir ESCOPO de FILTRO DE CLIENTE, e as duas
 * implementações são visualmente idênticas: no filtro de cliente os dados chegam ao navegador e só
 * a renderização os esconde. Num sistema que trata dado clínico e de crédito, isso é inaceitável
 * mesmo com departamento não sendo fronteira de segurança. Por isso tudo aqui roda no servidor, e
 * por isso este arquivo NÃO é `"use client"` — o C9-a(ii) vigia `lib/dados` inteiro contra isso.
 *
 * O M6 não cria nada no banco. Estas quatro views são entregáveis do M8 (SPEC-M8 §4.1 e §4.4); eu
 * sou consumidor. Enquanto elas não existirem, a leitura devolve `null` e o header degrada para
 * rótulo estático SEM aplicar escopo — nunca para um rótulo que ele não conseguiu validar. Rótulo
 * errado é pior que rótulo ausente, porque o rótulo do topo é PROMESSA DURA (D6-f): o que está
 * escrito ali é tudo o que a tela mostra.
 */

/**
 * Onde o departamento ativo mora. Constante de código, não env: é lida em um lugar só, e env aqui
 * seria configuração sem consumidor de configuração.
 *
 * Por que COOKIE, e não storage do navegador (LiderHub) nem a URL (Vercel) — a escolha é EXPLÍCITA,
 * como o benchmark §3-bis.1 exige, e as duas alternativas caíram por MEDIDA, não por gosto:
 *
 *  · storage do navegador não existe no servidor, e as leituras do shell são server-side
 *    (`app/(app)/layout.tsx`). Copiar a LiderHub obrigaria a mover a leitura para o cliente — que é
 *    literalmente transformar escopo em filtro de cliente, o defeito que o C9 existe para pegar.
 *
 *  · A URL como SEDE não funciona porque o header mora no LAYOUT, e no Next 14.2.20 layout não
 *    recebe `searchParams`. Medido no pacote instalado:
 *      $ grep -n 'interface LayoutProps' -A4 \
 *          node_modules/next/dist/build/webpack/plugins/next-types-plugin/index.js
 *      export interface PageProps  { params?: any; searchParams?: any }
 *      export interface LayoutProps { children?: React.ReactNode; params?: any }   <- sem searchParams
 *    Com o contexto só na URL, o header não conseguiria ler o escopo que ele promete. Segmento de
 *    rota (`/[departamento]/...`) daria `params` ao layout, mas custa reestruturar todas as rotas e
 *    todo `Link` interno — muito além do ARB-R17-11 (uma tela de referência).
 *
 * O que a URL ganha, e nós ficamos com: o link compartilhado carrega o contexto (o ganho do Vercel).
 * `?departamento=X` é PORTA DE ENTRADA, consumida pelo `middleware.ts`, que grava o cookie e devolve
 * a URL limpa. Uma sede só ⇒ header e tela nunca discordam. O preço, declarado: perdemos duas abas
 * em dois departamentos ao mesmo tempo, que a LiderHub tem de propósito.
 *
 * O nome vive em `lib/departamentos/cookie.ts` porque o `middleware.ts` também precisa dele e não
 * pode arrastar o cliente de banco para o runtime de edge.
 */
export { COOKIE_DEPARTAMENTO } from "@/lib/departamentos/cookie";

export interface EstadoEscopo {
  /** Só os que a pessoa vê, já em ordem de exibição. */
  visiveis: Departamento[];
  ativo: Departamento | null;
  escopo: Escopo | null;
  /** `true` quando as views do M8 não responderam — a tela degrada, não inventa. */
  indisponivel: boolean;
  /** Fechamento transitivo e sinônimos, guardados para derivar a pendência sem uma segunda leitura. */
  arvore: ParAncestral[];
  sinonimos: Sinonimo[];
}

const INDISPONIVEL: EstadoEscopo = {
  visiveis: [],
  ativo: null,
  escopo: null,
  indisponivel: true,
  arvore: [],
  sinonimos: [],
};

/** A chave que o navegador pediu. Preferência, nunca verdade — quem valida é `lerEstadoEscopo`. */
export function lerPreferenciaDepartamento(): string | null {
  try {
    const v = cookies().get(NOME_COOKIE)?.value?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

/**
 * O estado inteiro do escopo, numa leitura só — é o que o layout chama.
 *
 * Erro de leitura devolve `indisponivel: true`, NUNCA lista vazia disfarçada: lista vazia e leitura
 * quebrada dariam a mesma tela, e "não achei departamento" e "não sei ler departamento" precisam ser
 * estados diferentes (é a mesma família do defeito que o Turbina achou no C9 — quatro estados, um
 * resultado).
 */
export async function lerEstadoEscopo(): Promise<EstadoEscopo> {
  try {
    const supabase = criarClienteServidor();
    const [depsRes, arvoreRes, sinRes, vincRes, papel, userRes] = await Promise.all([
      supabase
        .schema("core")
        .from("v_departamento")
        .select("chave,rotulo,pai,nivel,ativo,entrada,ordem"),
      supabase.schema("core").from("v_departamento_arvore").select("chave,ancestral"),
      supabase.schema("core").from("v_departamento_sinonimo").select("chave,sinonimo"),
      supabase
        .schema("core")
        .from("v_usuario_departamento")
        .select("usuario_id,departamento,papel_no_departamento,removido_em")
        .is("removido_em", null),
      lerPapelAtual(),
      supabase.auth.getUser(),
    ]);

    // A view de departamentos é a única sem a qual não há item. As outras três degradam para
    // conjunto vazio com significado próprio (sem sinônimo, sem vínculo, sem árvore), e a de
    // ÁRVORE é a exceção: sem ela a hierarquia não existe, e resolver a hierarquia aqui seria pôr
    // o header como segunda dona dela. Sem árvore ⇒ indisponível.
    if (depsRes.error || !depsRes.data || arvoreRes.error || !arvoreRes.data) return INDISPONIVEL;

    const deps: Departamento[] = depsRes.data.map((d: any) => ({
      chave: String(d.chave),
      rotulo: String(d.rotulo ?? d.chave),
      pai: d.pai ? String(d.pai) : null,
      nivel: Number(d.nivel ?? (d.pai ? 2 : 1)),
      ativo: d.ativo !== false,
      entrada: d.entrada === true,
      ordem: Number(d.ordem ?? 0),
    }));
    const arvore: ParAncestral[] = arvoreRes.data.map((p: any) => ({
      chave: String(p.chave),
      ancestral: String(p.ancestral),
    }));
    const sinonimos: Sinonimo[] = (sinRes.data ?? []).map((s: any) => ({
      chave: String(s.chave),
      sinonimo: String(s.sinonimo),
    }));

    const uid = userRes.data.user?.id ?? null;
    const vinculos = (vincRes.data ?? [])
      .filter((v: any) => !uid || String(v.usuario_id) === uid)
      .map((v: any) => String(v.departamento));

    const visiveis = ordenar(visiveisPara(deps, vinculos, papel));
    const ativo = escolherAtivo(visiveis, lerPreferenciaDepartamento());
    const chavesVisiveis = visiveis.map((d) => d.chave);
    const escopo = ativo ? resolverEscopo(ativo.chave, arvore, sinonimos, chavesVisiveis) : null;

    return { visiveis, ativo, escopo, indisponivel: false, arvore, sinonimos };
  } catch {
    return INDISPONIVEL;
  }
}

/**
 * A chave é válida PARA ESTA PESSOA? É a pergunta que a server action de troca faz antes de gravar
 * o cookie — e é o único caminho de escrita do escopo. Não existe `document.cookie` no cliente para
 * isto: se o cliente gravasse, o servidor validaria depois de já ter renderizado, e o rótulo
 * mentiria por um render inteiro.
 */
export async function departamentoEhVisivel(chave: string): Promise<boolean> {
  const estado = await lerEstadoEscopo();
  if (estado.indisponivel) return false;
  return estado.visiveis.some((d) => d.chave === chave);
}

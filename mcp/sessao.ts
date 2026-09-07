import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A SESSÃO do servidor MCP — quem ele é perante o banco.
 *
 * 🔴 A DECISÃO CENTRAL DESTE ARQUIVO (D68): o MCP entra como um USUÁRIO NORMAL, com email e
 * senha, e a **RLS do banco decide o que ele vê**. Não usa `service_role`, não usa a Management
 * API, não tem chave privilegiada em lugar nenhum.
 *
 * A alternativa — o MCP oficial do Supabase — foi medida e recusada: ele fala pela Management
 * API em papel privilegiado, **passa por cima da RLS**, e entregaria o ledger inteiro
 * (`core.evento`), as conversas de WhatsApp e a PII de todos os pacientes a quem só precisa ver
 * campanha. E o `--read-only` de lá é honrado pelo processo, não pelo banco.
 *
 * Consequência prática e desejada: se amanhã a política do papel `marketing` mudar no banco, ela
 * muda aqui no mesmo instante, sem redeploy e sem alguém lembrar de atualizar o MCP.
 *
 * A `anon key` NÃO é segredo — é a mesma chave pública que o navegador já carrega no bundle do
 * site. O que é segredo é a senha, e ela vive só na config do Claude Code da máquina do Fernando.
 */

/** Nome das variáveis, em um lugar só, para a mensagem de erro poder citá-las. */
export const ENV = {
  email: "ME_ESCUTA_EMAIL",
  senha: "ME_ESCUTA_SENHA",
  url: "ME_ESCUTA_URL",
  anon: "ME_ESCUTA_ANON_KEY",
} as const;

/**
 * Valores embutidos no empacotamento (`scripts/empacotar-mcp.mjs` passa `--define`). Ficam
 * vazios no fonte de propósito: nenhum valor de ambiente entra no git. Com o bundle pronto, o
 * Fernando só precisa informar email e senha.
 */
const URL_EMBUTIDA = process.env.ME_ESCUTA_URL_EMBUTIDA ?? "";
const ANON_EMBUTIDA = process.env.ME_ESCUTA_ANON_EMBUTIDA ?? "";

export class ErroDeConfiguracao extends Error {}

function exigir(nome: string, valor: string | undefined, comoResolver: string): string {
  const v = (valor ?? "").trim();
  if (!v) throw new ErroDeConfiguracao(`Falta a variável ${nome}. ${comoResolver}`);
  return v;
}

/**
 * Abre a sessão e devolve o cliente. Uma vez por processo: o Claude Code sobe o servidor e o
 * mantém vivo, então o login acontece na primeira pergunta e o SDK renova o token sozinho
 * (`autoRefreshToken`).
 *
 * ⚠️ `persistSession: false` de propósito — sem `localStorage` num processo Node, e gravar
 * sessão em disco seria guardar credencial onde ninguém pediu.
 */
export async function abrirSessao(env: NodeJS.ProcessEnv = process.env): Promise<SupabaseClient<any, any, any>> {
  const url = exigir(ENV.url, env[ENV.url] || URL_EMBUTIDA, "Use o arquivo empacotado, que já vem com ela.");
  const anon = exigir(ENV.anon, env[ENV.anon] || ANON_EMBUTIDA, "Use o arquivo empacotado, que já vem com ela.");
  const email = exigir(ENV.email, env[ENV.email], "É o seu email de acesso ao sistema Me Escuta.");
  const senha = exigir(ENV.senha, env[ENV.senha], "É a sua senha de acesso ao sistema Me Escuta.");

  const cliente = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
  if (error) {
    // A mensagem crua do GoTrue ("Invalid login credentials") não diz o que fazer. Esta diz —
    // e não repete a senha em lugar nenhum.
    throw new ErroDeConfiguracao(
      `Não consegui entrar como ${email}: ${error.message}. ` +
        `Confira ${ENV.email} e ${ENV.senha} na configuração do MCP.`,
    );
  }
  return cliente;
}

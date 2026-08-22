/**
 * O FRONT PRECISA DIZER QUAL BUILD ESTA NO AR.
 *
 * Medido em 22/08: producao fria desde 20-21/07 e nenhuma forma de saber, olhando o app, qual
 * commit esta servindo — `/health` do runtime nao devolve SHA e a Vercel tampouco expoe isso na
 * pagina. Consequencia pratica: todo problema vira primeiro uma discussao sobre "o deploy pegou?".
 *
 * `env` do Next injeta em BUILD TIME (nao runtime): o valor e congelado no bundle, que e
 * exatamente o que se quer — o carimbo descreve o artefato, nao a maquina que o serve.
 *
 * `VERCEL_GIT_COMMIT_SHA` e `VERCEL_ENV` sao providos pela propria Vercel, sem precisar cadastrar
 * variavel nenhuma no painel. `GITHUB_SHA` cobre build por CI. Fora dos dois, resolve pra "local"
 * — e "local" aparecendo em producao E o achado: quer dizer que o build nao veio da esteira.
 */
const SHA = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local").slice(0, 7);
const AMBIENTE = process.env.VERCEL_ENV ?? "local";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SHA: SHA,
    NEXT_PUBLIC_AMBIENTE: AMBIENTE,
  },
};

export default nextConfig;

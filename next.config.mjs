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
 *
 * 13/09/2026 — `??` VIROU `||`, e sao os dois caracteres que faziam o carimbo NASCER VAZIO.
 * A Vercel desta conta nao escuta o Git (E-381: zero GitHub Apps na org), entao ela nao deixa
 * `VERCEL_GIT_COMMIT_SHA` indefinida: define como STRING VAZIA. E `??` so cai no proximo valor em
 * `null`/`undefined` — nunca em `""`. Resultado medido no /login de producao: o paragrafo do
 * carimbo renderizava `<p class="…font-mono…"></p>`, vazio, e por isso a invariante "a main sempre
 * contem producao" era afirmada e nunca verificada no web. `||` trata "" como ausente, que e o que
 * ela sempre significou aqui.
 */
const SHA = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local").slice(0, 7);
const AMBIENTE = process.env.VERCEL_ENV || "local";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SHA: SHA,
    NEXT_PUBLIC_AMBIENTE: AMBIENTE,
  },
};

export default nextConfig;

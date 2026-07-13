# me-escuta-web

UI do sistema Me Escuta — **Sprint 1 / F1 (W1, RF-7)**. Esqueleto Next.js + shadcn (S0) mais o
walking skeleton visível: **auth** (Supabase Auth), **timeline crua do ledger** e **fila crua de
sugestões pendentes** com aprovar/rejeitar chamando `api.validar_sugestao` (RPC-porta).

> Leitura vai direto no schema `core` com **RLS**. Escrita **SÓ** via RPC-porta (`api.validar_sugestao`)
> — a UI não tem caminho próprio de escrita. Não autenticado é **bloqueado** (middleware → /login).

## Telas

| Rota | O que faz | RF |
|---|---|---|
| `/login` | e-mail/senha (Supabase Auth); sem sessão, o resto é bloqueado | RF-7 |
| `/timeline` | ledger `core.evento` por `posicao_global` desc (refetch simples; realtime é S3) | RF-7 |
| `/fila` | `core.sugestao_ia` pendentes; **Aprovar/Rejeitar** → `api.validar_sugestao` (RPC) | RF-7 |

Fluxo de dados: `middleware.ts` (gate de sessão) · `lib/supabase/{client,server,middleware}.ts`
(clientes SSR) · Server Components leem com RLS · Server Actions escrevem só pela RPC-porta.

## Rodar (stack local)

```bash
npm install
cp .env.local.example .env.local     # gitignored; a chave anon é pública por design (RLS protege)

# Precisa do me-escuta-db de pé. No Apple Silicon, exclua o PostgREST (segfault Rosetta):
#   (em ../me-escuta-db)  supabase start -x postgrest,imgproxy,studio,edge-runtime,realtime,logflare,vector,storage-api,postgres-meta,supavisor,mailpit

npm run typecheck    # tsc --noEmit (verde)
npm run build        # next build (verde)
npm run e2e          # verificação e2e das 7 costuras (passos 1–3) via SQL
npm run dev          # sobe a UI em http://localhost:3000 (aponta pro stack local :54421)
```

Aponta para o **stack LOCAL** (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, a porta da API/kong
do me-escuta-db). Nenhum segredo em código — tudo em `.env.local` (gitignored).

## Verificação e2e (passos 1–3)

`scripts/verificacao-e2e.mjs` prova o fluxo ponta a ponta **por SQL** (conexão direta ao Postgres, para
contornar o PostgREST segfaultando sob Rosetta):

1. injeta `lead_criado` + `mensagem_recebida` pela porta → aparecem na timeline;
2. roda o worker (`me-escuta-runtime` `processa-once`) → sugestão **pendente**;
3. aprova via `api.validar_sugestao` (com claim de JWT simulando o usuário logado — exatamente a RPC que
   a UI chama) → **evento HITL** no ledger (`origem='hitl'`, `ator='humano:<email>'`) + `acao_log`.
   Bônus: reenvio do mock ⇒ `duplicado=true` (dedup).

Requer `RUNTIME_DIR` (default `../me-escuta-runtime`) e o me-escuta-db no ar.

## Limitação conhecida (Apple Silicon / Rosetta)

O container do PostgREST (`supabase_rest`) segfaulta sob Rosetta, então o `supabase start` completo cai.
Contorno local: subir o stack **sem** o PostgREST. Consequência: os componentes da UI que leem via
PostgREST/RLS e a RPC via PostgREST **não funcionam no browser local** — por isso a evidência e2e é feita
via SQL (mesmo contrato de porta que a UI usa). Em produção, com PostgREST são (arquitetura x86_64/ARM
nativa no Supabase gerenciado), a UI funciona normalmente. A UI está construída e com `build`/`typecheck`
verdes; o que falta é apontar para um projeto com PostgREST vivo.

## Falta para ligar em produção (S0 pendente)

CI (build/lint/tsc/gitleaks) + Vercel + apontar `NEXT_PUBLIC_SUPABASE_URL`/anon para o projeto do sistema
novo (`rvvpfkdjburdorgegxop`) com PostgREST vivo, matriz de perfis RLS (N5 é S7), e criar o(s) usuário(s)
de acesso. Nada disso é local — depende do aval do Diogo.

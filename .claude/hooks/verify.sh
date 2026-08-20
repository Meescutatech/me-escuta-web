#!/bin/bash
# Stop hook — verifica o trabalho ANTES de o agente conseguir encerrar o turno.
#
# Sai com código 2 quando algo falha: o harness devolve a saída ao agente, que é
# obrigado a consertar antes de terminar. Silencioso no sucesso, para não gerar
# laço de resposta.
#
# ── POR QUE ELE EXISTE ────────────────────────────────────────────────────────
# Medido em 19/08/2026: os 3 repositórios têm 168 arquivos de teste e ZERO
# execuções de CI na história. Quem sempre reportou o verde foi o agente que
# escreveu o código. Este hook é a máquina emitindo o verde — sem servidor.
#
# ── ⚠️ A DIFERENÇA PARA A VERSÃO DE ORIGEM (LiderHub) ─────────────────────────
# A versão original começa com:
#     if [ -z "$(git diff --name-only HEAD)$(git diff --cached --name-only)" ]; then exit 0
# Isso compara a árvore de trabalho com o HEAD. **Se o agente commitar tudo e
# então encerrar, a árvore está limpa e o hook sai 0 sem verificar nada** — e
# commitar antes de encerrar é exatamente o que o nosso método manda fazer.
# Portado como está, ele passaria batido justamente no nosso fluxo.
#
# Aqui a comparação é contra a BASE (merge-base com a branch default), então
# trabalho commitado continua sendo verificado.
set -uo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$REPO" || exit 0

# ── 1. Há mudança em relação à BASE? (não em relação ao HEAD) ────────────────
BASE_REMOTA=""
for b in origin/development origin/main; do
  git rev-parse --verify -q "$b" >/dev/null 2>&1 && { BASE_REMOTA="$b"; break; }
done

MUDOU=""
if [ -n "$BASE_REMOTA" ]; then
  BASE="$(git merge-base HEAD "$BASE_REMOTA" 2>/dev/null)"
  # commitado à frente da base  +  não commitado
  MUDOU="$(git diff --name-only "${BASE:-HEAD}" 2>/dev/null)$(git diff --name-only 2>/dev/null)$(git diff --cached --name-only 2>/dev/null)"
else
  MUDOU="$(git diff --name-only HEAD 2>/dev/null)$(git diff --cached --name-only 2>/dev/null)"
fi
[ -z "$MUDOU" ] && exit 0

ERROS=()

# ── 2. Node: typecheck (rápido, roda sempre) ────────────────────────────────
if [ -f package.json ] && [ -d node_modules ]; then
  if grep -q '"typecheck"' package.json; then
    SAIDA="$(npm run --silent typecheck 2>&1)" || ERROS+=("typecheck falhou:
$SAIDA")
  fi
  if grep -q '"lint"' package.json; then
    SAIDA="$(npm run --silent lint 2>&1)" || ERROS+=("lint falhou:
$SAIDA")
  fi
fi

# ── 3. Banco: numeração de migration (rápido, e pega um defeito real nosso) ──
# A colisão de numeração em trilhas paralelas já custou uma rodada (memória
# `migrations-paralelas-create-or-replace`). Isto é barato e pega na hora.
if [ -d supabase/migrations ]; then
  DUP="$(ls supabase/migrations/ 2>/dev/null | grep -oE '^[0-9]{4}' | sort | uniq -d)"
  [ -n "$DUP" ] && ERROS+=("migrations com número DUPLICADO: $DUP")

  # config.toml local nunca deve ser commitado (E-005 / config-toml-local)
  git ls-files --error-unmatch supabase/config.toml >/dev/null 2>&1 &&
    ERROS+=("supabase/config.toml está RASTREADO — ele é local, por worktree. Use o .example")
fi

# ── 4. Segredo à solta (barato, e é o único que protege terceiro) ────────────
if [ -n "$MUDOU" ]; then
  VAZ="$(git diff "${BASE:-HEAD}" 2>/dev/null | grep -nE '^\+.*(sk-ant-[A-Za-z0-9]{20}|eyJhbGciOi[A-Za-z0-9]{20}|postgres://[^ ]*:[^ ]*@)' | head -3)"
  [ -n "$VAZ" ] && ERROS+=("possível SEGREDO adicionado no diff:
$VAZ")
fi

# ── 5. Testes: só sob pedido explícito (lentos demais para todo turno) ──────
# O lugar da suíte é o CI. Aqui é para quando o agente quer confirmar antes.
if [ "${CLAUDE_VERIFY_TEST:-0}" = "1" ] && [ -f package.json ] && grep -q '"test"' package.json; then
  SAIDA="$(npm test 2>&1)" || ERROS+=("testes falharam:
$SAIDA")
fi

# ── 6. Veredito ─────────────────────────────────────────────────────────────
if [ ${#ERROS[@]} -gt 0 ]; then
  echo "=== verificação falhou — conserte antes de encerrar ===" >&2
  for e in "${ERROS[@]}"; do echo -e "$e" >&2; done
  exit 2
fi
exit 0

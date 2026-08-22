#!/bin/bash
# T7 · roda a igualdade tela x oraculo contra uma bancada local.
#
# Precisa de um Postgres com a cadeia do me-escuta-db ate a 0240 (a T6). Nao roda no CI:
# o CI nao tem banco, e a logica pura da tela ja e coberta por tests/marketing.test.ts.
#
# A fixture entra e sai em UMA transacao com ROLLBACK — a bancada nao guarda uma linha
# desta conferencia. Conferido depois de rodar: captacao=0, custo_midia=0.
set -uo pipefail
CONTAINER="${1:-supabase_db_me-escuta-db}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"

docker exec "$CONTAINER" psql -U postgres -d postgres -tAc "select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='core' and p.proname='casamento_midia'" | grep -q 1 || {
  echo "ABORTOU: core.casamento_midia nao existe em $CONTAINER — a 0240 (T6) nao foi aplicada."
  echo "Sem o oraculo nao ha com o que comparar, e comparar a tela consigo mesma e a tautologia"
  echo "que o RF-10 proibe. Aplique a cadeia ate a 0240 e rode de novo."
  exit 1
}

docker cp "$AQUI/fixture-e-oraculo.sql" "$CONTAINER:/tmp/igualdade-t7.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -tA -f /tmp/igualdade-t7.sql > "$TMP/saida.txt" 2>&1 || {
  cat "$TMP/saida.txt"; exit 1;
}

python3 - "$TMP" <<'PY'
import json, sys, pathlib
tmp = pathlib.Path(sys.argv[1])
linhas = [l for l in (tmp/"saida.txt").read_text().splitlines() if l.startswith("{")]
if len(linhas) < 2:
    print("ABORTOU: a consulta nao devolveu os dois JSON esperados"); raise SystemExit(1)
json.dump(json.loads(linhas[0]), open(tmp/"oraculo.json","w"))
json.dump(json.loads(linhas[1]), open(tmp/"cruas.json","w"))
PY

node --experimental-strip-types "$AQUI/comparar.ts" "$TMP"
CODIGO=$?
rm -rf "$TMP"
exit $CODIGO

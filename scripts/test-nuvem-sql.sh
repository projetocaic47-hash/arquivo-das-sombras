#!/usr/bin/env bash
export PGOPTIONS='-c client_min_messages=warning'
# Testa a migração do banco num PostgreSQL local (banco temporário, apagado no fim).
# Uso: bash scripts/test-nuvem-sql.sh   (precisa de psql e de um PostgreSQL rodando)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="arquivo_teste_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
[ "$(id -u)" = 0 ] && PSQL=(runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null
trap '"${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
"${PSQL[@]}" -d "$DB" -f supabase/tests/stub-supabase.sql >/dev/null
"${PSQL[@]}" -d "$DB" -f supabase/migrations/20261022000000_arquivo_nuvem.sql >/dev/null
# de novo: a migração pode rodar duas vezes sem erro
"${PSQL[@]}" -d "$DB" -f supabase/migrations/20261022000000_arquivo_nuvem.sql >/dev/null
out=$("${PSQL[@]}" -d "$DB" -At -f supabase/tests/rls.sql | grep -E '^(OK|FALHA|tudo|HÁ)')
echo "$out"
grep -q '^tudo certo$' <<<"$out"

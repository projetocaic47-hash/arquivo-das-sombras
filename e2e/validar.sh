#!/usr/bin/env bash
# Validação completa (Fase 7): compila, roda os testes automáticos e todos os testes no
# navegador, e diz no fim quais passaram. Precisa de `npx vite preview --port 4173`
# rodando em outro terminal e do HTML original no caminho passado (ou o padrão abaixo).
# Uso: bash e2e/validar.sh ["/caminho/Arquivo das Sombras (1).html"]
ORIG="${1:-../Arquivo das Sombras (1).html}"
cd "$(dirname "$0")/.."
ok=0; fail=0; summary=""
step() {
  local name="$1"; shift
  echo "=== $name"
  if "$@" > "e2e/out/validar-$name.log" 2>&1 && ! grep -q "FALHA" "e2e/out/validar-$name.log"; then
    ok=$((ok + 1)); summary+="OK     $name"$'\n'
  else
    fail=$((fail + 1)); summary+="FALHA  $name (veja e2e/out/validar-$name.log)"$'\n'
  fi
}
mkdir -p e2e/out
step compilar npx tsc -b
step testes npx vitest run
step compatibilidade node e2e/compat.mjs "$ORIG"
step editor-acervo node e2e/fase5.mjs 4173
step mesa node e2e/mesa.mjs 4173
step livro node e2e/book.mjs 4173
step letra-capital node e2e/capital.mjs 4173
step letra-capital-quadro node e2e/capital-quadro.mjs 4173
step teclado-recarregar node e2e/audit6.mjs 4173 e2e/out/fase6 keys
step sem-3d node e2e/audit6.mjs 4173 e2e/out/fase6 nogl
step telas node e2e/audit6.mjs 4173 e2e/out/fase6 sizes
step leitura-tela-cheia node e2e/leitura.mjs 4173
step porta-de-entrada node e2e/porta.mjs 4173
step nuvem node e2e/nuvem.mjs 4173
step nuvem-banco-sql bash scripts/test-nuvem-sql.sh
step nuvem-supabase node e2e/nuvem-supabase.mjs 4173
step nuvem-supabase-real node e2e/nuvem-real.mjs
step excluir-do-livro node e2e/excluir.mjs 4173
step sons node e2e/sons.mjs 4173
step porta-celular node e2e/porta-celular.mjs 4173
step ambiente-chuva-porta node e2e/ambiente.mjs 4173
echo
printf "%s" "$summary"
echo "$ok passaram, $fail falharam"
[ "$fail" = 0 ]

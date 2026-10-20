# Dados e compatibilidade

## Banco IndexedDB (igual ao HTML original)

- Nome `arquivo-das-sombras`, versão **1**.
- Gaveta `stories`, chave `id`: um registro por história (inclusive as da lixeira).
- Gaveta `meta`, chave fixa `cfg`: ajustes, marcadores, posição de leitura, último backup.

Campos de história: `id, t, sub, x, tags, st ('d'|'f'), note, fav, del, c, u, o, v?`.
Campos de `cfg`: `n, p, fs, rm, pos?, bm?, lb?`. Tipos completos em `src/data/types.ts`.

## Regras

1. Não renomear nem remover campos. Campos novos entram só como opcionais.
2. Não subir a versão do banco sem migração aprovada. Uma migração deve:
   gerar um backup antes, copiar, conferir contagens e só então trocar de formato.
3. Substituir o acervo é feito numa única transação: se um registro falhar, nada muda
   (o original não tinha essa proteção; ver teste em `tests/db.test.ts`).
4. O backup `.json` v1 (`{app, v, exported, config, stories}`) é lido e gerado no mesmo formato do original.

## Migração do navegador atual

O IndexedDB pertence ao endereço onde o app é aberto. A nova aplicação, em outro
endereço, começa vazia. Caminho: no app original, Acervo → Backup do acervo; na nova,
Restaurar backup. Os dois sentidos foram testados em `e2e/compat.mjs`.

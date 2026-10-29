# TASKME NTR

Task manager del team NTR Biosensors (sostituisce Jira). Governance e decisioni: [`CLAUDE.md`](CLAUDE.md); stato: [`STATUS.md`](STATUS.md).

## Setup locale

1. Prerequisiti: Node ≥ 20.18, pnpm 9 (`npm i -g pnpm@9`), un progetto Supabase già configurato ([guida](docs/SETUP_SUPABASE_VERCEL.md)).
2. `pnpm install`
3. `cp .env.example .env.local && cp .env.example .env` e compila `NEXT_PUBLIC_SUPABASE_*` e `DATABASE_URL`.
4. `pnpm db:migrate` — applica le migrazioni in `drizzle/` (schema, RLS, funzioni).
5. `pnpm db:seed` — crea workspace, utenti da `migration/user_mapping.json`, progetti NBI e PN.
6. `pnpm dev` → http://localhost:3000, login con Google.
7. Verifiche: `pnpm lint && pnpm typecheck && pnpm test` (i test DB girano su PGlite, nessun Postgres richiesto).
8. E2E: `pnpm exec playwright install chromium && pnpm test:e2e`.
9. Schema: modifica `src/db/schema.ts`, poi `pnpm db:generate`; SQL manuale con `pnpm drizzle-kit generate --custom`.
10. Stringhe UI solo in `src/i18n/it.ts`.

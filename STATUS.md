# STATUS.md — TASKME NTR

Aggiornato: 2026-10-29 (sessione 1, M0 Bootstrap)

## Stato
- Fase 1, milestone corrente: **M0 Bootstrap** — codice completo sul branch `feat/m0-bootstrap` (PR verso `main`).
- DoD M0 **non ancora verificabile**: richiede i passi manuali Supabase / Google / Vercel di `docs/SETUP_SUPABASE_VERCEL.md` (Claudio).

## Fatto
- Scaffold Next.js 15.5 (App Router, TS strict), pnpm 9, Tailwind 4, shadcn/ui (stile radix-nova, base neutral, dark mode via next-themes), ESLint + Prettier, Vitest, Playwright.
- `src/db/schema.ts`: tutte le 18 tabelle e gli 11 enum di CLAUDE.md §3; indici (issues `project_id+number` unique, `project_id+status_id`, `parent_id`, rank, due_date; full-text GIN `italian` su issues title+description_text e comments body_text; label unique case-insensitive); check constraint (key progetto, progress 0–100, date, epic senza parent, 25 MB allegati).
- Migrazioni: `drizzle/0000_init.sql` (generata) + `drizzle/0001_rls_and_functions.sql` (manuale, nel journal): RLS su tutte le tabelle con helper in schema `private`; `next_issue_number(project_id)`; `claim_signin()`; `hook_before_user_created(event)`; trigger stati di default, gerarchia epic→task→subtask, stato dello stesso progetto, archiviazione solo proprie per i member, `updated_at`.
- Auth Google: login, callback con allow-list (ADR-001), `/unauthorized`, logout, middleware che protegge le route.
- Seed idempotente `pnpm db:seed` da `migration/user_mapping.json`.
- Layout: sidebar progetti + "I miei task" (placeholder), topbar con ricerca placeholder, menu utente (ruolo, tema, logout), pagina `/p/[key]` con tab (solo Tabella attiva, placeholder M1). Responsive con sidebar a scomparsa su mobile.
- `src/i18n/it.ts`, `.env.example`, `README.md`, CI GitHub Actions (lint, format, typecheck, test, drizzle check, drift schema↔migrazioni, build).
- Test: 48 Vitest (di cui 16 di integrazione che applicano le migrazioni vere su PGlite con stub di `auth.*` e verificano RLS/funzioni/trigger) + 1 smoke Playwright. `pnpm lint && pnpm typecheck && pnpm test` verdi; `next build` senza warning anche a freddo (gli avvisi "Serializing big strings" della cache webpack sono silenziati in `next.config.ts` via `infrastructureLogging`: riguardano la cache di webpack, non il codice).

## In corso
- (nulla)

## Bloccato / Escalation
- (nulla) — nessuna decisione [VINCOLANTE] modificata.

## Da fare a mano (Claudio)
- Passi A–G di `docs/SETUP_SUPABASE_VERCEL.md`: progetto Supabase, client OAuth Google, provider Google, `pnpm db:migrate` + `pnpm db:seed`, Vercel, redirect URL, verifica DoD.
- `gh` CLI non installato in questa macchina: la PR va aperta dal link stampato da `git push` (o installando `gh`).

## Note di implementazione (per M1+)
- `users.id` = `auth.users.id` dopo il primo login; gli utenti seminati hanno id provvisorio, riallineato da `claim_signin()` (FK `ON UPDATE CASCADE`).
- Progetti privati: visibili **solo** ai `project_members`, anche per admin/owner (lettura stretta di §2). Gli admin possono però gestire `project_members` di qualunque progetto del workspace. Un admin che crea un progetto privato deve aggiungersi ai membri per vederlo: gestirlo nella UI M1.
- Il vincolo "almeno uno stato per categoria" (§3.2) non è ancora imposto a livello DB: da fare in M1 con la gestione stati.
- "member archivia solo le proprie issue" è imposto da trigger (`created_by = auth.uid()`); le chiamate senza JWT (script/service role) non sono limitate.
- Seed: i ruoli mappati vengono applicati solo se il membro ha ancora il ruolo `member` (non sovrascrive promozioni manuali).
- Playwright non è in CI (richiede browser): gira in locale con `pnpm test:e2e`; si può puntare a una preview con `E2E_BASE_URL`.

## Domande aperte (vedi CLAUDE.md §10)
- Q1 dominio Workspace per allow-list — placeholder attivo: solo `clogabbiani@gmail.com` (dominio aggiungibile con `SEED_ALLOWED_DOMAINS`).
- Q2 email Edoardo / Merk / Nicola; "Marco" = Merk? — il seed li salta e lo segnala; PN resta senza membri (quindi invisibile a tutti) finché manca l'email di Edoardo.
- Q3 dominio app e mittente Resend — placeholder: URL Vercel di default, `onboarding@resend.dev`.
- Q4 progetti aggiuntivi al cutover — solo NBI e PN.

## Idee (Fase 2+, non implementare)
- (vuoto)

## Prossimo passo
- Claudio esegue `docs/SETUP_SUPABASE_VERCEL.md` e verifica la DoD M0; merge della PR.
- Poi M1 (branch `feat/m1-issues-crud`): CRUD issue, pannello dettaglio, vista Tabella, Impostazioni.

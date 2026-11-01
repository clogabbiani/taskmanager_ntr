# STATUS.md — TASKME NTR

Aggiornato: 2026-11-01 (sessione 2, governance dopo review M0)

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

## Decisioni dalla review M0 (2026-11-01, Claudio)
1. **Progetti privati**: admin e owner devono vedere i progetti privati in Impostazioni → Progetti e gestirne i membri, ma leggono le issue solo se membri. Regola aggiunta a CLAUDE.md §2 e §4 (riga "Gestire membri di progetti privati"). **Da fare in M1**: correggere policy RLS (`projects_select` oggi usa `can_read_project`, che nasconde il progetto agli admin non membri; separare "vedere il progetto come configurazione" da "leggere le issue") e la UI Impostazioni. La sidebar resta filtrata ai progetti di cui si leggono le issue.
2. **"Almeno uno stato per categoria" a livello DB**: rinvio a M1 confermato.
3. **Playwright in CI**: da M2.
4. **Avvisi cache webpack silenziati** in `next.config.ts`: approvato.
5. **Q1 risolta**: dominio Workspace `ntrbiosensors.com`. Il seed lo mette in `allowed_signins` di default (`SEED_ALLOWED_DOMAINS` non impostata).
6. **Owner**: Claudio accede con `c.gabbiani@ntrbiosensors.com`; aggiornati `migration/user_mapping.json`, seed, CLAUDE.md §4. `clogabbiani@gmail.com` è volutamente fuori dall'allow-list (account "non autorizzato" per il test G.4; c'è un test che lo garantisce).
   6.2. Email di Edoardo: `e.salamone@ntrbiosensors.com` (in `user_mapping.json`): il seed ora lo aggiunge come admin e come membro di PN.
7. **Google OAuth Audience = Internal** (setup B.3): niente *Publish app* né test user. Guida aggiornata.

## In corso
- (nulla)

## Bloccato / Escalation
- Nessuna decisione [VINCOLANTE] modificata in autonomia.
- **Da valutare (Claudio)**: con Audience *Internal* Google blocca `clogabbiani@gmail.com` prima che arrivi a TASKME, quindi il test G.4 mostra la pagina di blocco di Google e non "Accesso non autorizzato" di TASKME. Il rifiuto lato TASKME è coperto da `tests/db/rls.test.ts`. Se la DoD M0 ("viene rifiutato per una [email] fuori") deve mostrare la pagina TASKME dal vivo, serve passare temporaneamente l'Audience a *External* durante il test, o accettare il blocco di Google come esito valido.

## Da fare a mano (Claudio)
- Passi A–G di `docs/SETUP_SUPABASE_VERCEL.md`: progetto Supabase, client OAuth Google, provider Google, `pnpm db:migrate` + `pnpm db:seed`, Vercel, redirect URL, verifica DoD.
- `gh` CLI non installato in questa macchina: la PR va aperta dal link stampato da `git push` (o installando `gh`).

## Note di implementazione (per M1+)
- `users.id` = `auth.users.id` dopo il primo login; gli utenti seminati hanno id provvisorio, riallineato da `claim_signin()` (FK `ON UPDATE CASCADE`).
- Progetti privati: **oggi** (M0) l'RLS li nasconde del tutto ai non membri, anche ad admin/owner; le policy su `project_members` permettono già agli admin di gestirne i membri. In M1 va allineato alla nuova regola (vedi decisione 1).
- Il vincolo "almeno uno stato per categoria" (§3.2) non è ancora imposto a livello DB: in M1 con la gestione stati (confermato).
- "member archivia solo le proprie issue" è imposto da trigger (`created_by = auth.uid()`); le chiamate senza JWT (script/service role) non sono limitate.
- Seed: i ruoli mappati vengono applicati solo se il membro ha ancora il ruolo `member` (non sovrascrive promozioni manuali).
- Playwright non è in CI: arriva in M2 (deciso). Fino ad allora gira in locale con `pnpm test:e2e`; si può puntare a una preview con `E2E_BASE_URL`.

## Domande aperte (vedi CLAUDE.md §10)
- ~~Q1 dominio Workspace~~ — **risolta**: `ntrbiosensors.com`.
- Q2 — parziale: Claudio e Edoardo risolti; mancano le email di Merk e Nicola (il seed li salta e lo segnala; con il dominio in allow-list potranno comunque entrare, ma come `member` finché non si rilancia il seed con le email o li si promuove); "Marco" = Merk ancora da confermare.
- Q3 dominio app e mittente Resend — placeholder: URL Vercel di default, `onboarding@resend.dev`.
- Q4 progetti aggiuntivi al cutover — solo NBI e PN.

## Idee (Fase 2+, non implementare)
- (vuoto)

## Prossimo passo
- Claudio esegue `docs/SETUP_SUPABASE_VERCEL.md` e verifica la DoD M0; merge della PR.
- Poi M1 (branch `feat/m1-issues-crud`): CRUD issue, pannello dettaglio, vista Tabella, Impostazioni.

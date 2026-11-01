# STATUS.md — TASKME NTR

Aggiornato: 2026-11-01 (sessione 3, M1 Issue core)

## Stato
- **M0 chiusa** e verificata in produzione (login Google con allow-list).
- Fase 1, milestone corrente: **M1 Issue core**, in tre PR (vedi `docs/PROMPT_M1.md`):
  - PR 1 `feat/m1-issues-core` — correzioni M0 e fondamenta dati: **pronta**.
  - PR 2 `feat/m1-issue-detail` (figlia della PR 1) — issue: creazione, dettaglio, campi: **pronta**.
  - PR 3 — vista Tabella, viste salvate, Impostazioni: da fare.

## M1 — PR 1 (correzioni M0 e fondamenta dati)
- Migrazioni `drizzle/0002_schema_m1.sql` (generata: colonne `search_vector` tsvector generate + GIN su `issues` e `comments`, FK `issues.status_id` da RESTRICT a NO ACTION per permettere il delete a cascata di un progetto) e `drizzle/0003_m1_rls_and_functions.sql` (manuale).
- **Progetti privati** (ADR-004): admin/owner vedono progetto, stati e membri e gestiscono `project_members`; issue, commenti, allegati, attività solo ai membri. Sidebar filtrata ai progetti leggibili; `/p/[key]` non leggibile → 404.
- **Vincolo stati**: trigger `statuses_guard` (almeno uno stato per categoria; niente delete di stati con issue) + RPC `delete_status(id, target)` che sposta le issue e scrive l'attività.
- **Gerarchia**: trigger riscritto (subtask richiede un task padre, `project_id` immutabile, niente auto-riferimento; i cicli sono impossibili per costruzione).
- **Derivati**: campo calcolato PostgREST `computed_progress(issues)` (epic = media pesata per `planned_days`, fallback media semplice, 0 senza figli) e gemello TS `src/features/issues/progress.ts`.
- **RPC**: `create_issue` (numero + stato di default + attività `created` in una transazione), `search_issues` (key esatta, titolo, full-text italiano su descrizione e commenti), `merge_labels`, `label_usage`, `external_collaborator_names`.
- **Rank** (ADR-002): `src/lib/rank.ts` chiavi frazionarie base 36.
- **Layer applicativo**: server action con zod in `src/features/issues/actions.ts` (create/update/bulk/archive/restore/delete/link/unlink/reorder), `projects/actions.ts` (progetti, membri progetto, stati), `labels/actions.ts`, `members/actions.ts` (ruoli, allow-list, profilo). Ogni action controlla il ruolo lato server (`src/features/auth/permissions.ts`) oltre alla RLS; `activity_log` scritto campo per campo (`src/features/issues/activity.ts`).
- Test: 109 Vitest (14 nuovi test DB in `tests/db/m1.test.ts`, unit su rank, diff attività, progress, permessi, mapping errori, markdown → testo).

## Fatto
- Scaffold Next.js 15.5 (App Router, TS strict), pnpm 9, Tailwind 4, shadcn/ui (stile radix-nova, base neutral, dark mode via next-themes), ESLint + Prettier, Vitest, Playwright.
- `src/db/schema.ts`: tutte le 18 tabelle e gli 11 enum di CLAUDE.md §3; indici (issues `project_id+number` unique, `project_id+status_id`, `parent_id`, rank, due_date; full-text GIN `italian` su issues title+description_text e comments body_text; label unique case-insensitive); check constraint (key progetto, progress 0–100, date, epic senza parent, 25 MB allegati).
- Migrazioni: `drizzle/0000_init.sql` (generata) + `drizzle/0001_rls_and_functions.sql` (manuale, nel journal): RLS su tutte le tabelle con helper in schema `private`; `next_issue_number(project_id)`; `claim_signin()`; `hook_before_user_created(event)`; trigger stati di default, gerarchia epic→task→subtask, stato dello stesso progetto, archiviazione solo proprie per i member, `updated_at`.
- Auth Google: login, callback con allow-list (ADR-001), `/unauthorized`, logout, middleware che protegge le route.
- Seed idempotente `pnpm db:seed` da `migration/user_mapping.json`.
- Layout: sidebar progetti + "I miei task" (placeholder), topbar con ricerca placeholder, menu utente (ruolo, tema, logout), pagina `/p/[key]` con tab (solo Tabella attiva, placeholder M1). Responsive con sidebar a scomparsa su mobile.
- `src/i18n/it.ts`, `.env.example`, `README.md`, CI GitHub Actions (lint, format, typecheck, test, drizzle check, drift schema↔migrazioni, build).
- Test: 48 Vitest (di cui 16 di integrazione che applicano le migrazioni vere su PGlite con stub di `auth.*` e verificano RLS/funzioni/trigger) + 1 smoke Playwright. `pnpm lint && pnpm typecheck && pnpm test` verdi; `next build` senza warning anche a freddo (gli avvisi "Serializing big strings" della cache webpack sono silenziati in `next.config.ts` via `infrastructureLogging`: riguardano la cache di webpack, non il codice).

## M1 — PR 2 (issue: creazione, dettaglio, campi)
- **Creazione rapida**: tasto `C` (fuori dai campi di testo) o pulsante "Nuova" in topbar → dialog titolo/progetto (preselezionato dall'URL)/tipo/padre; Invio crea e apre il dettaglio.
- **Dettaglio**: route intercettata `/p/[key]/@modal/(.)issues/[issueKey]` → pannello laterale (560px, espandibile a tutta larghezza, a tutto schermo sotto 768px); `/p/[key]/issues/[KEY-n]` aperto direttamente → pagina intera con lo stesso componente `IssueDetail`.
- Campi inline con salvataggio immediato e update ottimistico (rollback + toast in caso di errore): stato, assegnatari, priorità, tipo (solo se la gerarchia resta valida), padre, label (creazione al volo solo admin/owner), inizio/scadenza (calendario, `gg/mm/aaaa`), giorni pianificati, avanzamento (slider + input; epic in sola lettura con il valore calcolato), rischio, collaboratori esterni (chip + autocomplete).
- Titolo inline; descrizione **Tiptap** con `@tiptap/markdown` (grassetto, corsivo, titolo, elenchi, codice, link), salvata in `description_md`, `description_text` derivato lato server.
- **Figli**: lista con stato/assegnatari/avanzamento, creazione inline, riordino drag (dnd-kit, anche da tastiera) → `reorderIssue`. **Collegamenti**: correlata / blocca / è bloccata da con ricerca per chiave o titolo; badge "Bloccata" se un'issue bloccante non è in categoria `done`.
- Menu `…`: copia link, archivia/ripristina (member solo le proprie), elimina definitivamente (admin/owner, digitando la chiave).
- Tab **Attività** in italiano con valori risolti (`src/features/issues/activity-format.ts`, testato).
- **Ricerca globale** `Ctrl/Cmd+K`: RPC `search_issues`, risultati raggruppati per progetto.
- La pagina progetto mostra per ora un elenco semplice di issue (sostituito dalla Tabella nella PR 3).
- E2E: `e2e/app/issue-flow.spec.ts`, `e2e/app/epic-progress.spec.ts` (richiedono `pnpm test:e2e:login`, vedi README).

## Decisioni dalla review M0 (2026-11-01, Claudio)
1. **Progetti privati**: admin e owner devono vedere i progetti privati in Impostazioni → Progetti e gestirne i membri, ma leggono le issue solo se membri. Regola aggiunta a CLAUDE.md §2 e §4 (riga "Gestire membri di progetti privati"). **Da fare in M1**: correggere policy RLS (`projects_select` oggi usa `can_read_project`, che nasconde il progetto agli admin non membri; separare "vedere il progetto come configurazione" da "leggere le issue") e la UI Impostazioni. La sidebar resta filtrata ai progetti di cui si leggono le issue.
2. **"Almeno uno stato per categoria" a livello DB**: rinvio a M1 confermato.
3. **Playwright in CI**: da M2.
4. **Avvisi cache webpack silenziati** in `next.config.ts`: approvato.
5. **Q1 risolta**: dominio Workspace `ntrbiosensors.com`. Il seed lo mette in `allowed_signins` di default (`SEED_ALLOWED_DOMAINS` non impostata).
6. **Owner**: Claudio accede con `c.gabbiani@ntrbiosensors.com`; aggiornati `migration/user_mapping.json`, seed, CLAUDE.md §4. `clogabbiani@gmail.com` è volutamente fuori dall'allow-list (account "non autorizzato" per il test G.4; c'è un test che lo garantisce).
   6.2. Email di Edoardo: `e.salamone@ntrbiosensors.com` (in `user_mapping.json`): il seed ora lo aggiunge come admin e come membro di PN.
7. **Google OAuth Audience = Internal** (setup B.3): niente *Publish app* né test user. Guida aggiornata.
8. **Test G.4** (escalation chiusa): l'Audience resta *Internal*. Il blocco di Google su `clogabbiani@gmail.com` è un esito valido della DoD M0; il rifiuto lato TASKME è coperto da `tests/db/rls.test.ts`. Guida G.4 aggiornata.

## In corso
- (nulla)

## Bloccato / Escalation
- Nessuna decisione [VINCOLANTE] modificata in autonomia.
- `pnpm db:migrate` contro il DB Supabase reale **non eseguito da Claude Code** (permesso negato dalla modalità automatica). Le migrazioni `0002`/`0003` sono provate su PGlite (test DB); vanno applicate da Claudio con `pnpm db:migrate` prima del merge della PR 1.

## Da fare a mano (Claudio)
- Passi A–G di `docs/SETUP_SUPABASE_VERCEL.md`: progetto Supabase, client OAuth Google, provider Google, `pnpm db:migrate` + `pnpm db:seed`, Vercel, redirect URL, verifica DoD.
- `gh` CLI non installato in questa macchina: la PR va aperta dal link stampato da `git push` (o installando `gh`).

## Note di implementazione (per M1+)
- `users.id` = `auth.users.id` dopo il primo login; gli utenti seminati hanno id provvisorio, riallineato da `claim_signin()` (FK `ON UPDATE CASCADE`).
- Progetti privati: allineati alla decisione 1 in M1 (ADR-004). Chi crea un progetto privato ne diventa membro.
- Vincolo "almeno uno stato per categoria" imposto a DB in M1 (`statuses_guard`).
- Letture lato client: TanStack Query con il client Supabase del browser (anon key + JWT dell'utente, quindi RLS); mutazioni solo via Server Actions. Le action sulle issue non chiamano `revalidatePath` (il client invalida le query), quelle di amministrazione sì.
- Hard delete di un task: elimina anche i suoi subtask (un subtask non può restare senza padre). Hard delete di un'epic: i task restano senza padre.
- `activity_log.field` usa nomi logici (`status`, `assignees`, `labels`, `parent`, `description`, `links`…); i valori sono id (stato, utenti, label) risolti in fase di visualizzazione.
- "member archivia solo le proprie issue" è imposto da trigger (`created_by = auth.uid()`); le chiamate senza JWT (script/service role) non sono limitate.
- Seed: i ruoli mappati vengono applicati solo se il membro ha ancora il ruolo `member` (non sovrascrive promozioni manuali).
- Playwright non è in CI: arriva in M2 (deciso). Fino ad allora gira in locale con `pnpm test:e2e`; si può puntare a una preview con `E2E_BASE_URL`.

## Domande aperte (vedi CLAUDE.md §10)
- ~~Q1 dominio Workspace~~ — **risolta**: `ntrbiosensors.com`.
- Q2 — parziale: Claudio e Edoardo risolti; mancano le email di Merk e Nicola (il seed li salta e lo segnala; con il dominio in allow-list potranno comunque entrare, ma come `member` finché non si rilancia il seed con le email o li si promuove); "Marco" = Merk ancora da confermare. In locale `migration/user_mapping.json` ha modifiche non committate di Claudio (Marco Brunengo, Nicola): non toccate.
- Q3 dominio app e mittente Resend — placeholder: URL Vercel di default, `onboarding@resend.dev`.
- Q4 progetti aggiuntivi al cutover — solo NBI e PN.

## Idee (Fase 2+, non implementare)
- (vuoto)

## Prossimo passo
- Claudio: `pnpm db:migrate` sul DB reale, poi merge PR 1.
- Claude Code: PR 2 (issue UI) e PR 3 (Tabella, viste salvate, Impostazioni).

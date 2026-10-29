# Prompt di avvio — Claude Code, milestone M0

Da incollare in Claude Code dentro la cartella del repo `taskmanager_ntr` dopo aver copiato `CLAUDE.md`, `STATUS.md`, `migration/` e `docs/` nella root.

---

Leggi `CLAUDE.md` e `STATUS.md` per intero prima di fare qualsiasi cosa. Sei l'implementatore di TASKME NTR; le decisioni marcate [VINCOLANTE] non si discutono, si eseguono. Se qualcosa è impraticabile, scrivi in `STATUS.md` → Escalation e fermati.

Obiettivo di questa sessione: **milestone M0 Bootstrap** completa, con la Definition of Done di CLAUDE.md §9.

Fai, nell'ordine:

1. Scaffold: Next.js 15 App Router, TypeScript strict, pnpm, Tailwind, shadcn/ui (tema neutro, dark mode), ESLint + Prettier, Vitest, Playwright con un solo smoke test, struttura cartelle di CLAUDE.md §1.
2. `src/db/schema.ts` con Drizzle: **tutte** le tabelle ed enum di CLAUDE.md §3, inclusi indici ovvi (issues: project_id+number unique, project_id+status_id, parent_id; full-text su title/description_text/body_text in italiano). Genera la prima migrazione con drizzle-kit. Aggiungi una migrazione SQL manuale (file in `drizzle/`) con le policy RLS di §3.5 e la funzione `next_issue_number(project_id)` transazionale.
3. Supabase Auth con provider Google: callback che verifica `allowed_signins` e, se non autorizzato, chiude la sessione e mostra la pagina "Accesso non autorizzato". Primo accesso autorizzato crea `users` + `workspace_members(member)`.
4. Seed (`pnpm db:seed`): workspace "NTR Biosensors", 4 utenti da `migration/user_mapping.json` (quelli con email null vengono creati come placeholder in `allowed_signins` solo se l'email c'è; altrimenti saltati e segnalati), Claudio owner, progetto NBI (colore a scelta, 4 stati di default), progetto PN privato con membro Edoardo se mappato.
5. Layout applicativo: sidebar con progetti e "I miei task" (link placeholder), topbar con ricerca (placeholder), avatar/menu utente con logout. Pagina `/p/[key]` vuota con tab Tabella/Kanban/Timeline/Calendario disabilitati tranne Tabella (placeholder "M1").
6. `src/i18n/it.ts` con tutte le stringhe usate finora.
7. `.env.example` completo (Supabase URL/anon/service role, Google OAuth, Resend placeholder, JIRA_* placeholder). `README.md` con setup locale in 10 righe.
8. GitHub Actions: lint, typecheck, test, `drizzle-kit check`.
9. Istruzioni passo-passo in `docs/SETUP_SUPABASE_VERCEL.md` per: creare progetto Supabase, abilitare Google provider, configurare OAuth client in Google Cloud Console con redirect URL, impostare env su Vercel, collegare repo a Vercel. Io eseguo i passi manuali; tu scrivi cosa cliccare.
10. Aggiorna `STATUS.md`. Apri `docs/decisions/ADR-001-auth-allowlist.md` descrivendo come hai implementato il controllo allow-list (callback vs. hook DB) e perché.

Vincoli di sessione:
- Commit piccoli, Conventional Commits, branch `feat/m0-bootstrap`, PR verso `main` a fine sessione.
- Nessuna funzionalità di M1+ (niente CRUD issue oltre allo schema).
- Prima di dichiarare M0 chiusa: `pnpm lint && pnpm typecheck && pnpm test` verdi e build Next senza warning.

Alla fine, riassumimi in 10 righe: cosa è pronto, cosa devo fare io a mano (Supabase/Google/Vercel), cosa è rimasto aperto.

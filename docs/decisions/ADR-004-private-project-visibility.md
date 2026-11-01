# ADR-004 — Visibilità dei progetti privati

- Stato: accettata
- Data: 2026-11-01
- Contesto: CLAUDE.md §2 e §4 (decisione review M0 del 2026-11-01), §3.5 RLS [VINCOLANTE]

## Contesto

In M0 la policy `projects_select` usava `can_read_project`: un progetto privato era invisibile a chiunque non fosse in `project_members`, admin e owner compresi. La regola decisa nella review M0 è diversa:

- admin e owner **vedono sempre** il progetto privato come configurazione (nome, key, colore, stati, membri) e ne **gestiscono i membri**;
- le **issue** e tutto ciò che vi è collegato (commenti, allegati, attività, assegnazioni, label, link) restano leggibili solo dai membri del progetto, anche per admin e owner.

## Decisione

Tre livelli di accesso, come funzioni `SECURITY DEFINER` nello schema `private` (migrazione `drizzle/0003_m1_rls_and_functions.sql`):

| Funzione | Vero se | Usata da |
|---|---|---|
| `can_see_project` | membro del workspace e (progetto pubblico, oppure admin/owner, oppure membro del progetto) | `statuses_select` |
| `can_configure_project` | admin/owner del workspace del progetto | `projects_update/delete`, `statuses_*` in scrittura, `project_members_insert/delete` |
| `can_read_project` (invariata da M0) | membro del workspace e (pubblico oppure membro del progetto) | issue, assegnazioni, label delle issue, link, commenti, allegati, `activity_log`, viste salvate |

Dettagli:

- `projects_select` replica `can_see_project` direttamente sulle colonne della riga invece di chiamare la funzione: con `INSERT … RETURNING` la funzione rileggerebbe la tabella senza trovare la riga appena inserita.
- `project_members_select`: chi legge il progetto oppure chi lo configura. `project_members_insert` accetta solo utenti che sono già membri del workspace.
- L'admin che vuole leggere le issue di un progetto privato si aggiunge a `project_members`. È un'azione esplicita e visibile nella lista membri.
- `merge_labels` e `label_usage` sono `SECURITY DEFINER` con controllo esplicito del ruolo: una fusione di label deve spostare anche le assegnazioni sulle issue private che l'admin non legge, e il conteggio d'uso deve includerle.

UI:

- La sidebar mostra solo i progetti di cui l'utente legge le issue (`ProjectSummary.can_read`).
- Impostazioni → Progetti mostra tutti i progetti visibili, privati compresi, con la gestione dei membri.
- `/p/[key]` di un progetto privato non leggibile risponde 404, come un progetto inesistente.

## Conseguenze

- Test in `tests/db/m1.test.ts`: un admin non membro vede il progetto, i suoi stati e i suoi membri, ma zero issue e zero attività; dopo essersi aggiunto vede le issue; un member non elencato non vede nemmeno il progetto; un member non può gestire `project_members`.
- `delete_status` su un progetto privato non leggibile non riesce a spostare le issue (RLS), quindi il trigger blocca la cancellazione. L'admin deve prima aggiungersi al progetto: è il comportamento voluto.

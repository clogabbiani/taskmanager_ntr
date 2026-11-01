# TASKME NTR — CLAUDE.md

> Documento di governo del progetto. Contiene le decisioni vincolanti, il contratto dati, il modello permessi e le milestone della Fase 1.
> Claude Code implementa; non rinegozia le decisioni marcate **[VINCOLANTE]**. Se una decisione si rivela impraticabile, si ferma, scrive il problema in `STATUS.md` sotto "Escalation" e aspetta.

Repo: `https://github.com/clogabbiani/taskmanager_ntr`
Owner / governance: Claudio Gabbiani (R&D Manager, NTR Biosensors)
Lingua UI: **italiano** (unica lingua in Fase 1; stringhe centralizzate in `src/i18n/it.ts` per non precludere l'inglese)
Lingua codice, commenti, commit: **inglese**

---

## 0. Perché esiste

Sostituisce il Jira Work Management free (site `claudiogabbiani.atlassian.net`, progetti `NBI` e `PN`) per il team NTR Biosensors. Problemi di Jira che TASKME deve risolvere:

1. Tutti e 4 i membri devono poter amministrare tutto (progetti, utenti, workflow, cancellazioni).
2. Label illimitate, colorate, ricercabili. In Jira le label venivano usate come surrogato di campi che non esistevano (rischio, "in linea", "obiettivo").
3. Viste: il team ragiona a **Gantt** (date inizio/fine, giorni pianificati, avanzamento %, rischio). Jira non aveva né i campi né la timeline. TASKME ha i campi nativi e quattro viste: Kanban, Tabella, Timeline, Calendario.
4. Commenti, menzioni, allegati, notifiche email: indispensabili.

Non è un sistema QMS. Nessun requisito di audit trail immutabile, firme elettroniche o design control. L'activity log serve per uso interno, non per il fascicolo tecnico MDR.

---

## 1. Stack **[VINCOLANTE]**

| Livello | Scelta | Note |
|---|---|---|
| Framework | **Next.js 15, App Router, TypeScript strict** | Server Components di default, Server Actions per le mutazioni, Route Handlers solo per webhook/upload |
| UI | **Tailwind CSS + shadcn/ui** | Nessuna altra component library. Icone: lucide-react |
| Stato client / tabelle | TanStack Query + TanStack Table | |
| Drag & drop | dnd-kit | Kanban e riordino |
| Editor rich text | Tiptap con estensione Markdown + Mention | Vedi §3 per il formato di storage |
| DB | **Postgres su Supabase** | Free tier. Migrazioni versionate in repo |
| ORM | **Drizzle ORM** + drizzle-kit per le migrazioni | SQL-first, schema in `src/db/schema.ts` |
| Auth | **Supabase Auth, provider Google** | Vedi §4 |
| Storage allegati | Supabase Storage, bucket privato `attachments`, signed URL | |
| Realtime | Supabase Realtime sulle tabelle `issues`, `comments` | M2+, non prima |
| Email | **Resend** | Template React Email |
| Hosting | **Vercel** | Preview deployment per ogni PR, production da `main` |
| Test | Vitest (unit, logica dominio) + Playwright (3-5 smoke E2E) | |
| CI | GitHub Actions: lint, typecheck, test, drizzle check | Obbligatoria verde per merge |
| Package manager | pnpm | |

Escluso esplicitamente: FastAPI/Python nel runtime (solo eventuali script di supporto), Prisma, Redux, CSS-in-JS, librerie Gantt commerciali. Una libreria Gantt open source (es. `gantt-task-react`, `frappe-gantt`) è ammessa se soddisfa §6.3; altrimenti si costruisce in SVG.

Struttura repo:

```
/
├── CLAUDE.md                 ← questo file
├── STATUS.md                 ← stato corrente, aggiornato a fine di ogni sessione
├── docs/decisions/ADR-xxx.md ← una ADR per ogni scelta non banale presa durante l'implementazione
├── migration/
│   ├── jira_export_nbi.json  ← export completo progetto NBI (fornito)
│   └── user_mapping.json     ← displayName Jira → email TASKME
├── scripts/import-jira.ts
├── drizzle/                  ← migrazioni generate
└── src/
    ├── app/                  ← route (App Router)
    ├── components/
    ├── db/schema.ts
    ├── features/<dominio>/   ← issues, projects, views, comments, notifications, auth
    ├── i18n/it.ts
    └── lib/
```

---

## 2. Modello organizzativo

- Un solo **workspace**: "NTR Biosensors". Il modello dati è multi-workspace pronto, la UI di Fase 1 no.
- Più **progetti** nel workspace. Ogni progetto ha una **key** (es. `NBI`, `PN`) e numera le issue `KEY-n`.
- Progetti **privati**: le issue (e tutto ciò che vi è collegato: commenti, allegati, attività) sono leggibili solo dai membri elencati in `project_members`. Serve per `PN` "Task personali NTR" (privato, membro: Edoardo). Tutti gli altri progetti sono visibili a tutto il workspace.
- Admin e owner **vedono sempre** i progetti privati come oggetti di configurazione (Impostazioni → Progetti: nome, key, colore, stati, membri) e ne **gestiscono i membri**, ma ne leggono le issue solo se sono anch'essi membri del progetto. (Decisione 2026-11-01, review M0.)

---

## 3. Contratto dati **[VINCOLANTE sui nomi e i tipi; i dettagli di indice sono liberi]**

Tutti gli id sono `uuid`. Tutte le tabelle hanno `created_at`, `updated_at` (`timestamptz`). Soft delete con `archived_at` dove indicato. Nomi tabella al plurale, snake_case.

### 3.1 Identità e permessi

```
users                 id, email (unique), display_name, avatar_url, created_at
workspaces            id, name, slug
workspace_members     workspace_id, user_id, role ENUM('owner','admin','member','viewer'), joined_at   PK(workspace_id,user_id)
allowed_signins       id, workspace_id, kind ENUM('domain','email'), value   -- es. ('domain','ntrbiosensors.it'), ('email','x@gmail.com')
```

### 3.2 Progetti e configurazione

```
projects              id, workspace_id, key (unique per workspace, 2-6 caratteri maiuscoli), name, description, color,
                      is_private bool, issue_counter int (ultimo numero emesso), archived_at
project_members       project_id, user_id        -- usata solo se is_private
statuses              id, project_id, name, category ENUM('todo','in_progress','done'), position int, color
labels                id, workspace_id, name (unique per workspace, case-insensitive), color
```

Stati di default alla creazione di un progetto **[VINCOLANTE]**: `To Do` (todo) → `In Progress` (in_progress) → `Review` (in_progress) → `Done` (done). Ogni progetto può aggiungere/rinominare/riordinare stati; deve sempre esistere almeno uno stato per categoria. Nessun motore di transizioni: da qualunque stato si va a qualunque stato.

### 3.3 Issue

```
issues
  id, project_id, number int (KEY-number unico per progetto), type ENUM('epic','task','subtask'),
  parent_id (nullable; subtask→task, task→epic; epic→null),
  title text NOT NULL, description_md text, description_text text (plain, per ricerca),
  status_id, priority ENUM('lowest','low','medium','high','highest') default 'medium',
  start_date date, due_date date, planned_days int, progress smallint 0-100 default 0,
  risk ENUM('none','low','medium','high') default 'none',
  external_collaborators text[] default '{}',        -- nomi liberi: "ICAPE", "Milella", "Florian"
  rank text (LexoRank) per ordinamento manuale nelle board,
  created_by, archived_at
issue_assignees       issue_id, user_id            -- assegnatari multipli
issue_labels          issue_id, label_id
issue_links           id, from_issue_id, to_issue_id, kind ENUM('relates','blocks')   -- 'blocks' implica 'is blocked by' inverso
```

Regole:
- Gerarchia a tre livelli, rigida: epic → task → subtask. Un subtask non può avere figli. Il cambio tipo è permesso solo se la gerarchia resta valida.
- `number` è emesso da `projects.issue_counter` in transazione. L'import può forzare `number` e poi riallinea il counter al massimo.
- `progress` di un'epic è **calcolato** (media pesata per `planned_days` dei figli, fallback media semplice), mai scritto a mano; per task/subtask è manuale. Esposto come campo derivato, non colonna.
- `description_md` è Markdown. Menzioni serializzate come `@[Nome Cognome](user:<uuid>)`. Tiptap lo legge e lo scrive via estensione Markdown.

### 3.4 Collaborazione

```
comments              id, issue_id, author_id, body_md, body_text, edited_at, archived_at
attachments           id, issue_id, comment_id (nullable), uploaded_by, storage_path, file_name, mime_type, size_bytes
activity_log          id, issue_id, actor_id, action ENUM('created','updated','commented','attached','archived','restored','moved'),
                      field text (nullable), old_value jsonb, new_value jsonb, created_at
notifications         id, user_id, kind ENUM('mention','assigned','comment','status_changed','due_soon'), issue_id, comment_id,
                      actor_id, read_at, emailed_at
notification_prefs    user_id, email_on_mention bool default true, email_on_assign bool default true,
                      email_on_comment bool default true, email_digest ENUM('off','daily') default 'off'
saved_views           id, workspace_id, project_id (nullable = cross-progetto), owner_id, name,
                      kind ENUM('board','table','timeline','calendar'), config jsonb, is_shared bool
```

### 3.5 Sicurezza a livello DB **[VINCOLANTE]**

- **RLS attiva su tutte le tabelle.** Policy basate su `workspace_members` e, per progetti privati, su `project_members`.
- Il server Next.js accede a Supabase con la sessione dell'utente (anon key + JWT). La **service role key** è usata solo da `scripts/import-jira.ts`, dai webhook e dal job email, mai dal codice servito al browser.
- Allegati: bucket privato, upload via signed upload URL generata server-side dopo controllo permessi, download via signed URL a 1 ora.

---

## 4. Autenticazione e autorizzazione **[VINCOLANTE]**

- Login **solo Google** (Supabase Auth, provider Google). Niente password.
- Al callback: l'email deve corrispondere a una riga di `allowed_signins` (dominio Workspace NTR oppure email singola in allow-list). Altrimenti: sessione terminata, pagina "Accesso non autorizzato", nessun utente creato.
- Primo accesso autorizzato → riga in `users` + `workspace_members` con ruolo `member`. Promozione a `admin` dalla pagina Impostazioni → Membri.
- Seed iniziale: Claudio Gabbiani `owner` (accede con `c.gabbiani@ntrbiosensors.com`); Edoardo Salamone (`e.salamone@ntrbiosensors.com`), Merk, Nicola Ferrante `admin`. Le email reali vanno in `migration/user_mapping.json` (Merk e Nicola da compilare, vedi §10).
- `clogabbiani@gmail.com` **non** è in allow-list: è l'account di prova "non autorizzato" per la verifica del rifiuto al login.

Ruoli (workspace-level):

| Azione | viewer | member | admin | owner |
|---|---|---|---|---|
| Vedere progetti non privati | ✓ | ✓ | ✓ | ✓ |
| Creare/modificare/commentare issue | | ✓ | ✓ | ✓ |
| Archiviare issue | | ✓ (proprie) | ✓ | ✓ |
| Creare/modificare/archiviare progetti, stati, label | | | ✓ | ✓ |
| Invitare/rimuovere membri, cambiare ruoli, allow-list | | | ✓ | ✓ |
| Eliminare definitivamente (hard delete) | | | ✓ | ✓ |
| Gestire membri di progetti privati (anche senza esserne membri; le issue restano visibili solo ai membri) | | | ✓ | ✓ |
| Trasferire ownership, eliminare workspace | | | | ✓ |

L'owner non può essere declassato da un admin. Non c'è altra differenza fra admin e owner.

---

## 5. Funzionalità Fase 1

### 5.1 Issue
- Creazione rapida (titolo + progetto + tipo) da ovunque con `C`; creazione completa nel pannello laterale.
- Pannello dettaglio laterale (non pagina intera) con URL stabile `/p/NBI/issues/NBI-42`, apribile anche come pagina.
- Tutti i campi di §3.3 editabili inline. Assegnatari multipli con avatar. Label con autocomplete e creazione al volo (solo admin crea; member sceglie fra esistenti).
- Collaboratori esterni: chip testuali con autocomplete sui valori già usati nel workspace.
- Sottoattività e figli visibili nel dettaglio con progress aggregato.
- Link fra issue (`relates`, `blocks`). Un'issue bloccata mostra un badge.
- Archivia / ripristina. Hard delete solo admin, con conferma digitando la key.
- Ricerca globale (`Cmd/Ctrl+K`): titolo, key, testo descrizione, commenti. Postgres full-text in italiano (`to_tsvector('italian', …)`), niente servizi esterni.

### 5.2 Viste
Ogni vista è filtrabile (progetto, stato, tipo, assegnatario, label, rischio, priorità, date, epic, testo) e salvabile come `saved_view` personale o condivisa. Le viste condivise sono visibili a tutti; solo autore e admin le modificano.

- **Kanban**: colonne = stati; raggruppamento alternativo per assegnatario, epic, label, priorità, rischio. Drag & drop fra colonne e riordino dentro la colonna (LexoRank). Swimlane per epic opzionali. Card: key, titolo, assegnatari, label, due date (rossa se scaduta), progress bar.
- **Tabella**: colonne configurabili, ordinamento multiplo, editing inline di stato/assegnatari/date/priorità/progress, raggruppamento per epic, selezione multipla con azioni bulk (stato, assegnatario, label, archivia).
- **Timeline (Gantt)** **[requisito primario del team]**: una riga per issue, epic come gruppi espandibili, barra da `start_date` a `due_date`, riempimento proporzionale a `progress`, colore per rischio, drag per spostare, resize per cambiare le date, zoom giorno/settimana/mese/trimestre, linea "oggi", issue senza date in una sezione "Non pianificate" in coda. Link `blocks` disegnati come frecce (M2 se la libreria lo permette, altrimenti Fase 2).
- **Calendario**: mese/settimana, issue per `due_date`, drag per cambiarla.
- **I miei task**: vista cross-progetto preconfigurata (assegnato a me, non done), raggruppata per scadenza: scadute / oggi / questa settimana / dopo / senza data.

### 5.3 Commenti, allegati, attività
- Commenti Markdown con Tiptap, @menzioni con autocomplete, modifica ed eliminazione dei propri (admin: di tutti). Niente thread annidati in Fase 1.
- Allegati trascinabili su issue e commenti; anteprima immagini e PDF inline; max 25 MB per file (limite free tier).
- Tab "Attività" nel dettaglio: cronologia campo per campo, da `activity_log`.

### 5.4 Notifiche
- In-app: campanella con contatore, lista, segna tutto come letto. Generate per menzione, assegnazione, commento su issue che segui (creatore, assegnatari, chi ha commentato), cambio stato su issue che segui, scadenza entro 24 h (job giornaliero).
- Email via Resend secondo `notification_prefs`, con de-duplicazione: un'email per evento, mai per evento già letto in-app entro 2 minuti (coda con ritardo). Digest giornaliero opzionale.
- Un job cron (Vercel Cron) alle 07:30 Europe/Rome per `due_soon` e digest.

### 5.5 Amministrazione
- Impostazioni workspace: membri e ruoli, allow-list accessi, label (rinomina, colore, merge di due label, elimina), progetti (crea, key, colore, privato, stati).
- Impostazioni utente: preferenze notifiche, avatar da Google.

### 5.6 Esplicitamente fuori dalla Fase 1
GitHub, Google Calendar, email in ingresso, PWA/push, automazioni, time tracking, sprint, report/grafici, app nativa, inglese, multi-workspace in UI, commenti threaded, custom field definiti dall'utente.

---

## 6. Requisiti non funzionali

- **6.1 Prestazioni**: board e tabella con 500 issue rendono sotto 1 s su rete normale; paginazione/virtualizzazione dove serve.
- **6.2 Mobile**: layout responsive fin da M1 (il team apre il dettaglio issue dal telefono). Kanban su mobile = una colonna alla volta con swipe. Il Gantt su mobile può essere solo-lettura.
- **6.3 Gantt**: deve supportare le interazioni di §5.2 e 200+ righe senza scatti; se la libreria scelta non arriva, si implementa in SVG. Decisione documentata in una ADR.
- **6.4 Accessibilità**: navigazione da tastiera su board e tabella; focus visibile; contrasti AA.
- **6.5 Dati**: backup giornaliero del DB (Supabase lo fa sul free tier con retention limitata; aggiungere export settimanale JSON in Storage via cron). Export CSV/JSON completo dalle Impostazioni.
- **6.6 Privacy**: nessun dato clinico o di pazienti entra in questo tool. Se compaiono, è un errore d'uso, non un requisito.

---

## 7. Import da Jira **[VINCOLANTE sul mapping]**

Sorgenti:
- `migration/jira_export_nbi.json`: 77 issue del progetto NBI (12 epic, 65 task), già estratte via API. Zero commenti, zero allegati, zero link. **Non serve interrogare Jira per NBI.**
- Progetto `PN` (1 issue, privato di Edoardo): lettura via Jira REST API con API token (variabili `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`), oppure export manuale caricato come `migration/jira_export_pn.json` con lo stesso schema.

Mapping:

| Jira | TASKME |
|---|---|
| `key` NBI-41 | `project.key`=NBI, `number`=41 (conservato) |
| `issuetype` Epic / Task / Sub-task | `type` epic / task / subtask |
| `parent.key` | `parent_id` |
| `summary` | `title` |
| `status` To Do / In Progress / Done | stato con stesso nome del progetto target (`Review` resta vuoto) |
| `assignee` | `issue_assignees` via `user_mapping.json` |
| `reporter` | `created_by` via mapping; fallback Claudio |
| `created` | `created_at`; **se l'orario è esattamente 00:00:00 locale, anche `start_date`** (sono date pianificate importate da un Gantt) |
| `duedate` | `due_date` |
| `priority` | `priority` (default medium se assente) |
| `labels` `rischio-basso/medio/alto` | `risk` low/medium/high, **label non creata** |
| `labels` `in-linea`, `obiettivo` | label `In linea`, `Obiettivo` (create nel workspace) |
| `description` formato `Rischio/Categoria: X \| Avanzamento: N% \| Giorni pianificati: G \| Assegnatari originali: A, B` | parsing per campo, ogni segmento opzionale: `Rischio basso/medio/alto`→`risk` (coerente con la label; in conflitto vince la label), `In linea`/`Obiettivo`→label, N→`progress`, G→`planned_days`, A,B→ se corrisponde a un utente del mapping aggiunto a `issue_assignees`, altrimenti a `external_collaborators`. La description importata viene **svuotata** se composta solo da questi segmenti; se contiene altro testo, resta il testo residuo |
| `updated` | `updated_at` |
| `Rank` | ignorato; rank iniziale per ordine di `created` |

Alias noti per gli "Assegnatari originali": `Claudio`→Claudio Gabbiani; `Edoardo`, `Salamone`→Edoardo Salamone; `Marco`→Merk (**da confermare**, vedi §10); `Nicola`→Nicola Ferrante. Tutti gli altri (`Milella`, `Florian`, `Fanelli`, `Pennisi`, `Andrea`, `Guillaume`, `ICAPE`, `Indiani dev`, `Indiani fornitori`, `india dev`, `indiani`, `TestING`) → `external_collaborators`, normalizzati: `Indiani dev`/`india dev`/`indiani` → `Indiani dev`.

Lo script è **idempotente** (upsert su `(project.key, number)`), gira in dry-run di default stampando un report (issue importate, campi parsati, nomi non mappati), e scrive solo con `--apply`. Ogni issue importata riceve una riga `activity_log` `created` con `new_value = {source:'jira', key:'NBI-41'}`.

Cutover: import → verifica a campione da parte di Claudio su 10 issue → Jira passa in sola lettura (nessuna cancellazione del site Atlassian per 90 giorni).

---

## 8. Convenzioni di lavoro per Claude Code

1. Prima di ogni sessione: leggi `CLAUDE.md` e `STATUS.md`. Alla fine: aggiorna `STATUS.md` (fatto / in corso / bloccato / prossimo passo) e apri ADR per le scelte non banali.
2. Una milestone per PR, o PR più piccole dentro la milestone. Branch `feat/m1-issues-crud`, commit Conventional Commits.
3. `pnpm lint && pnpm typecheck && pnpm test` verdi prima di ogni commit. CI obbligatoria.
4. Niente segreti nel repo. `.env.example` sempre aggiornato con ogni nuova variabile.
5. Migrazioni solo via drizzle-kit, mai modifiche manuali al DB di produzione.
6. Niente scope creep verso §5.6. Se una funzionalità di Fase 2 sembra "gratis", si annota in `STATUS.md` → "Idee", non si implementa.
7. Stringhe UI solo in `src/i18n/it.ts`. Niente testo hardcoded nei componenti.
8. Le decisioni **[VINCOLANTE]** non si cambiano in autonomia: escalation in `STATUS.md`.
9. Le domande aperte di §10 non bloccano M0–M2; usare i placeholder indicati e tracciarle in `STATUS.md`.

---

## 9. Milestone Fase 1

| M | Contenuto | Definition of done |
|---|---|---|
| **M0 Bootstrap** | Repo Next.js + Tailwind + shadcn, Drizzle + schema completo §3 con prima migrazione, RLS, Supabase Auth Google con allow-list, seed workspace + 4 utenti + progetto NBI con 4 stati, layout app (sidebar progetti, topbar), CI, deploy Vercel | Login con Google funziona in produzione per un'email in allow-list e viene rifiutato per una fuori; `pnpm test` verde; URL Vercel attivo |
| **M1 Issue core** | CRUD issue, gerarchia, stati, priorità, label, assegnatari multipli, date, planned_days, progress, rischio, collaboratori esterni, link, archivia, pannello dettaglio con URL, ricerca globale, vista **Tabella** con filtri e viste salvate, Impostazioni (membri, label, progetti, stati) | Posso ricreare a mano 10 issue del vecchio Jira con tutti i loro campi usando solo la UI; tabella filtra e salva una vista |
| **M2 Viste** | **Kanban** con DnD e raggruppamenti, **Timeline/Gantt**, **Calendario**, **I miei task**, responsive mobile, Realtime | Sposto una card su Kanban e la vedo muoversi in un secondo browser; trascino una barra sul Gantt e le date cambiano; il Gantt con 77 issue è fluido |
| **M3 Collaborazione** | Commenti Tiptap + menzioni, allegati con anteprima, activity log, notifiche in-app, email Resend, preferenze, cron due_soon/digest | Menziono un collega: lui vede la campanella e riceve l'email; carico un PDF e lo apro in anteprima; la tab Attività mostra il cambio di stato |
| **M4 Migrazione e cutover** | `scripts/import-jira.ts` con dry-run e report, import NBI + PN, export CSV/JSON, backup settimanale, pagina "Guida rapida" | 77 issue NBI importate con start/due/progress/planned_days/risk corretti su 10 verificate a campione da Claudio; team usa TASKME, Jira in sola lettura |

Stima indicativa: M0 1 sessione, M1 2-3, M2 2-3, M3 2, M4 1. Il Gantt è il rischio tecnico maggiore: affrontarlo per primo in M2 e aprire subito la ADR sulla libreria.

---

## 10. Domande aperte (non bloccano M0–M2)

| # | Domanda | Placeholder finché non risolta |
|---|---|---|
| Q1 | ~~Dominio email Google Workspace NTR da mettere in `allowed_signins`~~ **Risolta 2026-11-01**: `ntrbiosensors.com` | `allowed_signins` = `('domain','ntrbiosensors.com')` + email dei membri mappati |
| Q2 | Email reali di Merk, Nicola Ferrante; "Marco" negli Assegnatari originali è Merk? (Claudio = `c.gabbiani@ntrbiosensors.com`, Edoardo = `e.salamone@ntrbiosensors.com`: risolte 2026-11-01) | `user_mapping.json` con campi `email: null`; import assegna a `external_collaborators` i nomi senza email |
| Q3 | Dominio pubblico dell'app (es. `taskme.ntrbiosensors.it`) e dominio mittente per Resend | URL Vercel di default; mittente `onboarding@resend.dev` in sviluppo |
| Q4 | Progetti aggiuntivi oltre NBI e PN da creare al cutover (es. QMS, Fornitori, Firmware come progetti separati invece che epic) | Solo NBI e PN; le 12 epic restano epic |

---

## 11. Registro decisioni iniziali (ADR-000)

| Data | Decisione | Motivazione |
|---|---|---|
| 2026-10-29 | Costruire TASKME invece di self-hostare Plane/OpenProject | Il team vuole campi Gantt nativi (rischio, avanzamento, giorni pianificati), assegnatari multipli e collaboratori esterni testuali; controllo totale; progetto a 4 utenti dove il costo di manutenzione è accettabile |
| 2026-10-29 | Next.js + Supabase + Vercel, niente Python nel runtime | Una codebase TS, free tier sufficiente, riuso dei tipi in una futura app Expo |
| 2026-10-29 | Solo login Google con allow-list | Workspace aziendale già esistente; zero gestione password |
| 2026-10-29 | Stati default To Do / In Progress / Review / Done, nessun motore di transizioni | Richiesta del team; la rigidità dei workflow Jira non è mai stata usata |
| 2026-10-29 | Chiavi Jira conservate (NBI-41 resta NBI-41) | Continuità nei riferimenti scritti in email, Confluence, commit |
| 2026-10-29 | Rischio come campo enum, non label; "In linea"/"Obiettivo" come label | Separa un attributo con semantica fissa da tag liberi |
| 2026-10-29 | Collaboratori esterni come testo, non utenti | Fornitori e consulenti non accedono al tool; evita account fantasma |
| 2026-10-29 | Progress epic calcolato, non editabile | Evita incoerenze tra padre e figli |
| 2026-10-29 | Nessuna funzione QMS | Dichiarato esplicitamente fuori scopo dal team |

# Prompt di avvio — Claude Code, milestone M2 "Viste"

Da incollare in Claude Code dentro il repo, su `main` aggiornato (`git checkout main && git pull`).

---

Leggi `CLAUDE.md` e `STATUS.md` per intero prima di fare qualsiasi cosa. M1 è mergiata e verificata a mano in produzione (DoD superata su progetto di prova `TST`). Sei l'implementatore di TASKME NTR; le decisioni [VINCOLANTE] non si discutono. Se qualcosa è impraticabile, scrivi in `STATUS.md` → Escalation e fermati.

Obiettivo di questa sessione: **milestone M2 Viste**, Definition of Done di CLAUDE.md §9: "Sposto una card su Kanban e la vedo muoversi in un secondo browser; trascino una barra sul Gantt e le date cambiano; il Gantt con 77 issue è fluido."

Lavora in **tre PR** verso `main`, nell'ordine sotto, ognuna con CI verde e `STATUS.md` aggiornato. Il Gantt è il rischio tecnico maggiore di tutta la Fase 1: per questo è nella **prima** PR, non nell'ultima.

Prerequisito di lavoro: per sviluppare e provare le viste ti servono dati realistici. Scrivi `scripts/seed-demo.ts` (`pnpm db:seed:demo`) che crea un progetto `DEMO` con le 77 issue di `migration/jira_export_nbi.json` mappate con le stesse regole di CLAUDE.md §7 (è anche una prova generale dell'import di M4: fattorizza il parser in `src/features/import/jira-parser.ts` con test unitari, così M4 lo riusa). Lo script è idempotente e ha `--reset` per svuotare e ricreare DEMO. Non toccare NBI, PN e TST.

## PR 1 — Timeline / Gantt

1. **ADR-005 prima del codice**: valuta in mezza pagina `frappe-gantt`, `gantt-task-react`, `@svar-ui/react-gantt` (o equivalenti attivi) contro i requisiti di CLAUDE.md §5.2 e §6.3: righe raggruppate per epic espandibili, barra `start_date→due_date`, riempimento proporzionale a `progress`, colore per `risk`, drag per spostare, resize per cambiare date, zoom giorno/settimana/mese/trimestre, linea "oggi", 200+ righe fluide, frecce per i link `blocks`, licenza compatibile. Se nessuna regge, costruiscilo in SVG + React con virtualizzazione verticale: righe a sinistra in una lista virtualizzata, barre a destra in un `<svg>` con `transform` per lo zoom, drag/resize con pointer events. Decidi, scrivi l'ADR, poi implementa. Non cambiare libreria a metà: se la scelta si rivela sbagliata, escalation.
2. **Vista Timeline** in `/p/[key]` (tab Timeline): tutto quanto sopra. Issue senza date in una sezione "Non pianificate" in fondo, trascinabili sulla timeline per assegnare le date (inizio = punto di drop, fine = inizio + `planned_days` se presente, altrimenti +5 giorni). Dopo drag/resize salva via server action, optimistic update, rollback con toast se fallisce. Click sulla barra o sul titolo apre il pannello dettaglio di M1. Frecce `blocks`: se la libreria le supporta, altrimenti annota in STATUS.md → Idee e vai avanti.
3. Usa la **barra filtri di M1** (stessa componente, stato nell'URL) anche qui; le viste salvate di tipo `timeline` memorizzano in `config` anche zoom e stato di espansione delle epic.
4. Mobile (< 768px): Timeline sola lettura, scroll orizzontale, zoom bloccato a settimana.
5. Test: unit sulla geometria (data → x, x → data, snap al giorno), sul calcolo del range visibile e sull'espansione; E2E locale: trascina una barra e verifica le nuove date nel pannello.

## PR 2 — Kanban e Calendario

6. **Vista Kanban** (tab Kanban) con `dnd-kit`: colonne = stati del progetto in ordine `position`, intestazione con nome, colore, conteggio; raggruppamento alternativo per assegnatario, epic, label, priorità, rischio (quando si raggruppa per un campo diverso dallo stato, lo spostamento fra colonne cambia quel campo; per i multi-valore come assegnatari e label aggiunge il valore nuovo e toglie quello della colonna di partenza). Riordino dentro la colonna con `rank` (LexoRank di M1). Swimlane per epic attivabili da un toggle. Card: key, titolo, avatar assegnatari, label come puntini colorati con tooltip, due date (rossa se scaduta e non done), progress bar sottile, badge "Bloccata". Click apre il pannello dettaglio; il drag non deve aprire il pannello. Colonne collassabili. Pulsante "+" in fondo a ogni colonna per creare un'issue in quello stato. Virtualizzazione per colonna oltre le 100 card.
7. **Vista Calendario** (tab Calendario): mese e settimana, issue posizionate per `due_date`, chip con key + titolo + avatar, colore per rischio; drag su un altro giorno cambia `due_date`; click sul giorno vuoto crea un'issue con quella scadenza; "oggi" evidenziato; navigazione mese precedente/successivo e selettore. Lunedì come primo giorno, nomi in italiano.
8. Entrambe usano la barra filtri condivisa e le viste salvate (`kind` board / calendar, con `config` che include raggruppamento, swimlane, mese corrente no).
9. Mobile: Kanban una colonna alla volta con swipe orizzontale e tab delle colonne in alto; Calendario solo vista settimana a lista.
10. Test: unit sulla logica di cambio campo quando si sposta fra colonne raggruppate per campo non-stato; E2E locale: sposta una card da To Do a In Progress e verifica lo stato nel pannello.

## PR 3 — I miei task, Realtime, rifiniture

11. **Pagina "I miei task"** `/me`: cross-progetto, issue assegnate all'utente corrente non in categoria `done`, raggruppate in sezioni: Scadute / Oggi / Questa settimana / Più avanti / Senza data; ogni riga come in tabella compatta con stato e progress editabili inline; contatore per sezione; toggle "includi Review come fatto: no". Link in sidebar sopra i progetti, con badge del numero di scadute.
12. **Realtime** con Supabase Realtime (`postgres_changes`) sulle tabelle `issues`, `issue_assignees`, `issue_labels`, `statuses` filtrate per `project_id` della vista aperta: aggiorna le query TanStack in cache senza ricaricare la pagina. Gestisci riconnessione e debounce (max un refetch ogni 500 ms). Le modifiche fatte dall'utente stesso non devono produrre flicker (ignora gli eventi che corrispondono a mutazioni locali in corso). Abilita Realtime sulle tabelle via migrazione (`alter publication supabase_realtime add table …`), non a mano dal dashboard.
13. **Playwright in CI**: job separato nel workflow GitHub Actions che gira contro un Postgres di servizio con le migrazioni applicate e un bypass di login **solo in test** (cookie di sessione creato da una route disponibile esclusivamente quando `E2E_AUTH_BYPASS=1` e `NODE_ENV=test`; la route non deve esistere nel build di produzione: verifica con un test che in produzione risponda 404). Gli E2E esistenti e nuovi girano in CI.
14. **Rifiniture M1** segnalate: l'inserimento link nella descrizione usa ancora `window.prompt` → sostituisci con un popover shadcn (URL + testo). Tab Kanban/Timeline/Calendario ora abilitati.
15. **Prestazioni**: misura con il progetto DEMO (77 issue) e con un DEMO gonfiato a 500 issue (`--size 500`, titoli e date generati): Tabella, Kanban e Timeline devono rendere sotto 1 s dopo il caricamento dati; riporta i numeri in STATUS.md.

## Trasversali

- Stringhe solo in `src/i18n/it.ts`. Nessun testo hardcoded, nemmeno nei tooltip.
- Tutto operabile da tastiera dove ha senso (Kanban: frecce per spostare la card selezionata fra colonne con `Alt+←/→`; Timeline: `+`/`-` per lo zoom).
- Nuove ADR: `ADR-005-gantt-implementation.md`, `ADR-006-realtime-strategy.md`, `ADR-007-e2e-auth-bypass.md`.
- Niente scope creep verso M3/M4 (commenti, menzioni, allegati, notifiche, email, import definitivo, GitHub, PWA). Idee in `STATUS.md` → Idee.
- Prima di dichiarare ogni PR pronta: `pnpm lint && pnpm typecheck && pnpm test` verdi, `next build` senza warning, eventuali migrazioni provate con `pnpm db:migrate` contro il DB Supabase reale, `pnpm db:seed:demo` eseguito con successo.

Alla fine di ogni PR riassumimi in 10 righe: cosa è pronto, cosa devo verificare io a mano in produzione, cosa è rimasto aperto. Alla fine di M2 aggiorna `STATUS.md` con la checklist della DoD e una lista di 8 verifiche manuali da fare sul progetto DEMO (Kanban in due browser, drag sul Gantt, calendario, I miei task, mobile).

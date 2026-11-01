# Prompt di avvio — Claude Code, milestone M1 "Issue core"

Da incollare in Claude Code dentro il repo, su `main` aggiornato (`git checkout main && git pull`).

---

Leggi `CLAUDE.md` e `STATUS.md` per intero prima di fare qualsiasi cosa. M0 è chiusa e verificata in produzione (login Google con allow-list funzionante). Sei l'implementatore di TASKME NTR; le decisioni [VINCOLANTE] non si discutono. Se qualcosa è impraticabile, scrivi in `STATUS.md` → Escalation e fermati.

Obiettivo di questa sessione: **milestone M1 Issue core**, Definition of Done di CLAUDE.md §9: "Posso ricreare a mano 10 issue del vecchio Jira con tutti i loro campi usando solo la UI; la tabella filtra e salva una vista."

Lavora su branch `feat/m1-issues-core`. Dividi in **tre PR** verso `main`, nell'ordine sotto, ognuna con CI verde e `STATUS.md` aggiornato. Non aspettare il merge della precedente per continuare: apri la successiva da un branch figlio e dimmelo, farò i merge in sequenza.

## PR 1 — Correzioni M0 e fondamenta dati

1. **Progetti privati** (decisione review M0, CLAUDE.md §2 e §4): correggi le policy RLS così che admin e owner vedano sempre la riga di `projects` (anche se privato e non membri) e possano scrivere su `project_members`, ma leggano `issues`, `comments`, `attachments`, `activity_log` di un progetto privato solo se membri. Aggiorna `tests/db/rls.test.ts` con i casi: admin non membro vede il progetto ma zero issue; admin aggiunge se stesso a `project_members` e vede le issue; member non membro non vede nemmeno il progetto.
2. **Vincolo stati**: trigger che impedisce di cancellare o cambiare categoria a uno stato se lascerebbe il progetto senza almeno uno stato per categoria (`todo`, `in_progress`, `done`). Impedisci anche la cancellazione di uno stato che ha issue associate: la UI dovrà prima chiedere lo stato di destinazione e spostarle. Test.
3. **Campi derivati e funzioni**: funzione SQL o query per `epic progress` calcolato (media pesata per `planned_days` dei figli diretti con `planned_days > 0`, fallback media semplice, 0 se nessun figlio). Trigger che valida la gerarchia su insert/update di `parent_id` e `type` (epic→null, task→epic o null, subtask→task; nessun ciclo). LexoRank: utility TS in `src/lib/rank.ts` con `between(a, b)`, `before(a)`, `after(b)`, testata. Full-text: colonna generata `search_vector tsvector` su `issues` (title + description_text, config `italian`) con indice GIN, idem su `comments.body_text`.
4. **Layer dati applicativo**: in `src/features/issues/` server actions tipizzate con zod per create/update/archive/restore/delete/link/unlink/reorder, che scrivono `activity_log` campo per campo (una riga per campo cambiato, `old_value`/`new_value` jsonb). In `src/features/projects/`, `labels/`, `members/` le action di amministrazione. Tutte verificano il ruolo lato server oltre alla RLS. Test unitari sulla logica di diff dell'activity log.
5. Migrazioni via drizzle-kit, più il file SQL manuale per policy/trigger/funzioni (continua la numerazione `0002_…`). `pnpm db:migrate` deve applicarle in modo idempotente sul DB Supabase già popolato dal seed M0: **non** rigenerare `0000`/`0001`.

## PR 2 — Issue: creazione, dettaglio, campi

6. **Creazione rapida**: tasto `C` da qualunque pagina apre un dialog con titolo, progetto (preselezionato quello corrente), tipo (default task), parent opzionale. Invio crea e apre il dettaglio. Pulsante "+ Nuova" visibile anche in topbar.
7. **Pannello dettaglio** laterale (sheet da destra, larghezza ~560px, ridimensionabile a tutta pagina) con URL stabile `/p/[key]/issues/[KEY-n]`: aprendo quell'URL direttamente si vede la pagina intera con lo stesso componente. Contenuto: key + tipo + breadcrumb del parent; titolo editabile inline; descrizione Markdown con **Tiptap** (bold, italic, liste, link, codice, heading; estensione Markdown per lo storage in `description_md`; `description_text` derivato lato server). Le @menzioni le rimandi a M3, non inserire l'estensione Mention ora.
8. **Proprietà editabili inline** nel pannello: stato (select con colori), priorità, assegnatari multipli (popover con ricerca utenti del workspace, avatar), label (popover con ricerca; creazione al volo solo per admin/owner), data inizio, data scadenza (datepicker), giorni pianificati, avanzamento % (slider + input; per le epic sola lettura con il valore calcolato), rischio, collaboratori esterni (chip input con autocomplete sui valori già presenti nel workspace). Ogni modifica salva subito, con optimistic update e toast di errore in caso di fallimento.
9. **Figli e collegamenti**: sezione "Sottoattività" / "Task dell'epic" con lista dei figli (key, titolo, stato, assegnatari, progress), creazione inline di un figlio, drag per riordinare (rank). Sezione "Collegamenti": aggiungi link `relates` / `blocks` cercando un'issue per key o titolo; un'issue con un blocco attivo (issue che la blocca non in categoria `done`) mostra badge "Bloccata" in testa.
10. **Archivia / Ripristina / Elimina**: archivia dal menu `…` del pannello; le issue archiviate escono da tutte le viste salvo filtro "Mostra archiviate"; ripristina dalla stessa posizione. Elimina definitivamente solo admin/owner, con dialog che chiede di digitare la key.
11. **Tab Attività** nel pannello: lista cronologica da `activity_log`, formato "Claudio ha cambiato Stato da To Do a In Progress · 2 ore fa", in italiano, con valori risolti (nome utente, nome stato, nome label).
12. **Ricerca globale** `Cmd/Ctrl+K`: cerca per key esatta, titolo e full-text su descrizione; risultati raggruppati per progetto; Invio apre il dettaglio.

## PR 3 — Vista Tabella, viste salvate, Impostazioni

13. **Vista Tabella** in `/p/[key]` (tab Tabella, già presente come placeholder) con TanStack Table: colonne configurabili (mostra/nascondi, riordina, ridimensiona; set di default: key, titolo, tipo, stato, assegnatari, priorità, label, inizio, scadenza, giorni, avanzamento, rischio); ordinamento multiplo; **editing inline** di stato, assegnatari, priorità, date, avanzamento direttamente in cella; raggruppamento per epic con riga di gruppo collassabile; selezione multipla con barra azioni bulk (cambia stato, aggiungi/rimuovi assegnatario, aggiungi/rimuovi label, archivia); virtualizzazione righe (deve reggere 500 issue). Click su una riga apre il pannello dettaglio senza lasciare la tabella.
14. **Barra filtri** sopra la tabella, condivisa poi con le altre viste in M2: filtri componibili su stato, tipo, assegnatario, label, priorità, rischio, epic, intervallo date inizio/scadenza, testo, "mostra archiviate"; i filtri attivi compaiono come chip rimovibili; stato dei filtri nell'URL (`?status=…&assignee=…`) così i link sono condivisibili.
15. **Viste salvate** (`saved_views`): "Salva vista" dalla barra filtri → nome, personale o condivisa. Elenco viste nel sottomenu del progetto in sidebar. Le viste condivise le modifica solo l'autore o un admin. Una vista salvata memorizza in `config` filtri, ordinamento, colonne, raggruppamento.
16. **Impostazioni workspace** `/settings`: **Membri** (lista con ruolo, cambio ruolo da select — owner non declassabile da admin — rimozione; sezione allow-list con aggiunta/rimozione di domini ed email), **Label** (lista con colore, rinomina, cambio colore, merge "unisci in…", elimina con conferma e conteggio issue), **Progetti** (crea con nome/key/colore/privato, modifica, archivia; per i progetti privati gestione membri visibile ad admin/owner; per ogni progetto gestione **Stati**: aggiungi, rinomina, colore, riordina drag, cambia categoria, elimina con scelta dello stato di destinazione per le issue). Solo admin/owner accedono a `/settings`; member vede link disabilitato.
17. **Impostazioni utente** `/settings/profile`: nome visualizzato, avatar (da Google, sola lettura), placeholder "Notifiche: disponibile in M3".
18. Pagina `/p/[key]` con tab Kanban/Timeline/Calendario ancora disabilitati con tooltip "M2".

## Trasversali

- Stringhe solo in `src/i18n/it.ts`. Date in formato `gg/mm/aaaa`, relative ("2 ore fa") con `date-fns` locale `it`.
- Responsive: il pannello dettaglio su schermi < 768px è a tutta pagina; la tabella su mobile mostra key, titolo, stato, assegnatari e scrolla in orizzontale per il resto.
- Accessibilità: tutto operabile da tastiera; focus visibile; dialog e popover con focus trap (shadcn lo fa già).
- Test: unit su rank, diff activity log, parsing filtri da URL, calcolo progress epic; test DB su RLS e trigger nuovi; 3 E2E Playwright in locale: crea issue → modifica stato e assegnatario → verifica Attività; crea epic con due task e verifica progress calcolato; salva una vista filtrata e riaprila.
- ADR da aprire: `ADR-002-rank-strategy.md` (LexoRank vs float), `ADR-003-table-and-filters-state.md` (URL vs store), `ADR-004-private-project-visibility.md`.
- Niente scope creep verso M2/M3 (Kanban, Gantt, calendario, commenti, menzioni, allegati, notifiche, realtime). Se qualcosa sembra gratis, annotalo in `STATUS.md` → Idee.
- Prima di dichiarare ogni PR pronta: `pnpm lint && pnpm typecheck && pnpm test` verdi, `next build` senza warning, migrazione provata con `pnpm db:migrate` contro il DB Supabase reale (le variabili sono in `.env`).

Alla fine di ogni PR riassumimi in 10 righe: cosa è pronto, cosa devo verificare io a mano in produzione, cosa è rimasto aperto. Alla fine di M1 aggiorna `STATUS.md` con la checklist della DoD e un elenco di 10 issue del vecchio Jira (prese da `migration/jira_export_nbi.json`) che io ricreerò a mano per la verifica.

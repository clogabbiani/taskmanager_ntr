# ADR-003 — Stato di tabella e filtri: URL o store

- Stato: accettata
- Data: 2026-11-01
- Contesto: CLAUDE.md §1 (TanStack Query + TanStack Table, niente Redux), §5.2 (viste filtrabili e salvabili), PROMPT_M1 §13-15

## Contesto

La vista Tabella ha tre tipi di stato:

1. **cosa** si vede: filtri, ordinamento, raggruppamento;
2. **come** si vede: colonne visibili, ordine, larghezze;
3. stato **effimero**: selezione multipla, gruppi compressi, scroll.

Il prompt chiede che i filtri stiano nell'URL (link condivisibili) e che una vista salvata memorizzi filtri, ordinamento, colonne e raggruppamento. Kanban, Timeline e Calendario (M2) useranno la stessa barra filtri.

Opzioni valutate:

1. Tutto in uno store client (Zustand o simili), sincronizzato a mano con l'URL. È una dipendenza in più ed è facile che store e URL divergano.
2. Tutto nell'URL, colonne comprese. Gli URL diventano lunghi e illeggibili, e una preferenza personale (la larghezza di una colonna) finirebbe nei link mandati ai colleghi.
3. **Separare per natura**: l'URL per ciò che definisce il contenuto, `localStorage` per le preferenze di visualizzazione, lo stato React locale per l'effimero.

## Decisione

**Opzione 3.**

- **URL** (`src/features/views/filters.ts`): `status`, `type`, `assignee` (`me`, `none` o uuid), `label`, `priority`, `risk`, `epic` (uuid o `none`), `start_from`, `start_to`, `due_from`, `due_to`, `q`, `archived=1`, `sort=campo:asc|desc,…`, `group=epic`, `view=<id>`. Il parsing è difensivo: valori sconosciuti o malformati vengono ignorati. La serializzazione scrive solo i valori diversi dal default. Tutto è testato.
- **`localStorage`** per progetto (`taskme:columns:<projectId>`): colonne visibili, ordine, larghezze. Se lo storage non è disponibile (navigazione privata) lo stato resta in memoria.
- **Vista salvata** (`saved_views.config`, validata con zod): `{ query: "<query string come nell'URL>", columns: { visible, order, sizes } }`. Applicarla scrive `query` nell'URL e `columns` in `localStorage`. Il link in sidebar `?view=<id>` senza altri parametri carica la configurazione della vista.
- **Filtraggio lato client**: si caricano tutte le issue del progetto (le archiviate solo con `archived=1`) e si filtrano in memoria con `matchesFilters`. A 500 issue è istantaneo e ogni modifica dei filtri evita un giro di rete. L'ordinamento usa TanStack Table (multiplo con Maiusc+clic); senza ordinamento si segue il `rank` (ADR-002).
- **Pannello dettaglio sopra la tabella**: aprendo un'issue l'URL diventa `/p/NBI/issues/NBI-3`, senza query. `useViewState` conserva gli ultimi parametri visti sul percorso del progetto, così la tabella sotto non perde i filtri; chiudendo il pannello (`router.back()`) l'URL torna quello filtrato.

## Conseguenze

- Le viste M2 riusano `FilterBar`, `parseFilters`, `matchesFilters` e `useViewState`; ogni vista avrà il suo `kind` in `saved_views`.
- Se un progetto superasse qualche migliaio di issue, il filtraggio andrebbe spostato su PostgREST (gli stessi parametri si traducono in `.in()`/`.gte()`), senza cambiare il formato dell'URL.
- Le larghezze delle colonne non viaggiano nei link: è voluto.

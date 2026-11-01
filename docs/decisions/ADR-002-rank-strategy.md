# ADR-002 — Strategia di ordinamento manuale (rank)

- Stato: accettata
- Data: 2026-11-01
- Contesto: CLAUDE.md §3.3 (`issues.rank text`, "LexoRank"), §5.2 (riordino Kanban, figli nel dettaglio)

## Contesto

Le issue hanno un ordine manuale (board, lista dei figli, tabella senza ordinamento esplicito). Spostare un elemento deve aggiornare **una sola riga**. La colonna è già fissata dal contratto dati: `rank text`.

Opzioni valutate:

1. **Intero/float** (`position`): con interi si rinumera mezzo elenco a ogni spostamento; con float si perde precisione dopo circa 50 inserimenti nello stesso punto e poi si rinumera comunque. In ogni caso il tipo non sarebbe `text`.
2. **LexoRank completo** (Jira): bucket `0|`, `1|`, `2|`, parte intera a lunghezza fissa e ribilanciamento periodico fra bucket. È robusto, ma la sua complessità serve a migliaia di utenti concorrenti con milioni di righe.
3. **Chiavi frazionarie in base 36** (lo stesso principio di LexoRank, senza bucket): stringhe `[0-9a-z]` confrontate lessicograficamente. Fra due chiavi qualsiasi ne esiste sempre una intermedia.

## Decisione

**Opzione 3**, in `src/lib/rank.ts`: `between(a, b)`, `before(first)`, `after(last)`, `sequence(n)`, `compareRanks`.

- Alfabeto `0-9a-z`. Una chiave non termina mai con `0`, così c'è sempre spazio fra due chiavi.
- La prima chiave è `i`. Le chiavi si allungano di circa un carattere ogni 5-6 inserimenti consecutivi nello stesso punto. Con 4 utenti e poche centinaia di issue resteranno sotto i 10 caratteri per anni.
- Il rank lo calcola il server (`reorderIssue(id, beforeId, afterId)` legge i rank dei vicini). Il client non scrive rank arbitrari.
- Nuove issue: `after(rank massimo del progetto)`. L'import Jira userà `sequence(n)` in ordine di `created` (§7).
- Ordine dei byte: le chiavi contengono solo `[0-9a-z]`, quindi l'ordine è identico con la collation `C` e con le collation linguistiche `en_US`/`it_IT`. In TS si confronta con `<`, non con `localeCompare`.

## Conseguenze

- Nessun ribilanciamento automatico. Se un giorno le chiavi diventassero lunghe, basta uno script che riassegna `sequence(n)` per progetto, senza cambiare lo schema.
- Due spostamenti concorrenti nello stesso punto possono produrre lo stesso rank. L'ordine fra i due resta stabile (per `rank`, poi `number`) e il successivo spostamento lo risolve: è accettabile per un team di 4 persone.
- Il nome "LexoRank" del contratto dati va inteso come "rank lessicografico", non come implementazione Atlassian.

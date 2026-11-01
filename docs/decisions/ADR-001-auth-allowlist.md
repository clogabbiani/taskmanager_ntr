# ADR-001 — Controllo allow-list al login Google

- Stato: accettata
- Data: 2026-10-29
- Contesto: CLAUDE.md §3.5, §4 [VINCOLANTE]

## Contesto

Il login è solo Google via Supabase Auth. Un'email è ammessa se corrisponde a una riga di `allowed_signins` (`kind='email'` esatta oppure `kind='domain'` sul dominio). Se non è ammessa: sessione terminata, pagina "Accesso non autorizzato", nessun utente creato. Al primo accesso autorizzato: riga in `users` e in `workspace_members` con ruolo `member`.

Vincoli: RLS su tutte le tabelle; il server Next.js usa la sessione dell'utente (anon key + JWT); la service role key non entra nel codice dell'app.

Opzioni valutate:

1. **Controllo nel callback OAuth** (Route Handler `/auth/callback`).
2. **Hook DB di Supabase Auth** ("Before User Created"), che rifiuta la creazione di `auth.users`.
3. Trigger su `auth.users` che crea `public.users`.

## Decisione

**Callback come meccanismo primario, hook "Before User Created" come rinforzo opzionale.**

### Primario — callback + RPC `claim_signin()`

`src/app/auth/callback/route.ts`:

1. `exchangeCodeForSession(code)` → sessione dell'utente.
2. `supabase.rpc('claim_signin')` con quella sessione (nessuna service role).
3. `false` o errore → `signOut()` (cookie cancellati) e redirect a `/unauthorized`.
4. `true` → redirect al `next` sanitizzato (`safeNextPath`, solo path relativi same-origin).

`public.claim_signin()` (migrazione `0001_rls_and_functions.sql`) è `SECURITY DEFINER`, `search_path=''`, eseguibile solo da `authenticated`:

- legge email e metadata **dal JWT** (`auth.jwt()`), non da parametri: il client non può dichiarare un'email diversa;
- confronta con `allowed_signins` (email o dominio, case-insensitive);
- se ammesso: crea `users` con `id = auth.uid()`, oppure, se esiste già un utente seminato con la stessa email ma id diverso, ne **riallinea l'id** a `auth.uid()` (tutte le FK verso `users` sono `ON UPDATE CASCADE`), così il ruolo `owner`/`admin` del seed si conserva; inserisce `workspace_members(member)` con `ON CONFLICT DO NOTHING` (mai declassare) e `notification_prefs`.

Difesa in profondità: il layout dell'area autenticata (`requireMember`) verifica a ogni richiesta che la sessione abbia una riga in `workspace_members`; se manca (es. utente rimosso) redirige a `/auth/reject`, che fa `signOut` e mostra la pagina di rifiuto. Tutte le query passano comunque da RLS, che senza membership non restituisce nulla.

### Rinforzo — hook "Before User Created"

`public.hook_before_user_created(event jsonb)` applica la stessa regola e restituisce `{"error": {"http_code": 403, "message": "signin_not_allowed"}}` per email non ammesse. Si abilita a mano dal dashboard (vedi `docs/SETUP_SUPABASE_VERCEL.md` §C.4). Con l'hook attivo un account non autorizzato non lascia nemmeno una riga in `auth.users`; il callback riconosce il marker `signin_not_allowed` nell'`error_description` e mostra la stessa pagina.

## Motivazioni

- **Il callback funziona senza configurazioni aggiuntive** e in modo identico in locale, preview e produzione; l'hook richiede un passo manuale nel dashboard e la disponibilità della feature nel piano. Rendere l'hook obbligatorio avrebbe legato la DoD di M0 a una configurazione esterna non versionata.
- **Nessuna service role nel runtime**: la funzione `SECURITY DEFINER` dà il minimo privilegio necessario (leggere `allowed_signins`, scrivere le proprie righe) senza aprire la tabella via RLS ai non membri.
- **Fonte di verità unica nel DB**: la regola email/dominio vive in SQL; callback e hook la usano entrambi. I test di integrazione (`tests/db/rls.test.ts`, PGlite) la verificano sul vero SQL delle migrazioni.
- **"Nessun utente creato"**: senza hook, Supabase Auth crea comunque una riga interna in `auth.users` prima che l'app possa intervenire; TASKME non crea però né `users` né `workspace_members`, e la sessione viene chiusa subito. Interpretiamo il vincolo sulle tabelle applicative; l'hook copre anche `auth.users` per chi vuole il comportamento più stretto.
- Il trigger su `auth.users` (opzione 3) è stato scartato: scrive su uno schema gestito da Supabase, non può terminare la sessione e non distingue ammessi/non ammessi senza duplicare la logica.

## Conseguenze

- `users.id` coincide con `auth.users.id` dopo il primo login; gli utenti seminati hanno un id provvisorio fino ad allora.
- Rimuovere una riga da `allowed_signins` blocca i **nuovi** login di quell'email; un membro esistente viene bloccato al prossimo login (il callback ri-esegue `claim_signin`). Per revocare subito l'accesso: rimuovere anche la riga in `workspace_members` (M1, Impostazioni → Membri).
- Il cambio di email Google di un utente esistente non è gestito automaticamente (caso raro, 4 utenti): intervento manuale.

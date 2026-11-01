# Setup Supabase, Google OAuth e Vercel (M0)

Passi manuali da eseguire una volta. Tempo stimato: 30–40 minuti.
Annota man mano in un posto sicuro (password manager) i valori segnati con 🔑: non vanno mai nel repo.

Ordine: **A** Supabase → **B** Google Cloud → **C** provider Google in Supabase → **D** migrazioni e seed → **E** Vercel → **F** URL di redirect → **G** verifica DoD.

---

## A. Progetto Supabase

1. Vai su <https://supabase.com/dashboard> → accedi con l'account GitHub o Google di Claudio.
2. **New project**.
   - Organization: la tua (free).
   - Name: `taskme-ntr`.
   - Database password: genera una password forte → 🔑 salvala (serve per `DATABASE_URL`).
   - Region: **Central EU (Frankfurt)** `eu-central-1` (vicina all'Italia, dati in UE).
   - Plan: Free.
3. Attendi ~2 minuti che il progetto sia pronto.
4. **Project Settings → API** (o **Data API**):
   - copia **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`;
   - copia la chiave **anon / publishable** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - copia la chiave **service_role / secret** → 🔑 `SUPABASE_SERVICE_ROLE_KEY` (solo in `.env` locale, mai su Vercel in M0).
5. In alto clicca **Connect** → scheda **Session pooler** → copia l'URI e sostituisci `[YOUR-PASSWORD]` con la password del punto 2 → 🔑 `DATABASE_URL`.
   (Il "Direct connection" del free tier è solo IPv6: usa il Session pooler.)
6. Annota il **project ref** (la parte `xxxx` di `https://xxxx.supabase.co`): serve al passo B.

## B. Client OAuth in Google Cloud Console

1. Vai su <https://console.cloud.google.com/> con l'account Google di Claudio (o l'account amministratore del Workspace NTR, se preferisci che il client OAuth appartenga all'organizzazione).
2. In alto: selettore progetto → **New Project** → nome `TASKME NTR` → **Create** → selezionalo.
3. Menu ☰ → **APIs & Services → OAuth consent screen** (in alcune console: **Google Auth Platform → Branding**).
   - **Get started** / **Configure**.
   - App name: `TASKME NTR`; User support email: la tua.
   - Audience: **External** (necessario perché `clogabbiani@gmail.com` non è un account del Workspace NTR; con solo account aziendali potresti scegliere *Internal*).
   - Contact email: la tua → **Create**.
   - **Data access / Scopes**: aggiungi `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` → Save.
   - **Audience → Publishing status**: lascia *Testing* e in **Test users** aggiungi le 4 email del team, **oppure** premi **Publish app** (con soli scope base non serve la verifica Google). Consigliato: *Publish app*, così non devi gestire la lista test user; l'accesso resta comunque filtrato dall'allow-list di TASKME.
4. **APIs & Services → Credentials** (o **Clients**) → **Create credentials → OAuth client ID**.
   - Application type: **Web application**; Name: `TASKME Supabase`.
   - **Authorized JavaScript origins**: `http://localhost:3000` e (dopo il passo E) `https://<tuo-progetto>.vercel.app`.
   - **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
     (è l'unico redirect che Google vede: il ritorno all'app lo gestisce Supabase).
   - **Create** → copia **Client ID** e 🔑 **Client secret**.

## C. Provider Google in Supabase

1. Dashboard Supabase → **Authentication → Sign In / Providers** → **Google** → abilita.
2. Incolla **Client ID** e **Client Secret** del passo B → **Save**.
3. **Authentication → Sign In / Providers** (sezione *User Signups*): lascia abilitato *Allow new users to sign up* (il filtro lo fa l'allow-list).
4. Facoltativo, consigliato — **Authentication → Auth Hooks** → **Add hook → Before User Created** → tipo **Postgres** → schema `public`, funzione `hook_before_user_created` → **Create**.
   Con l'hook attivo un account Google non autorizzato non viene nemmeno creato in `auth.users` (vedi ADR-001). Esegui prima il passo D, altrimenti la funzione non esiste ancora. Se l'hook non è disponibile nel tuo piano, salta: il controllo nel callback è sufficiente.

## D. Migrazioni e seed (dal tuo PC)

```bash
cp .env.example .env         # compila DATABASE_URL e le NEXT_PUBLIC_*
cp .env.example .env.local   # compila le NEXT_PUBLIC_*
pnpm install
pnpm db:migrate              # applica drizzle/0000_init.sql e 0001_rls_and_functions.sql
pnpm db:seed                 # workspace, Claudio owner, NBI, PN, allow-list
```

Il seed stampa gli utenti saltati (email mancanti in `migration/user_mapping.json`). Quando hai le email di Edoardo, Merk e Nicola (Q2), compilale nel file e rilancia `pnpm db:seed`: è idempotente.
Quando conosci il dominio Workspace (Q1): `SEED_ALLOWED_DOMAINS=ntrbiosensors.it pnpm db:seed`.

Verifica in Supabase → **Table Editor**: `workspaces` (1 riga), `projects` (NBI, PN), `statuses` (8 righe), `allowed_signins`.
In **Authentication → Policies** ogni tabella deve risultare *RLS enabled*.

## E. Vercel

1. <https://vercel.com/new> → accedi con GitHub → **Import Git Repository** → `clogabbiani/taskmanager_ntr` (se non compare: **Adjust GitHub App Permissions** e concedi l'accesso al repo).
2. Framework Preset: **Next.js** (rilevato). Root directory: `./`. Build e install command: default (pnpm viene rilevato da `pnpm-lock.yaml` / `packageManager`).
3. **Environment Variables** (spunta *Production* e *Preview*):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Non aggiungere `SUPABASE_SERVICE_ROLE_KEY` né `DATABASE_URL`: in M0 l'app non li usa.
4. **Deploy**. Al termine annota l'URL di produzione, es. `https://taskmanager-ntr.vercel.app`.
5. **Settings → Git**: Production Branch = `main` (default). Ogni PR riceve un Preview Deployment automatico.
6. Torna a Google Cloud (B.4) e aggiungi l'URL di produzione fra le *Authorized JavaScript origins*.

## F. URL di redirect in Supabase

Dashboard Supabase → **Authentication → URL Configuration**:

1. **Site URL**: l'URL di produzione Vercel (es. `https://taskmanager-ntr.vercel.app`).
2. **Redirect URLs** → **Add URL**, una per riga:
   - `http://localhost:3000/**`
   - `https://taskmanager-ntr.vercel.app/**`
   - `https://taskmanager-ntr-*-<tuo-team-vercel>.vercel.app/**` (preview delle PR; il nome esatto lo vedi nell'URL di una preview)
3. **Save**.

## G. Verifica Definition of Done M0

1. Apri l'URL di produzione → vieni rediretto a `/login`.
2. **Accedi con Google** con `clogabbiani@gmail.com` → entri, vedi la sidebar con **NBI** e il menu utente con ruolo *Proprietario*.
3. Esci (menu avatar → **Esci**).
4. Accedi con un account Google **non** in allow-list (es. un Gmail personale diverso) → pagina **Accesso non autorizzato**; in Supabase `public.users` non compare nessuna nuova riga.
5. In GitHub → tab **Actions**: il workflow **CI** sulla PR è verde.

Se qualcosa non torna, annota in `STATUS.md` → *Bloccato / Escalation* il passo e il messaggio d'errore.

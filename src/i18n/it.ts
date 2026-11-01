/**
 * Italian UI strings (only UI language in Phase 1). Components must not hardcode
 * user-facing text: add it here and reference it via `it`.
 */
export const it = {
  app: {
    name: "TASKME NTR",
    description: "Gestione attività del team NTR Biosensors",
    workspaceName: "NTR Biosensors",
  },
  auth: {
    loginTitle: "Accedi a TASKME",
    loginSubtitle: "Usa il tuo account Google aziendale o autorizzato.",
    loginWithGoogle: "Accedi con Google",
    loginRedirecting: "Reindirizzamento a Google…",
    loginError: "Accesso non riuscito. Riprova.",
    unauthorizedTitle: "Accesso non autorizzato",
    unauthorizedBody:
      "L'account Google con cui hai provato ad accedere non è abilitato per TASKME NTR. Se pensi sia un errore, chiedi a un amministratore di aggiungere la tua email all'elenco degli accessi consentiti.",
    unauthorizedBack: "Torna al login",
    logout: "Esci",
  },
  nav: {
    myTasks: "I miei task",
    projects: "Progetti",
    noProjects: "Nessun progetto visibile.",
    settings: "Impostazioni",
    openMenu: "Apri menu",
    closeMenu: "Chiudi menu",
    privateProject: "Progetto privato",
  },
  topbar: {
    searchPlaceholder: "Cerca issue, chiavi, commenti…",
    searchShortcut: "Ctrl K",
    searchComingSoon: "Ricerca globale disponibile in M1.",
  },
  userMenu: {
    label: "Account",
    theme: "Tema",
    themeLight: "Chiaro",
    themeDark: "Scuro",
    themeSystem: "Sistema",
  },
  roles: {
    owner: "Proprietario",
    admin: "Amministratore",
    member: "Membro",
    viewer: "Lettore",
  },
  project: {
    views: {
      table: "Tabella",
      board: "Kanban",
      timeline: "Timeline",
      calendar: "Calendario",
    },
    notFound: "Progetto non trovato o non accessibile.",
    tablePlaceholder: "La vista Tabella arriva con la milestone M1.",
    viewComingSoon: "Disponibile in una prossima milestone.",
  },
  myTasks: {
    title: "I miei task",
    placeholder: 'La vista "I miei task" arriva con la milestone M2.',
  },
  home: {
    title: "Benvenuto in TASKME",
    body: "Seleziona un progetto dalla barra laterale.",
  },
  errors: {
    generic: "Si è verificato un errore.",
    forbidden: "Non hai i permessi per questa operazione.",
    invalid: "Dati non validi.",
    not_found: "Elemento non trovato o non accessibile.",
    duplicate: "Esiste già un elemento con questo nome.",
    hierarchy: "Gerarchia non valida: epic → task → sottoattività.",
    dates: "La data di inizio deve precedere la scadenza.",
    epic_progress: "L'avanzamento di un'epic è calcolato dai figli.",
    status_category_required: "Serve almeno uno stato per ogni categoria (Da fare, In corso, Completato).",
    status_has_issues: "Lo stato contiene issue: scegli dove spostarle.",
    confirm_mismatch: "La chiave digitata non corrisponde.",
    owner_protected: "Il ruolo del proprietario non può essere modificato.",
  },
} as const;

export type Messages = typeof it;

# Analisi delle criticità del monorepo "Turni di Palco"

Questo documento riassume le principali problematiche rilevate sul ramo `main` del monorepo *Turni di Palco*, che include la PWA multipagina (`apps/pwa`), la UI mobile (`apps/mobile`), il codice condiviso (`shared`) e la documentazione di riferimento. Le funzionalità attuali coprono il controllo dei permessi del browser, la dashboard di stato, la mappa eventi, la gestione dell'avatar ReadyPlayer.Me, la pagina profilo e il registro turni.

## 1. Persistenza e sincronizzazione dei dati

### Criticità
- **Persistenza solo locale**: profilo, avatar, turni, XP, cachet e reputazione vengono serializzati in `localStorage` con la chiave `tdp-game-state`. Cambiando dispositivo o cancellando i dati di navigazione l'utente perde completamente lo stato.
- **Assenza di sincronizzazione tra schede**: le pagine `map.html`, `profile.html`, `game.html`, `events.html` e `turns.html` invocano `loadState()` solo in fase di render e non reagiscono a modifiche fatte in altre finestre. `saveState()` non notifica le schede aperte, per cui l'utente può vedere dati obsoleti.
- **Nessuna autenticazione/multi-utente**: manca un concetto di account. `loadState()`/`saveState()` non separano i profili, rendendo impossibile distinguere gli operatori teatrali in scenari reali.

### Soluzioni proposte
- **Backend leggero con API REST**: introdurre un micro-servizio (Node.js/Express o serverless) che esponga operazioni CRUD per profilo, turni ed eventi. Usare un database (SQLite/PostgreSQL) per persistere i dati e identificare gli utenti tramite ID o token. La PWA può sincronizzare lo stato locale con il server in modo periodico o al ripristino della connessione.
- **Meccanismo di sincronizzazione tra schede**: aggiungere un listener sull'evento `storage` del browser in modo che ogni modifica a `localStorage` aggiorni le altre schede. Esempio:
  ```ts
  // apps/pwa/src/map.ts (e analoghi)
  window.addEventListener('storage', (event) => {
    if (event.key === 'tdp-game-state') {
      const latest = loadState();
      render(latest);
    }
  });
  ```
- **Autenticazione e profili separati**: introdurre login (email+OTP o social login) e nominare le chiavi locale con l'ID utente, ad esempio `tdp-game-state:<userId>`. Le API REST dovrebbero validare i token e restituire solo lo stato dell'utente autenticato.

## 2. Azioni consigliate
- Definire un contratto API minimale (profilo, avatar, turni, eventi) e integrare un client HTTP condiviso in `shared/`.
- Implementare un layer di sync bidirezionale (cache locale + replica server), con gestione di conflitti e modalità offline-first.
- Aggiornare la PWA per reagire agli eventi `storage` e per ricaricare lo stato quando il service worker rileva una sync completata.
- Scrivere test end-to-end che aprano più schede e verifichino la coerenza dello stato dopo operazioni concorrenti.

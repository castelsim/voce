# Analisi vocale

Strumento open source (GPL-3.0-or-later) per l'analisi della voce cantata: confronto PRE/POST con Praat compilato in WebAssembly, tutto nel browser.
Si caricano una o due registrazioni, si selezionano i tratti da confrontare e si leggono le misure in tabella, con spettrogramma e tracciati.

## Sviluppo

```
npm install && npm run vendor && npm test
```

`npm install` scarica solo dipendenze di sviluppo; `npm run vendor` copia in `web/vendor/` Praat (praat-wasm) e supabase-js con le rispettive licenze.

## Prova nel browser

Dalla radice del repository:

```
python3 -m http.server 8790 --bind 127.0.0.1
```

poi aprire `http://127.0.0.1:8790/web/index.html?prova-senza-accesso=1`.

## Pubblicazione

La pagina si pubblica su stageplot.it/voce/, dentro il repository di StagePlot. La licenza GPL chiede che il codice di ogni versione pubblicata sia raggiungibile: per questo si pubblica solo un commit già presente su GitHub.

1. Fare il commit di tutte le modifiche (lo script rifiuta un albero con modifiche non salvate in `web/`).
2. Fare `git push` del ramo: lo script rifiuta un commit che non è in nessun ramo remoto.
3. Dalla radice di questo repository: `node strumenti/pubblica-su-stageplot.mjs <cartella del checkout di StagePlot>`. Lo script controlla la radice (deve contenere un `CNAME` con `stageplot.it`), rifiuta file audio, json, file nascosti, link simbolici e percorsi locali nella build, lancia `npm test`, poi scrive la build in `voce/` con `LICENSE`, `NOTICE` e `SORGENTE.txt` (indirizzo del sorgente e commit).
4. Nel repository di StagePlot aprire una PR con la cartella `voce/`, controllando che `voce` sia fra le cartelle copiate dal deploy.
5. Dopo il merge, verificare in produzione: la pagina si apre su stageplot.it/voce/, l'accesso con Google funziona, Praat si carica e `SORGENTE.txt` riporta il commit pubblicato.

## Privacy

L'audio non lascia il computer: l'analisi avviene interamente nel browser e nessun file audio viene inviato a un server.

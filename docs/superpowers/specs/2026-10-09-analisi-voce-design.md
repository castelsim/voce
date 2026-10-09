# Analisi vocale — specifica di progetto (versione 1)

Data: 09/10/2026 · Autore: Simone Castellan (con Claude) · Stato: da rivedere da Simone

## 1. Scopo

Uno strumento web **open source** per analizzare la **voce cantata** confrontando due registrazioni della stessa
persona (PRE e POST, oggi e fra un mese), fondato sui metodi e sui numeri di **Praat** (Boersma & Weenink) e
**VoxPlot** (Barsties v. Latoszek, Mayer), pubblicato su **stageplot.it/voce/**.

Prima utente: **una vocologa** (tesi del Master in vocologia artistica, consegna ~20/11/2026), che deve
lavorare **in autonomia**: caricare le sue registrazioni, selezionare porzioni, ascoltare, confrontare, fare figure e
tabelle per la tesi, e capire che cosa funziona e che cosa va migliorato. Lei **non è tecnologica**: tutto deve essere
ovvio, in italiano, con spiegazioni a portata di clic. Utenti successivi: insegnanti di canto e vocal coach.

### Successo
- La prima utente, da sola, carica PRE e POST, trova il passaggio, ascolta A/B, esporta immagine e numeri, e sa dire da dove
  vengono.
- I numeri coincidono con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti) (scarto ≤ 0,5 %) con gli stessi script.
- Funziona offline sul Mac della prima utente (Chrome o Safari) alla discussione di tesi.

### Cose dette da Simone (09/10)
- Software generico, open source, il meglio di Praat e VoxPlot per il canto, con citazioni.
- **Login Google obbligatorio**, per capire come viene usato e migliorarlo.
- La prima utente usa un **Mac**; alla discussione deve funzionare **senza Internet**.
- **I numeri citati nella tesi restano quelli di Praat** calcolati da Simone; il software serve a esplorare, ascoltare,
  fare figure e dati. Prima versione **il prima possibile**.

### Fuori dalla versione 1
- AVQI e ABI del parlato (tappa 3).
- Statistica su tutte le note di un brano (resta negli script di Simone per la tesi).
- Condivisione online di progetti o file, collaborazione.
- Qualsiasi giudizio diagnostico («nella norma», «patologico»): lo strumento **confronta la persona con sé stessa**.
  Nessuna soglia clinica applicata al canto.

## 2. Scelte di fondo

| Scelta | Decisione | Perché |
|---|---|---|
| Motore | **Praat compilato in WebAssembly** (`praat-wasm`, Praat 6.4.62, GPL-3.0-or-later) in un Web Worker | Prova del 09/10: stessi numeri di Praat 7.0.02 nativo (F0, HNR, formanti, LTAS identici; CPPS 7,608 contro 7,602; jitter e shimmer identici) |
| Dove gira l'analisi | **Solo nel browser** di chi la usa | Privacy: le registrazioni sono di persone riconoscibili; nessun upload |
| Codice | Repository pubblico **`castelsim/voce`**, licenza **GPL-3.0-or-later** | Praat e VoxPlot sono GPL; StagePlot invece è «tutti i diritti riservati»: la voce resta un programma separato |
| Pubblicazione | Copia della build in `stageplot/voce/` (con LICENSE e link al sorgente) tramite PR su StagePlot, merge di Simone | Stesso dominio del login Google già esistente; nessun codice proprietario di StagePlot dentro la voce |
| Tecnologia | HTML/CSS/JS semplici, moduli ES, nessun framework; librerie solo se GPL-compatibili e copiate in `vendor/` | Come StagePlot; offline senza CDN |
| Lingua | Italiano (testi in un file solo, per tradurre più avanti) | Utente primario italiana |

## 3. Architettura (unità con un compito ciascuna)

```
index.html ─ app.js (orchestrazione, stato)
  ├─ accesso/      login Google via Supabase (supabase-js MIT, vendor), sessione persistente, mai logout se offline
  ├─ progetto/     IndexedDB: file audio (ArrayBuffer), tratti salvati, note, impostazioni — tutto locale
  ├─ motore/       worker.js: carica praat-wasm, riceve {audio, tratto, misure} → esegue script .praat → JSON
  ├─ misure/       *.praat: un file per misura (fonte unica, anche per Praat nativo) + registro.json (nome, unità, «?»)
  ├─ vista/        spettrogrammi PRE/POST da matrice Praat, F0, formanti, fascia 4-5 kHz, cursore, selezione, zoom
  ├─ ascolto/      WebAudio: A/B alla stessa posizione, loop della selezione, «PRE poi POST»
  ├─ esporta/      PNG (figura con didascalia), CSV, XLSX, WAV del tratto PRE/POST
  ├─ statistiche/  coda di eventi in IndexedDB → Supabase quando online
  ├─ testi/        it.json: etichette, aiuti «?», pagina fonti
  └─ sw.js         service worker: cache di programma + praat.wasm (~25 MB) per l'offline
```

### Flusso
1. La prima utente apre stageplot.it/voce/ → se non ha sessione: «Entra con Google» (si torna su /voce/).
2. Trascina o sceglie il file PRE e il file POST (WAV, AIFF, MP3, M4A; mono o stereo).
   Opzione «un file stereo: sinistra = PRE, destra = POST».
3. Il browser decodifica l'audio (per l'ascolto) e passa i campioni al worker; Praat calcola **spettrogramma, F0,
   formanti, intensità** dell'intero file (a blocchi, con barra di avanzamento) → la vista disegna.
4. La prima utente ascolta, seleziona un tratto (trascina) e preme **«Misura il tratto»** → il worker esegue gli script sul
   tratto di PRE e di POST → tabella con numeri, differenza e «?».
5. «Salva tratto» (nome + nota) → elenco a lato, cliccabile.
6. «Esporta»: PNG della vista (con titolo, tempi, legenda, «Analisi con Praat 6.4.62»), CSV/XLSX dei tratti salvati,
   WAV del tratto.

### Interfacce principali
- `motore.analizzaFile(audio Float32Array, sr) → {spettro, f0, formanti[4], intensita, passo, fmax}`
- `motore.misura(audio, sr, da, a, misure[]) → {nome: valore}`; un errore dà `{nome: null, errore}`, mai un crash.
- `progetto.salvaTratto({idProgetto, da, a, nome, nota})`, `progetto.elenco()`, `progetto.apri(id)`.
- `statistiche.evento(tipo, dati)` con `dati` senza nomi di file, senza audio, senza valori della voce.

## 4. Misure della versione 1 (script Praat, impostazioni identiche alle analisi della tesi)

| Misura | Comando Praat (parametri) | Note |
|---|---|---|
| F0 mediana, min, max | To Pitch (ac): 0.01, 75, 15, yes, 0.03, 0.45, 0.01, 0.35, 0.14, 1100 | intervallo 75-1100 Hz per il canto |
| Scarto dalla nota (cents) | dalla F0: distanza dal semitono temperato (La = 440 Hz), mediana | opzione per un La diverso |
| Deriva e oscillazione dell'altezza (cents) | dalla F0 del tratto: pendenza assoluta e deviazione standard | |
| CPPS | To PowerCepstrogram: 60, 0.002, 5000, 50; Get CPPS: yes, 0.01, 0.001, 60, 1100, 0.05, Parabolic, 0.001, 0.05, Exponential decay, Robust | ricerca del picco fino a 1100 Hz per le voci acute; «Robust slow» non è ripetibile (1-2 % fra esecuzioni): si usa «Robust» |
| HNR | To Harmonicity (cc): 0.01, max(75, F0/2), 0.1, 1.0; Get mean | |
| Jitter, shimmer (local) | To PointProcess (periodic, cc): 75, 1100; parametri 0.0001, 0.02, 1.3 (, 1.6) | «?»: poco affidabili con il vibrato |
| H1−H2 | Spectrum → Ltas 1-to-1, massimo vicino a F0 e a 2·F0 | «?»: dipende dalla vocale |
| Alpha ratio, pendenza LTAS, SPR, Hammarberg | To Ltas: 100; energia 1-5 kHz contro 0,05-1 kHz; Get slope 0-1000/1000-10000; picchi 0-2 kHz contro 2-4 kHz | |
| Formanti F1-F4 | To Formant (burg): 0.01, 5, 5500 (voce maschile 5000), 0.025, 50 | avviso automatico se F0 > 350 Hz |
| Livello e sua stabilità | To Intensity: 100 | a volume pareggiato (vedi sotto) |
| Attacco (tempo di salita 10-90 %, «colpo» acuto nei primi 30 ms) | sull'inviluppo, all'attacco più vicino all'inizio del tratto | dalla tesi (passaggi scelti dalla prima utente) |
| Break (interruzioni brevi, salti > 300 cents in 20 ms) | dalla F0 del tratto | |
| Fiato (durata dell'ultima nota, calo del volume in dB/s) | da F0 e intensità | |

- **Volume pareggiato** come impostazione predefinita per l'ascolto e il confronto (voce PRE e POST allo stesso livello,
  una sola moltiplicazione); interruttore «volume originale».
- Le misure di attacco, break e fiato oggi sono in Python (`passaggi.py` della tesi (privato)): vanno riscritte
  come script Praat, così la fonte resta unica.

## 5. Accesso, privacy e statistiche

- **Login Google obbligatorio** (Supabase del progetto StagePlot, flusso PKCE, provider già attivo).
  Azione esterna approvata: aggiungere `https://stageplot.it/voce/` agli indirizzi di ritorno autorizzati.
- Sessione persistente; **offline non significa uscito**: se manca la rete si usa la sessione salvata e si rimanda il
  rinnovo (errore già incontrato in StagePlot: «getSession offline ≠ uscito»).
- **L'audio non lascia mai il computer.** Nessun nome di file e nessun numero della voce nelle statistiche.
- Tabella `voce_eventi` (id, utente, quando, tipo, dati jsonb, versione dell'app). RLS: inserimento solo dei propri
  eventi; lettura solo dell'amministratore (Simone). Conservazione 12 mesi (la purga automatica di StagePlot non è mai
  partita: va verificata a mano).
- Eventi: `apertura`, `accesso`, `carica_file` (durata, formato, canali), `seleziona`, `misura` (quali misure, durata
  del tratto, tempo di calcolo), `salva_tratto`, `esporta` (tipo), `errore` (codice).
- Pagina **Privacy** (cosa si raccoglie, perché, per quanto) e pagina **«Da dove viene ogni misura»** (fonti, versioni,
  impostazioni, licenze).

## 6. Licenze e citazioni

- Repository `castelsim/voce`: GPL-3.0-or-later, `LICENSE`, `NOTICE` con: Praat (Boersma & Weenink, GPL-3+),
  praat-wasm (GPL-3+), VoxPlot (GPL-3+) per i metodi ripresi, supabase-js (MIT), SheetJS Community Edition per l'XLSX
  (Apache-2.0, compatibile con la GPL-3).
- La copia in `stageplot/voce/` porta `LICENSE`, `NOTICE` e il link al sorgente nel piè di pagina.
- Citazioni nella pagina fonti: Boersma & Weenink (Praat); Barsties v. Latoszek et al. 2023 (VoxPlot); Heman-Ackah et al.
  2003 (CPP); Omori et al. 1996 (SPR); Michaelis et al. 1997 (GNE, tappa 3); Barsties & Maryn 2016 (AVQI, tappa 3);
  Barsties v. Latoszek et al. 2017 (ABI, tappa 3).

## 7. Prove e validazione

1. **Coincidenza con Praat**: per ogni script di `misure/`, un test automatico lo esegue con praat-wasm (Node) e con
   Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti) (`Praat --run`) sui file di prova; scarto ≤ 0,5 % (riferimento principale: la stessa versione di
   praat-wasm). Il test deve diventare rosso se si altera uno script (prova con mutazione).
2. **Numeri della tesi**: ricalcolati con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti) usando gli stessi script e confrontati con quelli attuali
   (parselmouth/Praat 6.1.38, CPPS circa −10 %). Le conclusioni PRE/POST non devono cambiare; se cambiano, si segnala.
3. **Browser vero**: Chrome e Safari su Mac; caricamento, vista, A/B, misura, esportazioni, **offline** (rete staccata
   dopo la prima apertura), sessione che resta valida offline.
4. **Prestazioni**: misura di un tratto di 5 s in meno di 10 s sul Mac; vista di un file di 4 minuti in meno di 60 s
   (con avanzamento); la pagina non si blocca mai (tutto nel worker).
5. **Errori**: file non audio, file troppo lunghi (avviso oltre 10 minuti), tratto troppo corto per una misura
   (risultato «—» con spiegazione, mai un crash).

## 8. Tappe

1. **Tappa 1** (prima possibile): progetto e repository; motore nel worker; caricamento PRE/POST (anche stereo L/R);
   vista con spettrogramma, F0 e formanti calcolati da Praat; A/B, loop, «PRE poi POST»; selezione; «Misura il tratto»
   con F0, cents, CPPS, HNR, jitter, shimmer, H1−H2, alpha ratio, SPR, formanti; esportazione PNG; login Google;
   pagina fonti; pubblicazione su stageplot.it/voce/.
2. **Tappa 2**: tratti salvati con note; CSV e XLSX; misure di attacco, break e fiato; offline completo (service
   worker); statistiche d'uso; pagina privacy; test di coincidenza su tutte le misure; numeri della tesi ricalcolati
   con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti).
3. **Tappa 3**: AVQI e ABI per il parlato (vocale tenuta + testo letto, soglie per lingua, chiaramente «per il
   parlato»); rapporto di validazione pubblicato.

## 9. Rischi

| Rischio | Contromisura |
|---|---|
| praat-wasm non ancora ufficiale (PR aperta nel progetto Praat) | Copia fissata in `vendor/` con versione e impronta; test di coincidenza a ogni aggiornamento |
| 25 MB da scaricare la prima volta | Avanzamento visibile; cache del service worker; una volta sola |
| Lentezza su file lunghi | Analisi a blocchi nel worker; misure solo sul tratto |
| Numeri della tesi (Praat 6.1.38) diversi da quelli del software (6.4.62) | Ricalcolo con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti) (tappa 2), segnalando ogni conclusione che cambia |
| Licenze miste con StagePlot | Programma separato, repository GPL a parte, nessun codice di StagePlot dentro |
| Uso come strumento diagnostico | Nessuna soglia sul canto; avviso «strumento didattico, non diagnostico» |

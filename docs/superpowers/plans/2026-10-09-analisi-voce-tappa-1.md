# Analisi vocale — Tappa 1: piano di lavoro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una prima versione di stageplot.it/voce/ con cui la prima utente carica PRE e POST, vede spettrogrammi con altezza e formanti calcolati da Praat, ascolta A/B, seleziona un tratto, ne misura i parametri con Praat ed esporta una figura PNG, dopo l'accesso con Google.

**Architecture:** Pagina statica (HTML/CSS/JS, moduli ES, nessun framework). Praat compilato in WebAssembly (`praat-wasm` 6.4.6200 = Praat 6.4.62) gira in un Web Worker ed esegue **script Praat** (`web/misure/*.praat`) che sono la fonte unica delle misure: gli stessi script girano con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti) nei test, per dimostrare che i numeri coincidono. L'audio non lascia mai il computer; il login usa il Supabase di StagePlot.

**Tech Stack:** JavaScript ES2022 (moduli), Web Worker, WebAudio, Canvas 2D, `praat-wasm@6.4.6200` (GPL-3.0-or-later), `@supabase/supabase-js@2.110.0` UMD (MIT), Node 22 con `node --test`, `puppeteer-core` (solo test, con il Chrome installato), Praat 6.4.62 nativo per i test di coincidenza (variabile `PRAAT`; anche Praat 7.0.02 in `/Applications/Praat.app`: vedi fonti).

**Spec:** `docs/superpowers/specs/2026-10-09-analisi-voce-design.md`

## Global Constraints

- Licenza del repository: **GPL-3.0-or-later**; ogni file di terzi in `web/vendor/` con la sua licenza.
- **Mai audio, nomi di allievi o dati della tesi nel repository** (è pubblico). I file di prova si leggono da `VOCE_AUDIO_PROVA` (oppure dalla cartella privata indicata in `test/strumenti/locale.json`, ignorato da git; modello `locale.esempio.json`); se la cartella non c'è, il test stampa `SALTATO` ed esce 0.
- Interfaccia **in italiano** corretto con accenti; tutti i testi in `web/testi/it.mjs`.
- Nessuna libreria da CDN: tutto in `web/vendor/`. Nessun upload di audio verso alcun server.
- Parametri Praat **identici alla specifica §4** (F0 75-1100 Hz; CPPS 60/0.002/5000/50 e ricerca del picco fino a 1100 Hz; Burg con tetto 5500 Hz, 5000 per voci maschili).
- Praat nativo nei test: `/Applications/Praat.app/Contents/MacOS/Praat --run --FULL-TRUST --no-pref-files <script>` (variabile `PRAAT` per cambiarlo); senza Praat il test stampa `SALTATO` ed esce 0.
- Coincidenza WASM/nativo: per ogni misura scarto ≤ 0,5 % del valore nativo **oppure** ≤ tolleranza assoluta della misura (tabella nel Task 2).
- Ogni test nuovo va provato **con una mutazione** (base verde → si rompe il codice apposta → rosso → si rimette → verde), come da regola di StagePlot.
- Il Mac non va spremuto: test in sequenza, niente processi pesanti in parallelo.
- Commit con il perché; firma: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Si lavora sul ramo `worktree-specifica` (o un ramo di lavoro); **mai push su `main`**.

## Review Focus

1. **PRE e POST con frequenza di campionamento o durata diverse** (es. 48 kHz e 44,1 kHz; 30 s e 40 s): ogni pannello ha il suo asse dei tempi, la selezione viene limitata alla durata di ciascun file, la misura funziona su entrambi. → test in Task 7 (`limitaSelezione`) e Task 13 (file a 48 kHz).
2. **Tratto troppo corto o senza voce** (< 0,1 s, oppure solo silenzio): la tabella mostra «—» con il motivo, nessun errore che blocca la pagina. → test in Task 5 (`gestisci` restituisce `errore`) e Task 9 (`righeTabella` con valori `null`).
3. **File che non è audio o formato non letto** (es. un PDF trascinato per errore): messaggio «Formato non riconosciuto», gli altri file restano caricati. → test in Task 6 (`classificaFile`) e Task 13.
4. **Un solo file stereo** (registrazione L = PRE, R = POST, come quelli di Simone) contro un normale file stereo: la pagina chiede quale dei due è; con «L = PRE, R = POST» separa i canali. → test in Task 6 (`scegliModo`) e Task 3 (variabile `canale`).
5. **Senza rete con sessione salvata** (la prima utente alla discussione): la pagina resta «dentro», non torna alla schermata di accesso. → test in Task 11 (`statoAccesso`).

---

## Struttura dei file

```
package.json                 script di test, dipendenze fissate
LICENSE                      testo GPL-3.0
NOTICE                       crediti e licenze di terzi
README.md                    cos'è, come si prova, come si pubblica
strumenti/
  copia-vendor.mjs           copia praat-wasm e supabase-js da node_modules a web/vendor/
  pubblica-su-stageplot.mjs  copia web/ in <stageplot>/voce/ con LICENSE e NOTICE
web/                         ciò che viene pubblicato su stageplot.it/voce/
  index.html                 pagina unica
  fonti.html                 «Da dove viene ogni misura»
  stile.css
  app.js                     orchestrazione: stato, eventi, collegamento dei moduli
  testi/it.mjs               tutte le scritte
  misure/
    tratto.praat             misure di un tratto (fonte unica)
    tracce.praat             spettrogramma, F0, formanti, intensità di un file
    registro.mjs             per ogni misura: chiave, etichetta, unità, decimali, aiuto «?»
  motore/
    script.mjs               componi(corpo, variabili), leggiRisultati(info)
    tracce.mjs               costruisciTracce(info, testi) → oggetto tracce
    lavoro.mjs               gestisci(praat, corpi, richiesta, avanzamento) — logica del worker, testabile in Node
    worker.mjs               Web Worker sottile intorno a lavoro.mjs
    client.mjs               creaMotore() → { tracce(), misura() } con Promise
  audio/
    file.mjs                 classificaFile, scegliModo, wavPcm24, guadagnoPareggiato
  vista/
    scala.mjs                tempi ↔ pixel, formato m'ss,s", zoom, limitaSelezione
    spettrogramma.mjs        disegna spettrogramma, F0, formanti, fascia, cursore, selezione
  ascolto/ab.mjs             lettore A/B sincronizzato, loop, PRE poi POST
  misura/tabella.mjs         righeTabella(pre, post, registro) e disegno della tabella
  esporta/png.mjs            figura PNG con titolo, legenda, piede
  accesso/
    config.mjs               URL e chiave pubblica Supabase
    accesso.mjs              login Google, statoAccesso(), sessione offline
  vendor/
    praat-wasm/              js/*.mjs, dist/praat.mjs, dist/praat.wasm, LICENSE
    supabase/                supabase.js (UMD 2.110.0), LICENSE
test/
  strumenti/praat-nativo.mjs eseguiNativo(corpo, variabili)
  strumenti/praat-wasm.mjs   eseguiWasm(corpo, variabili, percorsoAudio)
  strumenti/file-prova.mjs   elenco dei file di prova o SALTATO
  *.test.mjs                 test per unità
  browser.test.mjs           prova completa nel Chrome vero (puppeteer-core)
```

---

### Task 1: Progetto, licenze e Praat nel repository

**Files:**
- Create: `package.json`, `LICENSE`, `NOTICE`, `README.md`, `strumenti/copia-vendor.mjs`, `test/vendor.test.mjs`
- Create (generati): `web/vendor/praat-wasm/**`, `web/vendor/supabase/**`

**Interfaces:**
- Produces: `web/vendor/praat-wasm/js/praat-wasm.mjs` che esporta `createPraatWasm(wasmUrl?)`; `web/vendor/supabase/supabase.js` che definisce `window.supabase.createClient`.

- [ ] **Step 1: package.json**

```json
{
  "name": "voce",
  "version": "0.1.0",
  "private": true,
  "description": "Analisi vocale per il canto: confronto PRE/POST con Praat nel browser",
  "license": "GPL-3.0-or-later",
  "type": "module",
  "scripts": {
    "vendor": "node strumenti/copia-vendor.mjs",
    "test": "node --test test/*.test.mjs",
    "test:browser": "node --test test/browser.test.mjs"
  },
  "devDependencies": {
    "praat-wasm": "6.4.6200",
    "@supabase/supabase-js": "2.110.0",
    "puppeteer-core": "23.11.1"
  }
}
```

Run: `npm install` (solo dipendenze di sviluppo; nessuna arriva nella pagina se non tramite `copia-vendor.mjs`).
Se `puppeteer-core@23.11.1` non esiste, usare l'ultima 23.x esistente e fissarla.

- [ ] **Step 2: test che fallisce**

```js
// test/vendor.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync, readFileSync } from 'node:fs'

test('praat-wasm è copiato in web/vendor con la sua licenza', () => {
  const wasm = 'web/vendor/praat-wasm/dist/praat.wasm'
  assert.ok(existsSync(wasm), 'manca ' + wasm)
  assert.ok(statSync(wasm).size > 20_000_000, 'praat.wasm troppo piccolo')
  assert.ok(existsSync('web/vendor/praat-wasm/js/praat-wasm.mjs'))
  assert.ok(existsSync('web/vendor/praat-wasm/LICENSE'))
  assert.match(readFileSync('web/vendor/praat-wasm/VERSIONE', 'utf8'), /^6\.4\.6200/)
})

test('supabase-js è copiato con la sua licenza', () => {
  assert.ok(existsSync('web/vendor/supabase/supabase.js'))
  assert.match(readFileSync('web/vendor/supabase/LICENSE', 'utf8'), /MIT/)
})

test('createPraatWasm parte in Node ed esegue uno script', async () => {
  const { createPraatWasm } = await import('../web/vendor/praat-wasm/js/praat-wasm.mjs')
  const praat = await createPraatWasm()
  const info = praat.run('Create Sound as pure tone: "t", 1, 0, 0.5, 44100, 440, 0.2, 0.01, 0.01\nd = Get total duration\nwriteInfoLine: d\n')
  assert.equal(Number(info.trim()), 0.5)
})
```

- [ ] **Step 3: verificare che fallisca**

Run: `node --test test/vendor.test.mjs`
Expected: FAIL «manca web/vendor/praat-wasm/dist/praat.wasm».

- [ ] **Step 4: copia-vendor.mjs**

```js
// strumenti/copia-vendor.mjs — copia le librerie di terzi in web/vendor/ con licenze e versione
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

function copia (da, a) { mkdirSync(dirname(a), { recursive: true }); copyFileSync(da, a) }

const pw = 'node_modules/praat-wasm'
for (const f of ['js/praat-wasm.mjs', 'js/classes.mjs', 'js/worker.mjs', 'js/worker-client.mjs', 'dist/praat.mjs', 'dist/praat.wasm']) {
  copia(join(pw, f), join('web/vendor/praat-wasm', f))
}
const ver = JSON.parse(readFileSync(join(pw, 'package.json'), 'utf8')).version
writeFileSync('web/vendor/praat-wasm/VERSIONE', ver + '\n')
// praat-wasm non include un file di licenza: GPL-3.0-or-later dichiarata in package.json → copia del testo GPL del progetto
copia('LICENSE', 'web/vendor/praat-wasm/LICENSE')
writeFileSync('web/vendor/praat-wasm/FONTE.txt',
  `praat-wasm ${ver} — Praat (Boersma & Weenink) compilato in WebAssembly\n` +
  'Sorgente: https://github.com/reynoldsnlp/praat.github.io (PR praat/praat#3316) · npm: praat-wasm\nLicenza: GPL-3.0-or-later\n')

const sb = 'node_modules/@supabase/supabase-js'
copia(join(sb, 'dist/umd/supabase.js'), 'web/vendor/supabase/supabase.js')
const lic = existsSync(join(sb, 'LICENSE')) ? join(sb, 'LICENSE') : join(sb, 'LICENSE.md')
copia(lic, 'web/vendor/supabase/LICENSE')
console.log('vendor copiato: praat-wasm', ver)
```

Scaricare il testo della licenza: `curl -sSL https://www.gnu.org/licenses/gpl-3.0.txt -o LICENSE` (controllare che inizi con «GNU GENERAL PUBLIC LICENSE»).

- [ ] **Step 5: NOTICE e README**

```text
# NOTICE
Analisi vocale (stageplot.it/voce) — © 2026 Simone Castellan — GPL-3.0-or-later.

Contiene:
- Praat 6.4.62 (Paul Boersma & David Weenink, https://www.praat.org), GPL-3.0-or-later,
  compilato in WebAssembly dal pacchetto praat-wasm 6.4.6200 (https://github.com/reynoldsnlp/praat.github.io).
- supabase-js 2.110.0 (Supabase, MIT) per l'accesso con Google.
Metodi ripresi e citati (non codice): VoxPlot (Barsties v. Latoszek, Mayer et al., GPL-3.0),
AVQI (Maryn, Barsties), ABI (Barsties v. Latoszek et al.), SPR (Omori et al. 1996), CPP (Hillenbrand; Heman-Ackah et al. 2003).
Il codice sorgente completo è su https://github.com/castelsim/voce.
```

README.md: cos'è (3 righe), `npm install && npm run vendor && npm test`, prova nel browser (`python3 -m http.server 8790 --bind 127.0.0.1` dalla radice del repo, aprire `http://127.0.0.1:8790/web/index.html?prova-senza-accesso=1`), pubblicazione (Task 14), privacy (l'audio non lascia il computer).

- [ ] **Step 6: copiare e verificare**

Run: `npm run vendor && node --test test/vendor.test.mjs`
Expected: PASS (3 test).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json LICENSE NOTICE README.md strumenti/copia-vendor.mjs test/vendor.test.mjs web/vendor .gitignore
git commit -m "Progetto: licenza GPL, Praat (praat-wasm 6.4.6200) e supabase-js in web/vendor"
```

---

### Task 2: Misure di un tratto con Praat (fonte unica) e coincidenza con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti)

**Files:**
- Create: `web/motore/script.mjs`, `web/misure/tratto.praat`, `test/strumenti/praat-nativo.mjs`, `test/strumenti/praat-wasm.mjs`, `test/strumenti/file-prova.mjs`, `test/script.test.mjs`, `test/coincidenza.test.mjs`

**Interfaces:**
- Consumes: `createPraatWasm` (Task 1).
- Produces:
  - `componi(corpo: string, variabili: Record<string, number|string>) → string` (le chiavi che finiscono con `$` diventano stringhe Praat).
  - `leggiRisultati(info: string) → Record<string, number|string|null>` (righe `chiave<TAB>valore`; `--undefined--` → `null`).
  - `tratto.praat` legge le variabili `file$`, `canale`, `da`, `a`, `tetto`, `f0max` e scrive le chiavi: `durata, f0_mediana, f0_min, f0_max, f0_sd_cents, scarto_cents, cpps, hnr, jitter, shimmer, h1h2, alpha, pendenza, spr, f1, f2, f3, f4, livello, livello_sd`.
  - `eseguiNativo(corpo, variabili) → string`, `eseguiWasm(corpo, variabili, percorsoAudio) → Promise<string>`, `fileDiProva() → string[] | null`.

- [ ] **Step 1: test di script.mjs (fallisce)**

```js
// test/script.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { componi, leggiRisultati } from '../web/motore/script.mjs'

test('componi mette le variabili in testa, stringhe tra virgolette raddoppiate', () => {
  const s = componi('writeInfoLine: da\n', { file$: '/tmp/a "b".wav', da: 1.5 })
  assert.equal(s, 'file$ = "/tmp/a ""b"".wav"\nda = 1.5\nwriteInfoLine: da\n')
})

test('leggiRisultati legge numeri, testo e --undefined--', () => {
  const r = leggiRisultati('cpps\t7.6\nnome\tPRE\nhnr\t--undefined--\n\nriga senza tab\n')
  assert.deepEqual(r, { cpps: 7.6, nome: 'PRE', hnr: null })
})
```

Run: `node --test test/script.test.mjs` → Expected: FAIL (modulo mancante).

- [ ] **Step 2: script.mjs**

```js
// web/motore/script.mjs — compone gli script Praat e ne legge l'output «chiave<TAB>valore»
export function componi (corpo, variabili) {
  const righe = Object.entries(variabili).map(([k, v]) =>
    k.endsWith('$') ? `${k} = "${String(v).replace(/"/g, '""')}"` : `${k} = ${Number(v)}`)
  return righe.join('\n') + '\n' + corpo
}

export function leggiRisultati (info) {
  const out = {}
  for (const riga of String(info).split('\n')) {
    const i = riga.indexOf('\t')
    if (i <= 0) continue
    const k = riga.slice(0, i).trim()
    const v = riga.slice(i + 1).trim()
    if (v === '--undefined--' || v === '') { out[k] = null; continue }
    const n = Number(v)
    out[k] = Number.isFinite(n) ? n : v
  }
  return out
}
```

Run: `node --test test/script.test.mjs` → Expected: PASS.

- [ ] **Step 3: tratto.praat**

```praat
# web/misure/tratto.praat — misure di un tratto. Variabili: file$, canale, da, a, tetto, f0max
# Fonte unica: lo stesso testo gira in praat-wasm (browser) e in Praat 6.4.62 nativo (test).
s0 = Read from file: file$
nc = Get number of channels
if canale > 0 and nc >= canale
  s = Extract one channel: canale
elsif nc > 1
  s = Convert to mono
else
  s = s0
endif
selectObject: s
t = Extract part: da, a, "rectangular", 1, "no"
durata = a - da

selectObject: t
p = To Pitch (ac): 0.01, 75, 15, "yes", 0.03, 0.45, 0.01, 0.35, 0.14, f0max
f0_mediana = Get quantile: 0, 0, 0.5, "Hertz"
f0_min = Get minimum: 0, 0, "Hertz", "Parabolic"
f0_max = Get maximum: 0, 0, "Hertz", "Parabolic"
f0_sd_cents = Get standard deviation: 0, 0, "semitones"
f0_sd_cents = f0_sd_cents * 100
if f0_mediana <> undefined
  midi = 69 + 12 * log2 (f0_mediana / 440)
  scarto_cents = (midi - round (midi)) * 100
else
  scarto_cents = undefined
endif

selectObject: t
pc = To PowerCepstrogram: 60, 0.002, 5000, 50
cpps = Get CPPS: "yes", 0.01, 0.001, 60, f0max, 0.05, "Parabolic", 0.001, 0.05, "Exponential decay", "Robust slow"

minp = 75
if f0_mediana <> undefined
  minp = max (75, f0_mediana / 2)
endif
selectObject: t
h = To Harmonicity (cc): 0.01, minp, 0.1, 1.0
hnr = Get mean: 0, 0

selectObject: t
pp = To PointProcess (periodic, cc): 75, f0max
jitter = Get jitter (local): 0, 0, 0.0001, 0.02, 1.3
selectObject: t, pp
shimmer = Get shimmer (local): 0, 0, 0.0001, 0.02, 1.3, 1.6

h1h2 = undefined
if f0_mediana <> undefined
  selectObject: t
  sp = To Spectrum: "yes"
  l1 = To Ltas (1-to-1)
  h1 = Get maximum: f0_mediana * 0.8, f0_mediana * 1.2, "Parabolic"
  h2 = Get maximum: f0_mediana * 1.8, f0_mediana * 2.2, "Parabolic"
  h1h2 = h1 - h2
endif

selectObject: t
lt = To Ltas: 100
alto = Get mean: 1000, 5000, "energy"
basso = Get mean: 50, 1000, "energy"
alpha = alto - basso
pendenza = Get slope: 0, 1000, 1000, 10000, "energy"
picco_basso = Get maximum: 0, 2000, "None"
picco_alto = Get maximum: 2000, 4000, "None"
spr = picco_basso - picco_alto

selectObject: t
fo = To Formant (burg): 0.01, 5, tetto, 0.025, 50
f1 = Get mean: 1, 0, 0, "hertz"
f2 = Get mean: 2, 0, 0, "hertz"
f3 = Get mean: 3, 0, 0, "hertz"
f4 = Get mean: 4, 0, 0, "hertz"

selectObject: t
it = To Intensity: 100, 0.01, "yes"
livello = Get mean: 0, 0, "energy"
livello_sd = Get standard deviation: 0, 0

writeInfoLine: "durata", tab$, fixed$ (durata, 6)
appendInfoLine: "f0_mediana", tab$, f0_mediana
appendInfoLine: "f0_min", tab$, f0_min
appendInfoLine: "f0_max", tab$, f0_max
appendInfoLine: "f0_sd_cents", tab$, f0_sd_cents
appendInfoLine: "scarto_cents", tab$, scarto_cents
appendInfoLine: "cpps", tab$, cpps
appendInfoLine: "hnr", tab$, hnr
appendInfoLine: "jitter", tab$, jitter
appendInfoLine: "shimmer", tab$, shimmer
appendInfoLine: "h1h2", tab$, h1h2
appendInfoLine: "alpha", tab$, alpha
appendInfoLine: "pendenza", tab$, pendenza
appendInfoLine: "spr", tab$, spr
appendInfoLine: "f1", tab$, f1
appendInfoLine: "f2", tab$, f2
appendInfoLine: "f3", tab$, f3
appendInfoLine: "f4", tab$, f4
appendInfoLine: "livello", tab$, livello
appendInfoLine: "livello_sd", tab$, livello_sd
select all
Remove
```

Nota: `To Ltas (1-to-1)` e `Get maximum` con «Parabolic» corrispondono a `h1h2()` di `analisi.py` della tesi (privato).
Verificato il 09/10 con Praat 7.0.02 sul passaggio 7,75-10,25 s della prima coppia PRE/POST della fase 1 (PRE): escono tutte le 20 chiavi (CPPS 7,60, HNR 26,08, F0 mediana 406,9 Hz).

- [ ] **Step 4: strumenti di test**

```js
// test/strumenti/praat-nativo.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { componi } from '../../web/motore/script.mjs'

export const PRAAT = process.env.PRAAT || '/Applications/Praat.app/Contents/MacOS/Praat'
export const nativoDisponibile = () => existsSync(PRAAT)

export function eseguiNativo (corpo, variabili) {
  const dir = mkdtempSync(join(tmpdir(), 'voce-'))
  const f = join(dir, 'script.praat')
  writeFileSync(f, componi(corpo, variabili))
  return execFileSync(PRAAT, ['--run', '--FULL-TRUST', '--no-pref-files', f], { encoding: 'utf8' })
}
```

```js
// test/strumenti/praat-wasm.mjs
import { readFileSync } from 'node:fs'
import { componi } from '../../web/motore/script.mjs'
import { createPraatWasm } from '../../web/vendor/praat-wasm/js/praat-wasm.mjs'

let praat = null
export async function eseguiWasm (corpo, variabili, percorsoAudio) {
  praat ??= await createPraatWasm()
  praat.writeFile('/tmp/prova.wav', readFileSync(percorsoAudio))
  try {
    return praat.run(componi(corpo, { ...variabili, file$: '/tmp/prova.wav' }))
  } finally {
    praat.removeAll()
  }
}
```

```js
// test/strumenti/file-prova.mjs — file reali fuori dal repository (privati).
// La cartella e le voci maschili non stanno nel codice: vengono da variabili d'ambiente
// (VOCE_AUDIO_PROVA, VOCE_VOCI_MASCHILI = parti di nome separate da virgola) oppure da
// test/strumenti/locale.json (ignorato da git; modello: locale.esempio.json).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE_LOCALE = join(dirname(fileURLToPath(import.meta.url)), 'locale.json')

function leggiLocale () {
  try { return JSON.parse(readFileSync(FILE_LOCALE, 'utf8')) } catch { return {} }
}

export function cartellaProva () {
  return process.env.VOCE_AUDIO_PROVA || leggiLocale().cartella || null
}

export function fileDiProva () {
  const cartella = cartellaProva()
  if (!cartella || !existsSync(cartella)) return null
  const out = []
  for (const sub of readdirSync(cartella)) {
    const d = join(cartella, sub)
    if (!sub.startsWith('Fase')) continue
    for (const f of readdirSync(d)) if (f.endsWith('.wav')) out.push(join(d, f))
  }
  return out.sort()
}

// voce maschile (percorso che contiene una delle parti indicate) → tetto formanti 5000 Hz, altrimenti 5500
export function tettoPer (percorso) {
  const maschili = process.env.VOCE_VOCI_MASCHILI
    ? process.env.VOCE_VOCI_MASCHILI.split(',').map(s => s.trim()).filter(Boolean)
    : (leggiLocale().voci_maschili || [])
  return maschili.some(s => percorso.includes(s)) ? 5000 : 5500
}
```

- [ ] **Step 5: test di coincidenza (fallisce finché tratto.praat non è corretto)**

```js
// test/coincidenza.test.mjs — gli stessi script in praat-wasm e in Praat 6.4.62 nativo danno gli stessi numeri
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leggiRisultati } from '../web/motore/script.mjs'
import { eseguiNativo, nativoDisponibile } from './strumenti/praat-nativo.mjs'
import { eseguiWasm } from './strumenti/praat-wasm.mjs'
import { fileDiProva, tettoPer } from './strumenti/file-prova.mjs'

const CORPO = readFileSync('web/misure/tratto.praat', 'utf8')
// tolleranza assoluta per misura (oltre allo 0,5 % relativo)
const ASSOLUTA = { durata: 1e-6, f0_mediana: 0.5, f0_min: 0.5, f0_max: 0.5, f0_sd_cents: 0.5, scarto_cents: 0.5,
  cpps: 0.05, hnr: 0.05, jitter: 0.00002, shimmer: 0.0002, h1h2: 0.1, alpha: 0.05, pendenza: 0.05, spr: 0.05,
  f1: 2, f2: 2, f3: 3, f4: 3, livello: 0.05, livello_sd: 0.05 }

const files = fileDiProva()
const salta = !files || !nativoDisponibile()

test('tratto.praat: praat-wasm coincide con Praat 6.4.62 nativo sui file di prova', { skip: salta && 'SALTATO: mancano file di prova o Praat nativo' }, async () => {
  for (const f of files) {
    for (const [da, a] of [[2.0, 7.0], [7.75, 10.25]]) {
      const v = { file$: f, canale: 1, da, a, tetto: tettoPer(f), f0max: 1100 }
      const n = leggiRisultati(eseguiNativo(CORPO, v))
      const w = leggiRisultati(await eseguiWasm(CORPO, v, f))
      for (const k of Object.keys(ASSOLUTA)) {
        assert.ok(k in n, `${k} manca nell'output nativo`)
        if (n[k] === null) { assert.equal(w[k], null, `${f} ${k}: nativo indefinito, wasm ${w[k]}`); continue }
        const scarto = Math.abs(w[k] - n[k])
        const ok = scarto <= Math.max(0.005 * Math.abs(n[k]), ASSOLUTA[k])
        assert.ok(ok, `${f.split('/').pop()} ${da}-${a} ${k}: wasm ${w[k]} nativo ${n[k]}`)
      }
    }
  }
})
```

Run: `node --test test/coincidenza.test.mjs`
Expected: con `tratto.praat` non ancora salvato FAIL (ENOENT); dopo lo Step 3 PASS. Durata attesa: alcuni minuti (16 file × 2 tratti × 2 motori, in sequenza).

- [ ] **Step 6: mutazione**

Il corpo dello script è lo stesso per i due motori, quindi la mutazione si fa sulla tolleranza: portare `ASSOLUTA.cpps` a `0` e il fattore relativo `0.005` a `0` → il test deve diventare rosso su `cpps` (fra praat-wasm e Praat nativo il CPPS differisce fino allo 0,074 %, verificato il 09/10 sia con 6.4.62 sia con 7.0.02). Rimettere i valori → verde. Annotare l'esito nel messaggio di commit.

- [ ] **Step 7: Commit**

```bash
git add web/motore/script.mjs web/misure/tratto.praat test/strumenti test/script.test.mjs test/coincidenza.test.mjs
git commit -m "Misure del tratto come script Praat unico; test di coincidenza praat-wasm/Praat nativo"
```

---

### Task 3: Tracce di un file (spettrogramma, F0, formanti, intensità)

**Files:**
- Create: `web/misure/tracce.praat`, `web/motore/tracce.mjs`, `test/tracce.test.mjs`

**Interfaces:**
- Consumes: `componi`, `leggiRisultati` (Task 2), `eseguiWasm`, `fileDiProva`.
- Produces:
  - `tracce.praat` con variabili `file$`, `out$`, `canale`, `tetto`, `f0max`; scrive i file `spettro.txt`, `f0.txt`, `f1.txt`…`f4.txt`, `intensita.txt` in `out$` e le chiavi Info `durata, sp_nx, sp_ny, sp_x1, sp_dx, sp_y1, sp_dy, f0_x1, f0_dx, fo_x1, fo_dx, in_x1, in_dx`.
  - `costruisciTracce(info: string, testi: {spettro, f0, f1, f2, f3, f4, intensita}) → Tracce` dove
    `Tracce = { durata, t0, passo, nT, nF, fPrimo, fPasso, dbMax, spettro: Uint8Array(nT*nF) /* indice i*nF+j, 0 = −70 dB dal massimo, 255 = massimo */, f0: Float32Array(nT) /* NaN = non sonoro */, formanti: Float32Array[4] /* NaN dove manca la voce o intensità < max−25 dB */, intensita: Float32Array(nT) }` tutto campionato sugli istanti dello spettrogramma.

- [ ] **Step 1: tracce.praat**

```praat
# web/misure/tracce.praat — tracce di un file intero. Variabili: file$, out$, canale, tetto, f0max
s0 = Read from file: file$
nc = Get number of channels
if canale > 0 and nc >= canale
  s = Extract one channel: canale
elsif nc > 1
  s = Convert to mono
else
  s = s0
endif
selectObject: s
durata = Get total duration
spg = To Spectrogram: 0.025, 6000, 0.01, 40, "Gaussian"
ms = To Matrix
Save as headerless spreadsheet file: out$ + "spettro.txt"
sp_nx = Get number of columns
sp_ny = Get number of rows
sp_x1 = Get x of column: 1
sp_dx = Get column distance
sp_y1 = Get y of row: 1
sp_dy = Get row distance
selectObject: s
p = To Pitch (ac): 0.01, 75, 15, "yes", 0.03, 0.45, 0.01, 0.35, 0.14, f0max
mp = To Matrix
Save as headerless spreadsheet file: out$ + "f0.txt"
f0_x1 = Get x of column: 1
f0_dx = Get column distance
selectObject: s
fo = To Formant (burg): 0.01, 5, tetto, 0.025, 50
for i to 4
  selectObject: fo
  mf = To Matrix: i
  Save as headerless spreadsheet file: out$ + "f" + string$ (i) + ".txt"
endfor
fo_x1 = Get x of column: 1
fo_dx = Get column distance
selectObject: s
it = To Intensity: 100, 0.01, "yes"
mi = Down to Matrix
Save as headerless spreadsheet file: out$ + "intensita.txt"
in_x1 = Get x of column: 1
in_dx = Get column distance
writeInfoLine: "durata", tab$, durata
appendInfoLine: "sp_nx", tab$, sp_nx
appendInfoLine: "sp_ny", tab$, sp_ny
appendInfoLine: "sp_x1", tab$, sp_x1
appendInfoLine: "sp_dx", tab$, sp_dx
appendInfoLine: "sp_y1", tab$, sp_y1
appendInfoLine: "sp_dy", tab$, sp_dy
appendInfoLine: "f0_x1", tab$, f0_x1
appendInfoLine: "f0_dx", tab$, f0_dx
appendInfoLine: "fo_x1", tab$, fo_x1
appendInfoLine: "fo_dx", tab$, fo_dx
appendInfoLine: "in_x1", tab$, in_x1
appendInfoLine: "in_dx", tab$, in_dx
select all
Remove
```

(Verificato con Praat 7.0.02 il 09/10: su 32 s → spettrogramma 3207 × 185, prima banda 10,77 Hz, passo 32,30 Hz; righe = bande, colonne = istanti; F0 0 dove non sonoro.)

- [ ] **Step 2: test (fallisce)**

```js
// test/tracce.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { costruisciTracce } from '../web/motore/tracce.mjs'
import { componi, leggiRisultati } from '../web/motore/script.mjs'
import { fileDiProva } from './strumenti/file-prova.mjs'
import { createPraatWasm } from '../web/vendor/praat-wasm/js/praat-wasm.mjs'

test('costruisciTracce su dati minimi: allineamento e mascheratura', () => {
  const info = 'durata\t0.05\nsp_nx\t3\nsp_ny\t2\nsp_x1\t0.01\nsp_dx\t0.01\nsp_y1\t10\nsp_dy\t20\n' +
    'f0_x1\t0.02\nf0_dx\t0.01\nfo_x1\t0.01\nfo_dx\t0.01\nin_x1\t0.01\nin_dx\t0.01\n'
  const t = costruisciTracce(info, {
    spettro: '1\t100\t1e-10\n1\t1\t1\n', f0: '0\t220\n',
    f1: '500\t600\t700\n', f2: '1500\t1600\t1700\n', f3: '2500\t2600\t2700\n', f4: '3500\t3600\t3700\n',
    intensita: '70\t70\t20\n'
  })
  assert.equal(t.nT, 3); assert.equal(t.nF, 2)
  assert.ok(Number.isNaN(t.f0[0]))           // 0,01 s: fotogramma F0 −1 → fuori → NaN
  assert.ok(Number.isNaN(t.f0[1]))           // 0,02 s: fotogramma 0 = 0 Hz → non sonoro → NaN
  assert.equal(t.f0[2], 220)                 // 0,03 s: fotogramma 1 = 220 Hz
  assert.equal(t.spettro[1 * 2 + 0], 255)    // massimo (100) in istante 1, banda 0
  assert.ok(Number.isNaN(t.formanti[0][0]))  // F0 assente → formante mascherata
  assert.ok(Number.isNaN(t.formanti[0][2]))  // intensità 20 < 70−25 → mascherata
})

const files = fileDiProva()
test('tracce.praat in praat-wasm su un file reale', { skip: !files && 'SALTATO: mancano file di prova' }, async () => {
  const praat = await createPraatWasm()
  praat.writeFile('/tmp/in.wav', readFileSync(files[0]))
  praat.FS.mkdirTree('/tmp/out')
  const info = praat.run(componi(readFileSync('web/misure/tracce.praat', 'utf8'),
    { file$: '/tmp/in.wav', out$: '/tmp/out/', canale: 1, tetto: 5500, f0max: 1100 }))
  const leggi = (n) => new TextDecoder().decode(praat.getFile('/tmp/out/' + n + '.txt'))
  const t = costruisciTracce(info, { spettro: leggi('spettro'), f0: leggi('f0'), f1: leggi('f1'), f2: leggi('f2'), f3: leggi('f3'), f4: leggi('f4'), intensita: leggi('intensita') })
  const r = leggiRisultati(info)
  assert.equal(t.nT, r.sp_nx); assert.equal(t.nF, r.sp_ny)
  assert.ok(t.nF > 150 && t.nF < 200)
  const sonori = Array.from(t.f0).filter(Number.isFinite)
  assert.ok(sonori.length > t.nT * 0.3, 'troppo pochi istanti sonori')
})
```

Run: `node --test test/tracce.test.mjs` → Expected: FAIL (modulo mancante).

- [ ] **Step 3: tracce.mjs**

```js
// web/motore/tracce.mjs — dai file di Praat a un oggetto tracce campionato sugli istanti dello spettrogramma
import { leggiRisultati } from './script.mjs'

const DINAMICA = 70  // dB

function righe (testo) {
  return String(testo).trim().split('\n').map(r => r.split('\t').map(Number))
}

// valore del fotogramma più vicino a t; fuori dai limiti → NaN
function campiona (valori, x1, dx, t) {
  const k = Math.round((t - x1) / dx)
  return k >= 0 && k < valori.length ? valori[k] : NaN
}

export function costruisciTracce (info, testi) {
  const m = leggiRisultati(info)
  const nT = m.sp_nx, nF = m.sp_ny
  const tempi = Array.from({ length: nT }, (_, i) => m.sp_x1 + i * m.sp_dx)

  const sp = righe(testi.spettro)                 // righe = bande, colonne = istanti
  const db = new Float32Array(nT * nF)
  let dbMax = -Infinity
  for (let j = 0; j < nF; j++) for (let i = 0; i < nT; i++) {
    const v = 10 * Math.log10(Math.max(sp[j][i], 1e-20))
    db[i * nF + j] = v
    if (v > dbMax) dbMax = v
  }
  const spettro = new Uint8Array(nT * nF)
  for (let k = 0; k < db.length; k++) {
    spettro[k] = Math.max(0, Math.min(255, Math.round((db[k] - dbMax + DINAMICA) / DINAMICA * 255)))
  }

  const f0grezzo = righe(testi.f0)[0]
  const f0 = new Float32Array(nT)
  tempi.forEach((t, i) => { const v = campiona(f0grezzo, m.f0_x1, m.f0_dx, t); f0[i] = v > 0 ? v : NaN })

  const intGrezza = righe(testi.intensita)[0]
  const intensita = new Float32Array(nT)
  tempi.forEach((t, i) => { intensita[i] = campiona(intGrezza, m.in_x1, m.in_dx, t) })
  let iMax = -Infinity
  for (const v of intensita) if (Number.isFinite(v) && v > iMax) iMax = v

  const formanti = [1, 2, 3, 4].map(n => {
    const g = righe(testi['f' + n])[0]
    const out = new Float32Array(nT)
    tempi.forEach((t, i) => {
      const v = campiona(g, m.fo_x1, m.fo_dx, t)
      out[i] = (Number.isFinite(f0[i]) && intensita[i] > iMax - 25 && v > 0) ? v : NaN
    })
    return out
  })

  return { durata: m.durata, t0: m.sp_x1, passo: m.sp_dx, nT, nF, fPrimo: m.sp_y1, fPasso: m.sp_dy, dbMax, spettro, f0, formanti, intensita }
}
```

Run: `node --test test/tracce.test.mjs` → Expected: PASS.

- [ ] **Step 4: mutazione** — togliere `Number.isFinite(f0[i]) &&` dalla mascheratura → il primo test deve fallire su `formanti[0][0]`; rimettere → verde.

- [ ] **Step 5: Commit**

```bash
git add web/misure/tracce.praat web/motore/tracce.mjs test/tracce.test.mjs
git commit -m "Tracce di un file da Praat: spettrogramma, F0, formanti mascherate, intensità"
```

---

### Task 4: Logica del worker, testabile in Node

**Files:**
- Create: `web/motore/lavoro.mjs`, `test/lavoro.test.mjs`

**Interfaces:**
- Consumes: `componi`, `leggiRisultati`, `costruisciTracce`.
- Produces: `gestisci(praat, corpi: {tratto, tracce}, richiesta, avanzamento?: (fase: string) => void) → Promise<Tracce | Record<string, number|null> | {errore: string}>` con
  `richiesta = { tipo: 'tracce' | 'misura', audio: ArrayBuffer, nome: string /* estensione per Praat, es. "a.wav" */, canale: 0|1|2, tetto: number, f0max: number, da?: number, a?: number }`.
  Errori previsti → oggetto `{ errore: 'tratto_corto' | 'formato' | 'praat', dettaglio?: string }`, mai un'eccezione.

- [ ] **Step 1: test (fallisce)**

```js
// test/lavoro.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gestisci } from '../web/motore/lavoro.mjs'
import { createPraatWasm } from '../web/vendor/praat-wasm/js/praat-wasm.mjs'
import { fileDiProva } from './strumenti/file-prova.mjs'

const corpi = { tratto: readFileSync('web/misure/tratto.praat', 'utf8'), tracce: readFileSync('web/misure/tracce.praat', 'utf8') }
const tono = (praat) => {
  praat.run('Create Sound as pure tone: "t", 1, 0, 2, 44100, 220, 0.2, 0.01, 0.01\nSave as WAV file: "/tmp/tono.wav"\nselect all\nRemove\n')
  return praat.getFile('/tmp/tono.wav').slice().buffer
}

test('tratto troppo corto → errore tratto_corto, nessuna eccezione', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { tipo: 'misura', audio: tono(praat), nome: 'x.wav', canale: 1, tetto: 5500, f0max: 1100, da: 0.5, a: 0.55 })
  assert.deepEqual(r, { errore: 'tratto_corto' })
})

test('file non audio → errore formato', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { tipo: 'tracce', audio: new TextEncoder().encode('%PDF-1.4').buffer, nome: 'x.wav', canale: 0, tetto: 5500, f0max: 1100 })
  assert.equal(r.errore, 'formato')
})

test('misura su un tono puro a 220 Hz', async () => {
  const praat = await createPraatWasm()
  const fasi = []
  const r = await gestisci(praat, corpi, { tipo: 'misura', audio: tono(praat), nome: 'x.wav', canale: 1, tetto: 5500, f0max: 1100, da: 0.2, a: 1.8 }, f => fasi.push(f))
  assert.ok(Math.abs(r.f0_mediana - 220) < 0.5)
  assert.ok(fasi.length >= 1)
})

const files = fileDiProva()
test('tracce su file reale: forma dell\'oggetto', { skip: !files && 'SALTATO' }, async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { tipo: 'tracce', audio: readFileSync(files[0]).buffer, nome: 'a.wav', canale: 1, tetto: 5500, f0max: 1100 })
  assert.ok(r.spettro instanceof Uint8Array && r.spettro.length === r.nT * r.nF)
})
```

Run: `node --test test/lavoro.test.mjs` → Expected: FAIL (modulo mancante).

- [ ] **Step 2: lavoro.mjs**

```js
// web/motore/lavoro.mjs — cosa fa il worker, senza dipendere dal browser
import { componi, leggiRisultati } from './script.mjs'
import { costruisciTracce } from './tracce.mjs'

export const DURATA_MINIMA = 0.1  // s

const FILE = ['spettro', 'f0', 'f1', 'f2', 'f3', 'f4', 'intensita']

export async function gestisci (praat, corpi, richiesta, avanzamento = () => {}) {
  const est = (String(richiesta.nome).match(/\.[a-z0-9]+$/i) || ['.wav'])[0].toLowerCase()
  const percorso = '/tmp/ingresso' + est
  if (richiesta.tipo === 'misura' && !(richiesta.a - richiesta.da >= DURATA_MINIMA)) return { errore: 'tratto_corto' }
  try {
    praat.writeFile(percorso, new Uint8Array(richiesta.audio))
    const comuni = { file$: percorso, canale: richiesta.canale ?? 0, tetto: richiesta.tetto, f0max: richiesta.f0max }
    if (richiesta.tipo === 'tracce') {
      avanzamento('calcolo')
      try { praat.FS.mkdirTree('/tmp/out') } catch (_) {}
      const info = praat.run(componi(corpi.tracce, { ...comuni, out$: '/tmp/out/' }))
      if (!/sp_nx\t\d+/.test(info)) return { errore: 'formato', dettaglio: info.slice(0, 300) }
      avanzamento('lettura')
      const dec = new TextDecoder()
      const testi = Object.fromEntries(FILE.map(n => [n, dec.decode(praat.getFile('/tmp/out/' + n + '.txt'))]))
      return costruisciTracce(info, testi)
    }
    avanzamento('misura')
    const info = praat.run(componi(corpi.tratto, { ...comuni, da: richiesta.da, a: richiesta.a }))
    const r = leggiRisultati(info)
    if (!('cpps' in r)) return { errore: 'praat', dettaglio: info.slice(0, 300) }
    return r
  } catch (err) {
    const msg = String(err && err.message || err)
    return { errore: /read|file|format|recogni/i.test(msg) ? 'formato' : 'praat', dettaglio: msg.slice(0, 300) }
  } finally {
    try { praat.removeAll() } catch (_) {}
    try { praat.FS.unlink(percorso) } catch (_) {}
  }
}
```

Run: `node --test test/lavoro.test.mjs` → Expected: PASS. Se `praat.run` non solleva eccezioni sugli errori ma restituisce il testo dell'errore, il ramo `!/sp_nx/` e `!('cpps' in r)` lo intercettano: verificare che il test «file non audio» passi per questa via e annotarlo nel commit.

- [ ] **Step 3: mutazione** — portare `DURATA_MINIMA` a `0` → il primo test deve diventare rosso (Praat dà errore o valori) ; rimettere → verde.

- [ ] **Step 4: Commit**

```bash
git add web/motore/lavoro.mjs test/lavoro.test.mjs
git commit -m "Logica del motore: tracce e misura con errori previsti (tratto corto, formato)"
```

---

### Task 5: Web Worker e client

**Files:**
- Create: `web/motore/worker.mjs`, `web/motore/client.mjs`

**Interfaces:**
- Consumes: `gestisci` (Task 4).
- Produces: `creaMotore() → { tracce(audio: ArrayBuffer, opz: {nome, canale, tetto, f0max}, onAvanzamento?): Promise<Tracce|{errore}>, misura(audio, da, a, opz): Promise<Record|{errore}>, pronto: Promise<void> }`. Il client invia **una copia** dell'ArrayBuffer (`audio.slice(0)`) perché il trasferimento svuota l'originale.

- [ ] **Step 1: worker.mjs**

```js
// web/motore/worker.mjs — Praat in un thread separato: la pagina non si blocca mai
import { createPraatWasm } from '../vendor/praat-wasm/js/praat-wasm.mjs'
import { gestisci } from './lavoro.mjs'

let praat = null
let corpi = null

async function prepara () {
  if (!praat) praat = await createPraatWasm(new URL('../vendor/praat-wasm/dist/praat.wasm', import.meta.url))
  if (!corpi) {
    const leggi = (n) => fetch(new URL('../misure/' + n + '.praat', import.meta.url)).then(r => r.text())
    corpi = { tratto: await leggi('tratto'), tracce: await leggi('tracce') }
  }
}

self.onmessage = async (e) => {
  const { id, richiesta } = e.data
  try {
    await prepara()
    if (richiesta.tipo === 'prepara') { self.postMessage({ id, risultato: true }); return }
    const risultato = await gestisci(praat, corpi, richiesta, (fase) => self.postMessage({ id, avanzamento: fase }))
    const trasf = risultato && risultato.spettro ? [risultato.spettro.buffer, risultato.f0.buffer, risultato.intensita.buffer, ...risultato.formanti.map(f => f.buffer)] : []
    self.postMessage({ id, risultato }, trasf)
  } catch (err) {
    self.postMessage({ id, risultato: { errore: 'praat', dettaglio: String(err && err.message || err) } })
  }
}
```

- [ ] **Step 2: client.mjs**

```js
// web/motore/client.mjs — interfaccia a Promise verso il worker
export function creaMotore (url = new URL('./worker.mjs', import.meta.url)) {
  const w = new Worker(url, { type: 'module' })
  let n = 0
  const attese = new Map()
  w.onmessage = (e) => {
    const { id, risultato, avanzamento } = e.data
    const a = attese.get(id)
    if (!a) return
    if (avanzamento) { a.onAvanzamento?.(avanzamento); return }
    attese.delete(id)
    a.resolve(risultato)
  }
  w.onerror = (e) => { for (const a of attese.values()) a.resolve({ errore: 'praat', dettaglio: e.message }); attese.clear() }
  function chiedi (richiesta, onAvanzamento) {
    const id = ++n
    return new Promise((resolve) => {
      attese.set(id, { resolve, onAvanzamento })
      w.postMessage({ id, richiesta }, richiesta.audio ? [richiesta.audio] : [])
    })
  }
  return {
    pronto: chiedi({ tipo: 'prepara' }),
    tracce: (audio, opz, onAvanzamento) => chiedi({ tipo: 'tracce', audio: audio.slice(0), ...opz }, onAvanzamento),
    misura: (audio, da, a, opz) => chiedi({ tipo: 'misura', audio: audio.slice(0), da, a, ...opz })
  }
}
```

- [ ] **Step 3: verifica nel browser** — è coperta dal test del Task 13 (il worker gira solo nel browser). Qui verificare a mano: `python3 -m http.server 8791 --bind 127.0.0.1` dalla radice, aprire in Chrome `http://127.0.0.1:8791/web/index.html?prova-senza-accesso=1` dopo il Task 6, console senza errori, `await (await import('./motore/client.mjs')).creaMotore().pronto` → `true`.

- [ ] **Step 4: Commit**

```bash
git add web/motore/worker.mjs web/motore/client.mjs
git commit -m "Worker di Praat e client a Promise (copia dell'audio, avanzamento)"
```

---

### Task 6: File audio: riconoscimento, coppia o stereo L/R, volume pareggiato

**Files:**
- Create: `web/audio/file.mjs`, `test/file.test.mjs`

**Interfaces:**
- Produces:
  - `classificaFile(nome: string, tipoMime: string) → 'praat' | 'decodifica' | 'non_audio'` (`praat` = WAV, AIFF, FLAC, MP3: si passano a Praat i byte originali; `decodifica` = M4A, AAC, OGG: si decodificano nel browser e si passano come WAV 24 bit).
  - `scegliModo(files: {nome, canali}[]) → { modo: 'coppia' } | { modo: 'chiedi_stereo' } | { modo: 'uno_solo' } | { errore: 'troppi' }`.
  - `wavPcm24(campioni: Float32Array, sr: number) → ArrayBuffer`.
  - `guadagnoPareggiato(campioni: Float32Array, sr: number, obiettivoDb = -20) → number` (fattore lineare: voce = media dei 40 % di finestre da 50 ms più forti).
  - `avvisoDurata(secondi) → null | 'lungo'` (oltre 600 s).

- [ ] **Step 1: test (fallisce)**

```js
// test/file.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificaFile, scegliModo, wavPcm24, guadagnoPareggiato, avvisoDurata } from '../web/audio/file.mjs'
import { createPraatWasm } from '../web/vendor/praat-wasm/js/praat-wasm.mjs'

test('classificaFile', () => {
  assert.equal(classificaFile('a.WAV', 'audio/wav'), 'praat')
  assert.equal(classificaFile('a.m4a', 'audio/mp4'), 'decodifica')
  assert.equal(classificaFile('tesi.pdf', 'application/pdf'), 'non_audio')
})

test('scegliModo', () => {
  assert.deepEqual(scegliModo([{ nome: 'a', canali: 1 }, { nome: 'b', canali: 1 }]), { modo: 'coppia' })
  assert.deepEqual(scegliModo([{ nome: 'lr', canali: 2 }]), { modo: 'chiedi_stereo' })
  assert.deepEqual(scegliModo([{ nome: 'm', canali: 1 }]), { modo: 'uno_solo' })
  assert.deepEqual(scegliModo([{}, {}, {}]), { errore: 'troppi' })
})

test('wavPcm24 è letto da Praat con durata e frequenza giuste', async () => {
  const sr = 48000, c = new Float32Array(sr).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / sr))
  const praat = await createPraatWasm()
  praat.writeFile('/tmp/x.wav', new Uint8Array(wavPcm24(c, sr)))
  const info = praat.run('s = Read from file: "/tmp/x.wav"\nd = Get total duration\nf = Get sampling frequency\nwriteInfoLine: d, " ", f\n')
  assert.equal(info.trim(), '1 48000')
})

test('guadagnoPareggiato porta la voce a −20 dBFS', () => {
  const sr = 1000, c = new Float32Array(sr * 2)
  for (let i = sr; i < 2 * sr; i++) c[i] = 0.01 * Math.sin(i)   // metà silenzio, metà voce piano
  const g = guadagnoPareggiato(c, sr)
  const rmsVoce = 0.01 / Math.SQRT2
  assert.ok(Math.abs(20 * Math.log10(rmsVoce * g) - (-20)) < 0.5)
})

test('avvisoDurata', () => { assert.equal(avvisoDurata(599), null); assert.equal(avvisoDurata(601), 'lungo') })
```

Run: `node --test test/file.test.mjs` → Expected: FAIL.

- [ ] **Step 2: file.mjs**

```js
// web/audio/file.mjs — riconoscere i file, scegliere PRE/POST, scrivere WAV, pareggiare il volume
const PRAAT = /\.(wav|wave|aif|aiff|aifc|flac|mp3)$/i
const DECODIFICA = /\.(m4a|aac|mp4|ogg|oga|opus|webm|caf)$/i

export function classificaFile (nome, tipoMime = '') {
  if (PRAAT.test(nome)) return 'praat'
  if (DECODIFICA.test(nome)) return 'decodifica'
  if (/^audio\//.test(tipoMime)) return 'decodifica'
  return 'non_audio'
}

export function scegliModo (files) {
  if (files.length > 2) return { errore: 'troppi' }
  if (files.length === 2) return { modo: 'coppia' }
  if (files.length === 1 && files[0].canali === 2) return { modo: 'chiedi_stereo' }
  return { modo: 'uno_solo' }
}

export function wavPcm24 (campioni, sr) {
  const n = campioni.length, dati = n * 3
  const buf = new ArrayBuffer(44 + dati), v = new DataView(buf)
  const scrivi = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  scrivi(0, 'RIFF'); v.setUint32(4, 36 + dati, true); scrivi(8, 'WAVE'); scrivi(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 3, true); v.setUint16(32, 3, true); v.setUint16(34, 24, true)
  scrivi(36, 'data'); v.setUint32(40, dati, true)
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, campioni[i]))
    const q = Math.round(x * 8388607)
    v.setUint8(44 + i * 3, q & 255); v.setUint8(45 + i * 3, (q >> 8) & 255); v.setUint8(46 + i * 3, (q >> 16) & 255)
  }
  return buf
}

export function guadagnoPareggiato (campioni, sr, obiettivoDb = -20) {
  const n = Math.max(1, Math.round(0.05 * sr))
  const rms = []
  for (let i = 0; i + n <= campioni.length; i += n) {
    let s = 0; for (let k = i; k < i + n; k++) s += campioni[k] * campioni[k]
    rms.push(s / n)
  }
  if (!rms.length) return 1
  const ord = [...rms].sort((a, b) => a - b)
  const soglia = ord[Math.floor(ord.length * 0.6)]
  const forti = rms.filter(x => x >= soglia)
  const voce = Math.sqrt(forti.reduce((a, b) => a + b, 0) / forti.length)
  return voce > 0 ? Math.pow(10, obiettivoDb / 20) / voce : 1
}

export const avvisoDurata = (s) => (s > 600 ? 'lungo' : null)
```

Run: `node --test test/file.test.mjs` → Expected: PASS.

- [ ] **Step 3: mutazione** — in `scegliModo` cambiare `=== 2` (canali) in `=== 3` → il secondo test rosso; rimettere.

- [ ] **Step 4: Commit**

```bash
git add web/audio/file.mjs test/file.test.mjs
git commit -m "File audio: formati, coppia o stereo L/R, WAV 24 bit, volume pareggiato"
```

---

### Task 7: Scala dei tempi, zoom e selezione

**Files:**
- Create: `web/vista/scala.mjs`, `test/scala.test.mjs`

**Interfaces:**
- Produces: `formatoTempo(s) → "3'12,5\""`; `tempoInX(t, vista, larghezza)`, `xInTempo(x, vista, larghezza)` con `vista = {da, a}` in secondi; `zoom(vista, centro, fattore, durata) → vista`; `limitaSelezione(sel: {da, a}, durata) → {da, a} | null` (null se dopo il limite dura meno di 0,02 s); `ordinaSelezione(t1, t2) → {da, a}`.

- [ ] **Step 1: test (fallisce)**

```js
// test/scala.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatoTempo, tempoInX, xInTempo, zoom, limitaSelezione, ordinaSelezione } from '../web/vista/scala.mjs'

test('formatoTempo', () => {
  assert.equal(formatoTempo(192.5), '3\'12,5"')
  assert.equal(formatoTempo(5.04), '0\'05,0"')
})
test('tempo ↔ pixel', () => {
  const v = { da: 10, a: 20 }
  assert.equal(tempoInX(15, v, 1000), 500)
  assert.equal(xInTempo(250, v, 1000), 12.5)
})
test('zoom resta dentro il file', () => {
  assert.deepEqual(zoom({ da: 0, a: 30 }, 1, 0.5, 30), { da: 0, a: 15 })
  assert.deepEqual(zoom({ da: 0, a: 30 }, 29, 0.5, 30), { da: 15, a: 30 })
  assert.deepEqual(zoom({ da: 10, a: 12 }, 11, 4, 30), { da: 7, a: 15 })
})
test('selezione limitata alla durata di ciascun file (PRE 40 s, POST 30 s)', () => {
  assert.deepEqual(limitaSelezione({ da: 28, a: 35 }, 30), { da: 28, a: 30 })
  assert.equal(limitaSelezione({ da: 31, a: 35 }, 30), null)
  assert.deepEqual(ordinaSelezione(5, 2), { da: 2, a: 5 })
})
```

- [ ] **Step 2: scala.mjs**

```js
// web/vista/scala.mjs — conversioni fra tempo e pixel, zoom, selezione
export function formatoTempo (s) {
  const m = Math.floor(s / 60), r = s - m * 60
  return `${m}'${r.toFixed(1).padStart(4, '0').replace('.', ',')}"`
}
export const tempoInX = (t, v, w) => (t - v.da) / (v.a - v.da) * w
export const xInTempo = (x, v, w) => v.da + x / w * (v.a - v.da)
export function zoom (v, centro, fattore, durata) {
  const larg = Math.min(durata, Math.max(0.2, (v.a - v.da) * fattore))
  let da = centro - (centro - v.da) * fattore
  da = Math.max(0, Math.min(da, durata - larg))
  return { da: Math.round(da * 1e6) / 1e6, a: Math.round((da + larg) * 1e6) / 1e6 }
}
export const ordinaSelezione = (t1, t2) => ({ da: Math.min(t1, t2), a: Math.max(t1, t2) })
export function limitaSelezione (sel, durata) {
  const da = Math.max(0, sel.da), a = Math.min(durata, sel.a)
  return a - da >= 0.02 ? { da, a } : null
}
```

Run: `node --test test/scala.test.mjs` → Expected: PASS (correggere il terzo caso di `zoom` se la formula dà valori diversi: lo zoom con centro 11 e fattore 4 su {10,12} deve dare larghezza 8 centrata in proporzione: da = 11 − 1·4 = 7 → {7, 15}).

- [ ] **Step 3: mutazione** — togliere `Math.min(durata, …)` in `limitaSelezione` → test rosso; rimettere.

- [ ] **Step 4: Commit**

```bash
git add web/vista/scala.mjs test/scala.test.mjs
git commit -m "Scala dei tempi, zoom e selezione limitata alla durata di ciascun file"
```

---

### Task 8: Disegno dello spettrogramma

**Files:**
- Create: `web/vista/spettrogramma.mjs`

**Interfaces:**
- Consumes: `Tracce` (Task 3), `tempoInX`, `formatoTempo` (Task 7).
- Produces: `disegna(canvas: HTMLCanvasElement, tracce: Tracce, stato: {vista:{da,a}, selezione:{da,a}|null, cursore:number|null, mostra:{f0:boolean, formanti:boolean, fascia:boolean}, etichetta:'PRE'|'POST', colore:string, scostamento:number})` — disegna tutto sul canvas (usa `devicePixelRatio`); `FMAX_VISTA = 6000`.

- [ ] **Step 1: spettrogramma.mjs**

```js
// web/vista/spettrogramma.mjs — spettrogramma in grigi stile Praat + F0, formanti, fascia, selezione, cursore
import { tempoInX, formatoTempo } from './scala.mjs'

export const FMAX_VISTA = 6000
const MARG = { s: 52, d: 10, a: 22, b: 26 }
const COLORI_F = ['#d62728', '#2ca02c', '#1f77b4', '#9467bd']

export function disegna (canvas, tr, st) {
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth, H = canvas.clientHeight
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  const c = canvas.getContext('2d')
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H)
  const w = W - MARG.s - MARG.d, h = H - MARG.a - MARG.b
  const y = (f) => MARG.a + h - f / FMAX_VISTA * h

  // pixel dello spettrogramma: per ogni colonna di schermo l'istante più vicino
  const img = c.createImageData(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)))
  for (let px = 0; px < img.width; px++) {
    const t = st.vista.da + (px + 0.5) / img.width * (st.vista.a - st.vista.da)
    const i = Math.round((t - tr.t0) / tr.passo)
    if (i < 0 || i >= tr.nT) continue
    for (let py = 0; py < img.height; py++) {
      const f = (img.height - py - 0.5) / img.height * FMAX_VISTA
      const j = Math.round((f - tr.fPrimo) / tr.fPasso)
      if (j < 0 || j >= tr.nF) continue
      const g = 255 - tr.spettro[i * tr.nF + j]
      const k = (py * img.width + px) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255
    }
  }
  c.putImageData(img, MARG.s * dpr, MARG.a * dpr)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (st.mostra.fascia) { c.fillStyle = 'rgba(247,216,74,0.25)'; c.fillRect(MARG.s, y(5000), w, y(4000) - y(5000)) }

  const punti = (valori, colore, linea) => {
    c.strokeStyle = colore; c.fillStyle = colore; c.lineWidth = 2
    let aperto = false
    c.beginPath()
    for (let i = 0; i < tr.nT; i++) {
      const t = tr.t0 + i * tr.passo
      if (t < st.vista.da || t > st.vista.a) continue
      const v = valori[i]
      if (!Number.isFinite(v)) { aperto = false; continue }
      const x = MARG.s + tempoInX(t, st.vista, w), yy = y(v)
      if (linea) { if (aperto) c.lineTo(x, yy); else c.moveTo(x, yy); aperto = true } else c.fillRect(x - 1, yy - 1, 2.4, 2.4)
    }
    if (linea) c.stroke()
  }
  if (st.mostra.formanti) tr.formanti.forEach((f, k) => punti(f, COLORI_F[k], false))
  if (st.mostra.f0) punti(tr.f0, '#111', true)

  if (st.selezione) {
    const x1 = MARG.s + tempoInX(st.selezione.da, st.vista, w), x2 = MARG.s + tempoInX(st.selezione.a, st.vista, w)
    c.fillStyle = 'rgba(138,59,18,0.15)'; c.fillRect(x1, MARG.a, x2 - x1, h)
    c.strokeStyle = '#8a3b12'; c.lineWidth = 1.5; c.strokeRect(x1, MARG.a, x2 - x1, h)
  }
  if (st.cursore != null) {
    const x = MARG.s + tempoInX(st.cursore, st.vista, w)
    c.strokeStyle = '#d2551e'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, MARG.a); c.lineTo(x, MARG.a + h); c.stroke()
  }

  // assi
  c.fillStyle = '#333'; c.font = '12px system-ui, sans-serif'; c.textAlign = 'right'
  for (let f = 0; f <= FMAX_VISTA; f += 1000) c.fillText(String(f), MARG.s - 6, y(f) + 4)
  c.textAlign = 'center'
  const durata = st.vista.a - st.vista.da
  const passo = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60].find(p => durata / p <= 10) || 60
  for (let t = Math.ceil(st.vista.da / passo) * passo; t <= st.vista.a; t += passo) {
    c.fillText(formatoTempo(t + st.scostamento), MARG.s + tempoInX(t, st.vista, w), H - 8)
  }
  c.font = 'bold 18px system-ui, sans-serif'; c.textAlign = 'left'; c.fillStyle = st.colore
  c.fillText(st.etichetta, MARG.s + 8, MARG.a + 20)
  c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(MARG.s, MARG.a, w, h)
}

export const margini = () => ({ ...MARG })
```

- [ ] **Step 2: verifica** — coperta dal test del Task 13 (screenshot non vuoto, pixel scuri sopra le armoniche). Nessun test Node (serve un canvas).

- [ ] **Step 3: Commit**

```bash
git add web/vista/spettrogramma.mjs
git commit -m "Disegno dello spettrogramma con F0, formanti, fascia 4-5 kHz, selezione e cursore"
```

---

### Task 9: Registro delle misure e tabella PRE/POST

**Files:**
- Create: `web/misure/registro.mjs`, `web/misura/tabella.mjs`, `test/tabella.test.mjs`

**Interfaces:**
- Produces:
  - `REGISTRO: {chiave, etichetta, unita, decimali, scala?, aiuto}[]` nell'ordine di visualizzazione (chiavi = output di `tratto.praat`).
  - `righeTabella(pre, post, registro) → {chiave, etichetta, unita, aiuto, pre: string, post: string, differenza: string}[]` dove un valore `null`/assente diventa `"—"`, la differenza è `"—"` se uno dei due manca, con segno `+`/`−` e virgola decimale.
  - `motivoErrore(errore) → string` in italiano.

- [ ] **Step 1: test (fallisce)**

```js
// test/tabella.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REGISTRO } from '../web/misure/registro.mjs'
import { righeTabella, motivoErrore } from '../web/misura/tabella.mjs'

test('righeTabella: formati, differenze, valori mancanti', () => {
  const r = righeTabella({ cpps: 7.6085, hnr: null, jitter: 0.0061221 }, { cpps: 8.0, hnr: 23.1, jitter: 0.0059 }, REGISTRO)
  const cpps = r.find(x => x.chiave === 'cpps'), hnr = r.find(x => x.chiave === 'hnr'), jit = r.find(x => x.chiave === 'jitter')
  assert.deepEqual([cpps.pre, cpps.post, cpps.differenza], ['7,61', '8,00', '+0,39'])
  assert.deepEqual([hnr.pre, hnr.differenza], ['—', '—'])
  assert.deepEqual([jit.pre, jit.post, jit.differenza], ['0,61', '0,59', '−0,02'])  // in %
})
test('ogni chiave di tratto.praat ha una riga nel registro', async () => {
  const { readFileSync } = await import('node:fs')
  const chiavi = [...readFileSync('web/misure/tratto.praat', 'utf8').matchAll(/InfoLine: "([a-z0-9_]+)"/g)].map(m => m[1])
  for (const k of chiavi) assert.ok(REGISTRO.some(x => x.chiave === k), 'manca nel registro: ' + k)
})
test('motivoErrore', () => { assert.match(motivoErrore('tratto_corto'), /0,1 s/) })
```

- [ ] **Step 2: registro.mjs**

```js
// web/misure/registro.mjs — come si mostra ogni misura. Aiuti in italiano semplice (stessi testi del caso pilota).
export const REGISTRO = [
  { chiave: 'durata', etichetta: 'Durata del tratto', unita: 's', decimali: 2, aiuto: 'Lunghezza del tratto misurato.' },
  { chiave: 'f0_mediana', etichetta: 'Altezza mediana (F0)', unita: 'Hz', decimali: 1, aiuto: 'La frequenza fondamentale tipica del tratto (metà dei valori sta sopra, metà sotto).' },
  { chiave: 'f0_min', etichetta: 'Altezza minima', unita: 'Hz', decimali: 1, aiuto: 'La nota più grave cantata nel tratto.' },
  { chiave: 'f0_max', etichetta: 'Altezza massima', unita: 'Hz', decimali: 1, aiuto: 'La nota più acuta cantata nel tratto.' },
  { chiave: 'scarto_cents', etichetta: 'Scarto dalla nota', unita: 'cents', decimali: 1, aiuto: 'Distanza dell\'altezza mediana dal semitono temperato più vicino (La = 440 Hz). 100 cents = un semitono.' },
  { chiave: 'f0_sd_cents', etichetta: 'Oscillazione dell\'altezza', unita: 'cents', decimali: 1, aiuto: 'Quanto varia l\'altezza nel tratto (comprende melodia, ornamenti e vibrato).' },
  { chiave: 'cpps', etichetta: 'CPPS', unita: 'dB', decimali: 2, aiuto: 'Quanto la voce è periodica e «piena». Più alto = meno aria e rumore.' },
  { chiave: 'hnr', etichetta: 'HNR', unita: 'dB', decimali: 1, aiuto: 'Rapporto fra suono armonico e rumore. Più alto = voce più pulita.' },
  { chiave: 'jitter', etichetta: 'Jitter', unita: '%', decimali: 2, scala: 100, aiuto: 'Irregolarità della frequenza da un ciclo all\'altro. Più basso = più regolare. Sul canto risente del vibrato.' },
  { chiave: 'shimmer', etichetta: 'Shimmer', unita: '%', decimali: 2, scala: 100, aiuto: 'Irregolarità dell\'ampiezza da un ciclo all\'altro. Più basso = più regolare. Sul canto risente del vibrato.' },
  { chiave: 'h1h2', etichetta: 'H1−H2', unita: 'dB', decimali: 1, aiuto: 'Differenza fra prima e seconda armonica. Più alto = voce più morbida e soffiata; più basso = chiusura più decisa, più spinta. Dipende dalla vocale.' },
  { chiave: 'alpha', etichetta: 'Alpha ratio', unita: 'dB', decimali: 1, aiuto: 'Energia sopra 1 kHz rispetto a quella sotto. Più alto = più brillantezza (o più spinta).' },
  { chiave: 'pendenza', etichetta: 'Pendenza dello spettro', unita: 'dB', decimali: 1, aiuto: 'Come cala l\'energia dalle frequenze gravi alle acute. Meno negativa = spettro più ricco di acuti.' },
  { chiave: 'spr', etichetta: 'SPR', unita: 'dB', decimali: 1, aiuto: 'Picco 0-2 kHz meno picco 2-4 kHz. Più basso = più «squillo».' },
  { chiave: 'f1', etichetta: 'Formante F1', unita: 'Hz', decimali: 0, aiuto: 'Apertura della vocale. Poco affidabile sulle note acute (sopra circa 350 Hz).' },
  { chiave: 'f2', etichetta: 'Formante F2', unita: 'Hz', decimali: 0, aiuto: 'Posizione avanti/indietro della lingua. Poco affidabile sulle note acute.' },
  { chiave: 'f3', etichetta: 'Formante F3', unita: 'Hz', decimali: 0, aiuto: 'Timbro. Poco affidabile sulle note acute.' },
  { chiave: 'f4', etichetta: 'Formante F4', unita: 'Hz', decimali: 0, aiuto: 'Timbro e squillo. Poco affidabile sulle note acute.' },
  { chiave: 'livello', etichetta: 'Livello medio', unita: 'dB', decimali: 1, aiuto: 'Intensità media nel file caricato (non calibrata: dipende dal guadagno della registrazione).' },
  { chiave: 'livello_sd', etichetta: 'Instabilità del volume', unita: 'dB', decimali: 2, aiuto: 'Quanto varia il volume nel tratto.' }
]
```

- [ ] **Step 3: tabella.mjs**

```js
// web/misura/tabella.mjs — righe della tabella PRE/POST e messaggi d'errore
const num = (v, d) => v.toFixed(d).replace('.', ',').replace('-', '−')

export function righeTabella (pre, post, registro) {
  return registro.map(m => {
    const k = m.scala || 1
    const a = pre && Number.isFinite(pre[m.chiave]) ? pre[m.chiave] * k : null
    const b = post && Number.isFinite(post[m.chiave]) ? post[m.chiave] * k : null
    const diff = a !== null && b !== null ? b - a : null
    return {
      chiave: m.chiave, etichetta: m.etichetta, unita: m.unita, aiuto: m.aiuto,
      pre: a === null ? '—' : num(a, m.decimali),
      post: b === null ? '—' : num(b, m.decimali),
      differenza: diff === null ? '—' : (diff > 0 ? '+' : '') + num(diff, m.decimali)
    }
  })
}

const MOTIVI = {
  tratto_corto: 'Tratto troppo corto: selezionane almeno 0,1 s.',
  formato: 'Formato non riconosciuto: usa WAV, AIFF, FLAC, MP3 o M4A.',
  praat: 'Praat non è riuscito a misurare questo tratto (spesso succede se è quasi tutto silenzio).'
}
export const motivoErrore = (e) => MOTIVI[e] || MOTIVI.praat
```

Run: `node --test test/tabella.test.mjs` → Expected: PASS.

- [ ] **Step 4: mutazione** — in `righeTabella` togliere `* k` → il test del jitter rosso; rimettere.

- [ ] **Step 5: Commit**

```bash
git add web/misure/registro.mjs web/misura/tabella.mjs test/tabella.test.mjs
git commit -m "Registro delle misure con aiuti e tabella PRE/POST con differenze"
```

---

### Task 10: Ascolto A/B

**Files:**
- Create: `web/ascolto/ab.mjs`

**Interfaces:**
- Consumes: `guadagnoPareggiato` (Task 6).
- Produces: `creaAscolto() → { carica(lato: 'PRE'|'POST', audioBuffer: AudioBuffer), play(da: number), pausa(), scambia(), sceltoÈ(): 'PRE'|'POST', posizione(): number, loop(sel: {da,a}|null), prePoiPost(sel: {da,a}), pareggia(on: boolean), inRiproduzione(): boolean }`.
  Comportamento: due sorgenti partono insieme alla stessa posizione; si sente solo quella scelta (guadagno 0/1 con dissolvenza di 10 ms); `scambia()` non riparte da capo; con `loop` attivo ricomincia dall'inizio della selezione; `prePoiPost` suona il tratto PRE, 0,7 s di pausa, il tratto POST; `pareggia(true)` applica a ciascun lato il proprio `guadagnoPareggiato` calcolato sul primo canale.

- [ ] **Step 1: ab.mjs**

```js
// web/ascolto/ab.mjs — ascolto A/B sincronizzato con WebAudio
import { guadagnoPareggiato } from '../audio/file.mjs'

export function creaAscolto () {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const buf = {}, g = {}, pari = { PRE: 1, POST: 1 }
  for (const l of ['PRE', 'POST']) { g[l] = ctx.createGain(); g[l].connect(ctx.destination) }
  let sorgenti = [], scelto = 'PRE', inizio = 0, offset = 0, attivo = false, ciclo = null, pareggio = true, timerSeq = null

  const lineare = (l) => (pareggio ? pari[l] : 1)
  function applica (rapido = true) {
    const t = ctx.currentTime, dur = rapido ? 0.01 : 0
    for (const l of ['PRE', 'POST']) g[l].gain.setTargetAtTime(l === scelto ? lineare(l) : 0, t, dur)
  }
  function ferma () { sorgenti.forEach(s => { try { s.stop() } catch (_) {} }); sorgenti = []; attivo = false; clearTimeout(timerSeq) }
  function posizione () { return attivo ? offset + (ctx.currentTime - inizio) : offset }

  function avvia (da) {
    ferma()
    offset = Math.max(0, da); inizio = ctx.currentTime + 0.02
    for (const l of ['PRE', 'POST']) {
      if (!buf[l]) continue
      const s = ctx.createBufferSource(); s.buffer = buf[l]; s.connect(g[l])
      if (ciclo) { s.loop = true; s.loopStart = ciclo.da; s.loopEnd = ciclo.a }
      if (offset < buf[l].duration) s.start(inizio, offset)
      sorgenti.push(s)
    }
    attivo = true; applica(false)
  }

  return {
    async carica (lato, audioBuffer) { buf[lato] = audioBuffer; pari[lato] = guadagnoPareggiato(audioBuffer.getChannelData(0), audioBuffer.sampleRate) },
    async play (da = posizione()) { if (ctx.state === 'suspended') await ctx.resume(); avvia(ciclo && (da < ciclo.da || da >= ciclo.a) ? ciclo.da : da) },
    pausa () { offset = posizione(); ferma() },
    scambia () { scelto = scelto === 'PRE' ? 'POST' : 'PRE'; applica(); return scelto },
    sceltoÈ: () => scelto,
    posizione () {
      const p = posizione()
      return ciclo && attivo ? ciclo.da + ((p - ciclo.da) % (ciclo.a - ciclo.da) + (ciclo.a - ciclo.da)) % (ciclo.a - ciclo.da) : p
    },
    loop (sel) { ciclo = sel; if (attivo) avvia(sel ? sel.da : posizione()) },
    async prePoiPost (sel) {
      if (ctx.state === 'suspended') await ctx.resume()
      ferma(); const t0 = ctx.currentTime + 0.05, d = sel.a - sel.da
      ;['PRE', 'POST'].forEach((l, k) => {
        if (!buf[l]) return
        const s = ctx.createBufferSource(); s.buffer = buf[l]
        const gg = ctx.createGain(); gg.gain.value = lineare(l); s.connect(gg); gg.connect(ctx.destination)
        s.start(t0 + k * (d + 0.7), sel.da, d); sorgenti.push(s)
      })
      attivo = true; inizio = t0; offset = sel.da
      timerSeq = setTimeout(() => { attivo = false; offset = sel.da }, (2 * d + 0.8) * 1000)
    },
    pareggia (on) { pareggio = on; applica() },
    inRiproduzione: () => attivo
  }
}
```

- [ ] **Step 2: verifica** — coperta dal test del Task 13 (posizione invariata dopo `scambia()`: differenza < 0,05 s). Ascolto vero: controllo a mano di Simone (Step finale del Task 13).

- [ ] **Step 3: Commit**

```bash
git add web/ascolto/ab.mjs
git commit -m "Ascolto A/B sincronizzato, loop sulla selezione, PRE poi POST, volume pareggiato"
```

---

### Task 11: Accesso con Google (obbligatorio, valido offline)

**Files:**
- Create: `web/accesso/config.mjs`, `web/accesso/accesso.mjs`, `test/accesso.test.mjs`

**Interfaces:**
- Produces:
  - `statoAccesso({ sessione: object|null, salvata: boolean, online: boolean }) → 'dentro' | 'fuori'` — con rete conta `sessione`; **senza rete** basta una sessione salvata (`salvata`).
  - `avviaAccesso() → Promise<{ stato, utente: {id, email}|null, client }>`; `entraConGoogle()`; `esci()`.
  - `chiaveSessione() → string` (chiave del localStorage di supabase-js: `sb-vsodplqkuvnsdiikvmjb-auth-token`).
  - Modalità di prova: con `?prova-senza-accesso=1` **e** `location.hostname === '127.0.0.1'` lo stato è `'dentro'` senza Supabase (solo per i test locali; in produzione ignorata).

- [ ] **Step 1: test (fallisce)**

```js
// test/accesso.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statoAccesso, provaSenzaAccesso } from '../web/accesso/accesso.mjs'

test('offline con sessione salvata resta dentro (la prima utente alla discussione)', () => {
  assert.equal(statoAccesso({ sessione: null, salvata: true, online: false }), 'dentro')
  assert.equal(statoAccesso({ sessione: null, salvata: false, online: false }), 'fuori')
  assert.equal(statoAccesso({ sessione: { user: {} }, salvata: true, online: true }), 'dentro')
  assert.equal(statoAccesso({ sessione: null, salvata: true, online: true }), 'fuori')
})
test('la prova senza accesso vale solo su 127.0.0.1', () => {
  assert.equal(provaSenzaAccesso({ hostname: '127.0.0.1', search: '?prova-senza-accesso=1' }), true)
  assert.equal(provaSenzaAccesso({ hostname: 'stageplot.it', search: '?prova-senza-accesso=1' }), false)
})
```

- [ ] **Step 2: config.mjs**

```js
// web/accesso/config.mjs — Supabase di StagePlot (chiave pubblica «anon», già pubblica nel sito)
export const SB_URL = 'https://vsodplqkuvnsdiikvmjb.supabase.co'
export const SB_ANON = '<<copiare il valore di SB_ANON da $STAGEPLOT/app.js>>'
export const RITORNO = '/voce/'
```

Copiare la chiave con: `grep -o 'SB_ANON="[^"]*"' $STAGEPLOT/app.js | head -1` e incollarla al posto del segnaposto (è la chiave pubblica che StagePlot serve a tutti i visitatori; non stamparla nei messaggi). Test di controllo nello Step 4: il file non deve contenere `<<`.

- [ ] **Step 3: accesso.mjs**

```js
// web/accesso/accesso.mjs — login Google obbligatorio; offline non vuol dire uscito
import { SB_URL, SB_ANON, RITORNO } from './config.mjs'

export const chiaveSessione = () => 'sb-' + new URL(SB_URL).hostname.split('.')[0] + '-auth-token'

export function statoAccesso ({ sessione, salvata, online }) {
  if (!online) return salvata ? 'dentro' : 'fuori'
  return sessione ? 'dentro' : 'fuori'
}

export const provaSenzaAccesso = (loc) =>
  loc.hostname === '127.0.0.1' && new URLSearchParams(loc.search).get('prova-senza-accesso') === '1'

let client = null
function prendiClient () {
  if (!client) client = window.supabase.createClient(SB_URL, SB_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  return client
}

export async function avviaAccesso () {
  if (provaSenzaAccesso(location)) return { stato: 'dentro', utente: { id: 'prova', email: 'prova@locale' }, client: null }
  let salvata = false
  try { salvata = !!localStorage.getItem(chiaveSessione()) } catch (_) {}
  const online = navigator.onLine
  let sessione = null
  if (online) {
    try { sessione = (await prendiClient().auth.getSession()).data.session } catch (_) { sessione = null }
  }
  const stato = statoAccesso({ sessione, salvata, online })
  let utente = null
  if (sessione) utente = { id: sessione.user.id, email: sessione.user.email }
  else if (stato === 'dentro') {
    try { const s = JSON.parse(localStorage.getItem(chiaveSessione())); utente = { id: s.user.id, email: s.user.email } } catch (_) {}
  }
  return { stato, utente, client: online ? prendiClient() : null }
}

export function entraConGoogle () {
  return prendiClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + RITORNO } })
}

export async function esci () { try { await prendiClient().auth.signOut() } catch (_) {} location.reload() }
```

Run: `node --test test/accesso.test.mjs` → Expected: PASS.

- [ ] **Step 4: controllo del segnaposto** — aggiungere a `test/accesso.test.mjs`:

```js
test('config.mjs ha la chiave vera (nessun segnaposto)', async () => {
  const { readFileSync } = await import('node:fs')
  assert.ok(!readFileSync('web/accesso/config.mjs', 'utf8').includes('<<'))
})
```

- [ ] **Step 5: indirizzo di ritorno in Supabase (azione esterna approvata da Simone il 09/10)**

Strada A (preferita, la fa Simone in un minuto): Supabase → progetto StagePlot (`vsodplqkuvnsdiikvmjb`) → Authentication → URL Configuration → Redirect URLs → aggiungere `https://stageplot.it/voce/` → Save.
Strada B (se il token della Management API è disponibile nel portachiavi, vedi memoria «Portachiavi Supabase»): `GET https://api.supabase.com/v1/projects/vsodplqkuvnsdiikvmjb/config/auth` → leggere `uri_allow_list` → **aggiungere** (non sostituire) `,https://stageplot.it/voce/` → `PATCH` con il solo campo `uri_allow_list` → rileggere con `GET` e verificare che le voci precedenti ci siano ancora.

- [ ] **Step 6: mutazione** — in `statoAccesso` invertire `salvata ? 'dentro' : 'fuori'` → primo test rosso; rimettere.

- [ ] **Step 7: Commit**

```bash
git add web/accesso test/accesso.test.mjs
git commit -m "Accesso con Google obbligatorio, valido anche offline con la sessione salvata"
```

---

### Task 12: Pagina, orchestrazione, esportazione PNG e pagina fonti

**Files:**
- Create: `web/index.html`, `web/stile.css`, `web/testi/it.mjs`, `web/app.js`, `web/esporta/png.mjs`, `web/fonti.html`, `test/png.test.mjs`

**Interfaces:**
- Consumes: tutti i moduli precedenti.
- Produces: la pagina; `nomeFigura(nomePre: string, sel: {da,a}|null, scostamento: number) → string` (es. `voce_Fase1_Nome_3m12-3m15.png`, senza caratteri speciali); hook di prova `window.__voce = { stato, seleziona(da, a), misura(), ultimaFigura }` presente **solo** in modalità di prova.

- [ ] **Step 1: test di nomeFigura (fallisce)**

```js
// test/png.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomeFigura } from '../web/esporta/png.mjs'

test('nomeFigura pulisce il nome e mette i tempi', () => {
  assert.equal(nomeFigura('Fase1 Nome (PRE).wav', { da: 7.75, a: 10.25 }, 184.75), 'voce_Fase1-Nome-PRE_3m12-3m15.png')
  assert.equal(nomeFigura('x.wav', null, 0), 'voce_x.png')
})
```

- [ ] **Step 2: png.mjs**

```js
// web/esporta/png.mjs — figura per la tesi: titolo, i due spettrogrammi, legenda, piede con la fonte
const mmss = (s) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}`

export function nomeFigura (nomePre, sel, scostamento = 0) {
  const base = String(nomePre).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return 'voce_' + base + (sel ? `_${mmss(sel.da + scostamento)}-${mmss(sel.a + scostamento)}` : '') + '.png'
}

export function componiFigura ({ canvasPre, canvasPost, titolo, legenda, piede }) {
  const W = Math.max(canvasPre.width, canvasPost.width), testa = 70, pie = 70
  const out = document.createElement('canvas')
  out.width = W; out.height = testa + canvasPre.height + canvasPost.height + pie
  const c = out.getContext('2d')
  c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height)
  c.fillStyle = '#111'; c.font = `bold ${Math.round(W / 50)}px system-ui, sans-serif`; c.fillText(titolo, 20, 45)
  c.drawImage(canvasPre, 0, testa); c.drawImage(canvasPost, 0, testa + canvasPre.height)
  c.font = `${Math.round(W / 85)}px system-ui, sans-serif`; c.fillStyle = '#444'
  c.fillText(legenda, 20, out.height - 40); c.fillText(piede, 20, out.height - 14)
  return out
}

export function scarica (canvas, nome) {
  return new Promise((res) => canvas.toBlob((b) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); res(b)
  }, 'image/png'))
}
```

Run: `node --test test/png.test.mjs` → Expected: PASS.

- [ ] **Step 3: testi/it.mjs**

```js
// web/testi/it.mjs — tutte le scritte dell'interfaccia
export const T = {
  titolo: 'Analisi vocale',
  sottotitolo: 'Confronta due registrazioni della stessa voce. L\'audio resta sul tuo computer.',
  entra: 'Entra con Google',
  esci: 'Esci',
  perche: 'Serve un accesso per sapere come viene usato lo strumento e migliorarlo. Non registriamo l\'audio.',
  caricaPre: 'Trascina qui la registrazione PRE (o clicca)',
  caricaPost: 'Trascina qui la registrazione POST (o clicca)',
  stereo: 'Questo file ha due canali. È una registrazione con PRE a sinistra e POST a destra?',
  stereoSi: 'Sì: sinistra PRE, destra POST', stereoNo: 'No: è un normale file stereo',
  calcolo: 'Praat sta calcolando lo spettrogramma…',
  primaVolta: 'La prima volta si scarica Praat (circa 25 MB): un momento.',
  play: '▶ Play', pausa: '❚❚ Pausa', ab: 'In ascolto: ', prePoiPost: 'Ascolta PRE poi POST', togli: 'Togli selezione',
  misura: 'Misura il tratto', esporta: 'Scarica immagine (PNG)', pareggio: 'Volume pareggiato',
  f0: 'Altezza (F0)', formanti: 'Formanti', fascia: 'Fascia 4-5 kHz',
  aiutoComandi: 'Clic = salta · trascina = seleziona un tratto (si ripete) · rotella = zoom · Spazio = play/pausa · X = PRE/POST · Esc = togli selezione',
  legenda: 'Grigio: armoniche e rumore · linea nera: altezza (F0) · puntini: formanti F1 rosso, F2 verde, F3 blu, F4 viola · fascia gialla: 4-5 kHz',
  piede: (versione) => `Analisi con Praat ${versione} (Boersma & Weenink) nel browser · stageplot.it/voce`,
  didattico: 'Strumento didattico: confronta la persona con sé stessa. Non è uno strumento diagnostico.',
  lungo: 'File lungo (oltre 10 minuti): il calcolo può richiedere qualche minuto.',
  acuto: 'Nota acuta (sopra circa 350 Hz): le formanti sono poco affidabili.',
  fonti: 'Da dove viene ogni misura', sorgente: 'Codice sorgente (GPL-3)'
}
```

- [ ] **Step 4: index.html** (CSP adatta a WebAssembly, worker e Supabase)

```html
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://vsodplqkuvnsdiikvmjb.supabase.co; frame-ancestors 'none'">
<title>Analisi vocale</title>
<link rel="stylesheet" href="stile.css">
<script src="vendor/supabase/supabase.js"></script>
<script type="module" src="app.js"></script>
</head>
<body>
<header class="testa">
  <h1>Analisi vocale</h1>
  <p class="sotto" id="sottotitolo"></p>
  <div class="utente" id="utente" hidden><span id="email"></span> <button id="esci" class="piccolo"></button></div>
</header>

<section id="schermo-accesso" class="pannello" hidden>
  <p id="perche"></p>
  <button id="entra" class="grande"></button>
</section>

<main id="schermo-app" hidden>
  <section class="carica">
    <label class="zona" id="zona-pre"><input type="file" id="file-pre" accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a"><span id="testo-pre"></span></label>
    <label class="zona" id="zona-post"><input type="file" id="file-post" accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a"><span id="testo-post"></span></label>
  </section>
  <div id="domanda-stereo" class="pannello" hidden><p id="testo-stereo"></p><button id="stereo-si"></button> <button id="stereo-no"></button></div>
  <p id="stato" class="stato" aria-live="polite"></p>

  <section id="comandi" class="comandi" hidden>
    <button id="play" class="grande"></button>
    <button id="ab" class="grande"></button>
    <button id="pre-poi-post"></button>
    <button id="togli"></button>
    <button id="misura" class="evidenza"></button>
    <button id="esporta"></button>
    <label><input type="checkbox" id="c-pareggio" checked> <span id="t-pareggio"></span></label>
    <label><input type="checkbox" id="c-f0" checked> <span id="t-f0"></span></label>
    <label><input type="checkbox" id="c-formanti"> <span id="t-formanti"></span></label>
    <label><input type="checkbox" id="c-fascia"> <span id="t-fascia"></span></label>
    <span id="tempo" class="tempo"></span>
    <p class="aiuto" id="aiuto-comandi"></p>
  </section>

  <canvas id="spg-pre" class="spg" hidden></canvas>
  <canvas id="spg-post" class="spg" hidden></canvas>
  <p class="legenda" id="legenda" hidden></p>

  <section id="risultati" class="pannello" hidden>
    <h2>Misure del tratto <span id="tratto-tempi"></span></h2>
    <p id="avviso-acuto" class="avviso" hidden></p>
    <table id="tabella"><thead><tr><th>Misura</th><th>PRE</th><th>POST</th><th>Differenza</th><th></th></tr></thead><tbody></tbody></table>
  </section>
</main>

<footer class="piede">
  <p id="didattico"></p>
  <p><a href="fonti.html" id="link-fonti"></a> · <a href="https://github.com/castelsim/voce" id="link-sorgente"></a></p>
</footer>
</body>
</html>
```

- [ ] **Step 5: stile.css**

```css
:root { --acc: #8a3b12; --pre: #1f6fb4; --post: #d2551e; --fondo: #faf7f2; --testo: #1d1d1d; }
* { box-sizing: border-box }
body { margin: 0; font: 17px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--testo); background: var(--fondo) }
.testa, main, .piede { max-width: 1400px; margin: 0 auto; padding: 16px 24px }
h1 { color: var(--acc); margin: 0 }
.sotto { margin: 4px 0 0; color: #555 }
.utente { float: right; margin-top: -48px }
.pannello { background: #fff; border: 1px solid #e3ddd3; border-radius: 10px; padding: 16px; margin: 12px auto; max-width: 1400px }
button { font: inherit; border: 2px solid var(--acc); color: var(--acc); background: #fff; border-radius: 8px; padding: 8px 14px; cursor: pointer; min-height: 44px }
button.grande { font-weight: 700 } button.evidenza { background: var(--acc); color: #fff } button.piccolo { min-height: 32px; padding: 2px 10px; font-size: 14px }
.carica { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.zona { display: block; border: 2px dashed #c9bfae; border-radius: 10px; padding: 22px; text-align: center; cursor: pointer; background: #fff }
.zona.sopra { border-color: var(--acc); background: #fff6ee } .zona input { display: none }
.comandi { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0 }
.tempo { margin-left: auto; font-weight: 700; font-variant-numeric: tabular-nums }
.aiuto { width: 100%; margin: 0; color: #666; font-size: 14px }
.spg { display: block; width: 100%; height: 300px; background: #fff; border-radius: 8px; margin: 8px 0; cursor: crosshair }
.legenda { color: #555; font-size: 14px } .stato { font-weight: 600 } .avviso { color: #8a3b12 }
table { border-collapse: collapse; width: 100% } th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee }
td.num { text-align: right; font-variant-numeric: tabular-nums }
.piede { color: #666; font-size: 14px }
@media (max-width: 700px) { .carica { grid-template-columns: 1fr } }
```

- [ ] **Step 6: app.js** (collegamento dei moduli; ogni funzione corta)

```js
// web/app.js — collega accesso, file, motore, vista, ascolto, misure ed esportazione
import { T } from './testi/it.mjs'
import { avviaAccesso, entraConGoogle, esci, provaSenzaAccesso } from './accesso/accesso.mjs'
import { classificaFile, scegliModo, wavPcm24, avvisoDurata } from './audio/file.mjs'
import { creaMotore } from './motore/client.mjs'
import { disegna, margini } from './vista/spettrogramma.mjs'
import { formatoTempo, xInTempo, zoom, ordinaSelezione, limitaSelezione } from './vista/scala.mjs'
import { creaAscolto } from './ascolto/ab.mjs'
import { REGISTRO } from './misure/registro.mjs'
import { righeTabella, motivoErrore } from './misura/tabella.mjs'
import { componiFigura, nomeFigura, scarica } from './esporta/png.mjs'

const $ = (id) => document.getElementById(id)
const PRAAT_VERSIONE = '6.4.62'
const S = { lati: {}, vista: null, selezione: null, cursore: null, mostra: { f0: true, formanti: false, fascia: false }, motore: null, ascolto: null, durata: 0 }

function testi () {
  $('sottotitolo').textContent = T.sottotitolo; $('perche').textContent = T.perche; $('entra').textContent = T.entra
  $('esci').textContent = T.esci; $('testo-pre').textContent = T.caricaPre; $('testo-post').textContent = T.caricaPost
  $('testo-stereo').textContent = T.stereo; $('stereo-si').textContent = T.stereoSi; $('stereo-no').textContent = T.stereoNo
  $('play').textContent = T.play; $('pre-poi-post').textContent = T.prePoiPost; $('togli').textContent = T.togli
  $('misura').textContent = T.misura; $('esporta').textContent = T.esporta; $('t-pareggio').textContent = T.pareggio
  $('t-f0').textContent = T.f0; $('t-formanti').textContent = T.formanti; $('t-fascia').textContent = T.fascia
  $('aiuto-comandi').textContent = T.aiutoComandi; $('legenda').textContent = T.legenda; $('didattico').textContent = T.didattico
  $('link-fonti').textContent = T.fonti; $('link-sorgente').textContent = T.sorgente
}

const stato = (msg) => { $('stato').textContent = msg }
const aggiornaAB = () => { $('ab').textContent = T.ab + S.ascolto.sceltoÈ() + ' ⇄' }

// un solo decodificatore (i browser limitano il numero di AudioContext); risultato a 44,1 kHz, solo per ascoltare
let decodificatore = null
async function leggiFile (file) {
  const tipo = classificaFile(file.name, file.type)
  if (tipo === 'non_audio') return { errore: 'formato' }
  const byte = await file.arrayBuffer()
  decodificatore ??= new OfflineAudioContext(1, 1, 44100)
  let audioBuffer
  try { audioBuffer = await decodificatore.decodeAudioData(byte.slice(0)) } catch (_) { return { errore: 'formato' } }
  const perPraat = tipo === 'praat' ? byte : null
  return { nome: file.name, byte: perPraat, audioBuffer, canali: audioBuffer.numberOfChannels }
}

function canaleComeWav (audioBuffer, canale) {
  return wavPcm24(audioBuffer.getChannelData(canale), audioBuffer.sampleRate)
}

async function preparaLato (lato, { nome, byte, audioBuffer }, canale) {
  const audio = byte || canaleComeWav(audioBuffer, Math.max(0, canale - 1))
  const mono = canale > 0 ? monoDa(audioBuffer, canale - 1) : audioBuffer
  S.lati[lato] = { nome, audio, canale: byte ? canale : 1, durata: audioBuffer.duration, tracce: null }
  await S.ascolto.carica(lato, mono)
}

function monoDa (audioBuffer, k) {
  const b = new AudioBuffer({ length: audioBuffer.length, numberOfChannels: 1, sampleRate: audioBuffer.sampleRate })
  b.copyToChannel(audioBuffer.getChannelData(k), 0); return b
}

async function calcolaTracce () {
  if (avvisoDurata(Math.max(...Object.values(S.lati).map(l => l.durata))) === 'lungo') stato(T.lungo)
  for (const lato of ['PRE', 'POST']) {
    const l = S.lati[lato]; if (!l) continue
    stato(T.calcolo + ' (' + lato + ')')
    const r = await S.motore.tracce(l.audio, { nome: l.nome, canale: l.canale, tetto: 5500, f0max: 1100 })
    if (r.errore) { stato(lato + ': ' + motivoErrore(r.errore)); return }
    l.tracce = r
  }
  S.durata = Math.max(...Object.values(S.lati).map(l => l.durata))
  S.vista = { da: 0, a: S.durata }
  stato(''); mostraApp(); ridisegna()
}

function mostraApp () {
  for (const id of ['comandi', 'legenda']) $(id).hidden = false
  $('spg-pre').hidden = !S.lati.PRE; $('spg-post').hidden = !S.lati.POST
  aggiornaAB()
}

function ridisegna () {
  for (const [lato, id, colore] of [['PRE', 'spg-pre', 'var(--pre)'], ['POST', 'spg-post', 'var(--post)']]) {
    const l = S.lati[lato]; if (!l || !l.tracce) continue
    disegna($(id), l.tracce, { vista: S.vista, selezione: S.selezione, cursore: S.cursore, mostra: S.mostra, etichetta: lato, colore: lato === 'PRE' ? '#1f6fb4' : '#d2551e', scostamento: 0 })
  }
  $('tempo').textContent = formatoTempo(S.cursore ?? 0)
}

function tempoDaEvento (e) {
  const c = e.currentTarget, r = c.getBoundingClientRect(), m = margini()
  return xInTempo(e.clientX - r.left - m.s, S.vista, r.width - m.s - m.d)
}

function collegaSpettrogrammi () {
  for (const id of ['spg-pre', 'spg-post']) {
    const c = $(id); let partenza = null
    c.addEventListener('mousedown', (e) => { partenza = tempoDaEvento(e) })
    c.addEventListener('mousemove', (e) => { if (partenza === null) return; S.selezione = ordinaSelezione(partenza, tempoDaEvento(e)); ridisegna() })
    c.addEventListener('mouseup', (e) => {
      const t = tempoDaEvento(e)
      if (Math.abs(t - partenza) < 0.02) { S.selezione = null; S.cursore = t; S.ascolto.loop(null); if (S.ascolto.inRiproduzione()) S.ascolto.play(t) }
      else { S.selezione = ordinaSelezione(partenza, t); S.ascolto.loop(S.selezione) }
      partenza = null; ridisegna()
    })
    c.addEventListener('wheel', (e) => { e.preventDefault(); S.vista = zoom(S.vista, tempoDaEvento(e), e.deltaY > 0 ? 1.25 : 0.8, S.durata); ridisegna() }, { passive: false })
  }
}

async function misura () {
  if (!S.selezione) { stato('Seleziona prima un tratto trascinando sullo spettrogramma.'); return }
  stato('Praat sta misurando il tratto…')
  const ris = {}
  for (const lato of ['PRE', 'POST']) {
    const l = S.lati[lato]; if (!l) continue
    const sel = limitaSelezione(S.selezione, l.durata)
    ris[lato] = sel ? await S.motore.misura(l.audio, sel.da, sel.a, { nome: l.nome, canale: l.canale, tetto: 5500, f0max: 1100 }) : { errore: 'tratto_corto' }
  }
  mostraRisultati(ris); stato('')
  if (window.__voce) window.__voce.ultimiRisultati = ris
}

function mostraRisultati (ris) {
  $('risultati').hidden = false
  $('tratto-tempi').textContent = formatoTempo(S.selezione.da) + ' – ' + formatoTempo(S.selezione.a)
  const pre = ris.PRE && !ris.PRE.errore ? ris.PRE : null, post = ris.POST && !ris.POST.errore ? ris.POST : null
  const acuto = [pre, post].some(r => r && r.f0_mediana > 350)
  $('avviso-acuto').hidden = !acuto; $('avviso-acuto').textContent = T.acuto
  const corpo = $('tabella').querySelector('tbody'); corpo.textContent = ''
  for (const lato of ['PRE', 'POST']) if (ris[lato] && ris[lato].errore) {
    const tr = corpo.insertRow(); const td = tr.insertCell(); td.colSpan = 5; td.textContent = lato + ': ' + motivoErrore(ris[lato].errore)
  }
  for (const r of righeTabella(pre, post, REGISTRO)) {
    const tr = corpo.insertRow()
    tr.insertCell().textContent = r.etichetta + (r.unita ? ' (' + r.unita + ')' : '')
    for (const v of [r.pre, r.post, r.differenza]) { const td = tr.insertCell(); td.className = 'num'; td.textContent = v }
    const b = document.createElement('button'); b.className = 'piccolo'; b.textContent = '?'; b.title = r.aiuto
    b.addEventListener('click', () => alertNonBloccante(r.etichetta, r.aiuto)); tr.insertCell().append(b)
  }
}

function alertNonBloccante (titolo, testo) { stato(titolo + ': ' + testo) }

async function esporta () {
  const fig = componiFigura({ canvasPre: $('spg-pre'), canvasPost: $('spg-post'), titolo: (S.lati.PRE?.nome || '') + ' / ' + (S.lati.POST?.nome || ''), legenda: T.legenda, piede: T.piede(PRAAT_VERSIONE) })
  const blob = await scarica(fig, nomeFigura(S.lati.PRE?.nome || 'voce', S.selezione, 0))
  if (window.__voce) window.__voce.ultimaFigura = blob
}

function collegaComandi () {
  $('play').onclick = async () => { if (S.ascolto.inRiproduzione()) { S.ascolto.pausa(); $('play').textContent = T.play } else { await S.ascolto.play(S.cursore ?? 0); $('play').textContent = T.pausa } }
  $('ab').onclick = () => { S.ascolto.scambia(); aggiornaAB() }
  $('pre-poi-post').onclick = () => S.selezione && S.ascolto.prePoiPost(S.selezione)
  $('togli').onclick = () => { S.selezione = null; S.ascolto.loop(null); ridisegna() }
  $('misura').onclick = misura
  $('esporta').onclick = esporta
  $('c-pareggio').onchange = (e) => S.ascolto.pareggia(e.target.checked)
  for (const k of ['f0', 'formanti', 'fascia']) $('c-' + k).onchange = (e) => { S.mostra[k] = e.target.checked; ridisegna() }
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    if (e.code === 'Space') { e.preventDefault(); $('play').click() }
    if (e.key === 'x' || e.key === 'X') $('ab').click()
    if (e.key === 'Escape') $('togli').click()
  })
  const ciclo = () => { if (S.ascolto.inRiproduzione()) { S.cursore = S.ascolto.posizione(); ridisegna() } requestAnimationFrame(ciclo) }
  requestAnimationFrame(ciclo)
}

function collegaCaricamento () {
  const attesa = {}
  async function arrivato (lato, file) {
    stato('Lettura di ' + file.name + '…')
    const f = await leggiFile(file)
    if (f.errore) { stato(file.name + ': ' + motivoErrore(f.errore)); return }
    attesa[lato] = f
    $('testo-' + lato.toLowerCase()).textContent = lato + ': ' + file.name
    const presenti = Object.values(attesa)
    const modo = scegliModo(presenti)
    if (modo.modo === 'chiedi_stereo' && !attesa.POST) { $('domanda-stereo').hidden = false; S.stereoInAttesa = f; stato(''); return }
    if (modo.modo === 'coppia') { await preparaLato('PRE', attesa.PRE, 0); await preparaLato('POST', attesa.POST, 0); await calcolaTracce() }
    else stato('Ora carica anche l\'altra registrazione.')
  }
  for (const lato of ['PRE', 'POST']) {
    const zona = $('zona-' + lato.toLowerCase()), input = $('file-' + lato.toLowerCase())
    input.onchange = () => input.files[0] && arrivato(lato, input.files[0])
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('sopra') })
    zona.addEventListener('dragleave', () => zona.classList.remove('sopra'))
    zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('sopra'); e.dataTransfer.files[0] && arrivato(lato, e.dataTransfer.files[0]) })
  }
  $('stereo-si').onclick = async () => { $('domanda-stereo').hidden = true; const f = S.stereoInAttesa; await preparaLato('PRE', f, 1); await preparaLato('POST', f, 2); await calcolaTracce() }
  $('stereo-no').onclick = () => { $('domanda-stereo').hidden = true; stato('Ora carica anche la registrazione POST.') }
}

async function avvio () {
  testi()
  const acc = await avviaAccesso()
  if (acc.stato !== 'dentro') { $('schermo-accesso').hidden = false; $('entra').onclick = entraConGoogle; return }
  $('utente').hidden = !acc.utente || provaSenzaAccesso(location); $('email').textContent = acc.utente?.email || ''; $('esci').onclick = esci
  $('schermo-app').hidden = false
  S.ascolto = creaAscolto(); S.motore = creaMotore()
  stato(T.primaVolta); S.motore.pronto.then(() => stato(''))
  collegaCaricamento(); collegaSpettrogrammi(); collegaComandi()
  if (provaSenzaAccesso(location)) window.__voce = { S, seleziona: (da, a) => { S.selezione = { da, a }; ridisegna() }, misura, esporta }
}

avvio()
```

- [ ] **Step 7: fonti.html** — pagina statica con la stessa testata e CSS, contenente: cos'è lo strumento e il suo limite (didattico, non diagnostico, nessuna soglia sul canto); tabella «Misura · Comando Praat e parametri · Riferimento» copiata dalla specifica §4; versioni (Praat 6.4.62 via praat-wasm 6.4.6200; verifica di coincidenza con Praat 6.4.62 nativo (e Praat 7.0.02: vedi fonti)); citazioni della specifica §6; licenza GPL-3 e link al sorgente; privacy in tre righe (l'audio non lascia il computer; accesso Google; statistiche senza audio né nomi di file, dalla tappa 2).

- [ ] **Step 8: Commit**

```bash
git add web/index.html web/stile.css web/testi/it.mjs web/app.js web/esporta/png.mjs web/fonti.html test/png.test.mjs
git commit -m "Pagina di Analisi vocale: caricamento, spettrogrammi, A/B, misura del tratto, PNG, fonti"
```

---

### Task 13: Prova completa nel Chrome vero

**Files:**
- Create: `test/browser.test.mjs`

**Interfaces:**
- Consumes: hook `window.__voce` (solo con `?prova-senza-accesso=1` su 127.0.0.1); `eseguiNativo`, `fileDiProva`.

- [ ] **Step 1: test**

```js
// test/browser.test.mjs — la pagina vera in Chrome: carica, calcola, seleziona, misura, A/B, PNG
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import { fileDiProva } from './strumenti/file-prova.mjs'
import { eseguiNativo, nativoDisponibile, PRAAT } from './strumenti/praat-nativo.mjs'
import { leggiRisultati } from '../web/motore/script.mjs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.praat': 'text/plain' }
const files = fileDiProva()
const salta = !files || !existsSync(CHROME) || !nativoDisponibile()

test('giro completo nel browser', { skip: salta && 'SALTATO', timeout: 600000 }, async () => {
  const srv = createServer((req, res) => {
    const p = join('web', decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/voce\//, '/')))
    if (!existsSync(p)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TIPI[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p))
  }).listen(0, '127.0.0.1')
  const porta = srv.address().port
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    const errori = []; page.on('pageerror', e => errori.push(e.message)); page.on('console', m => m.type() === 'error' && errori.push(m.text()))
    await page.goto(`http://127.0.0.1:${porta}/voce/index.html?prova-senza-accesso=1`)
    const pre = files.find(f => f.includes('Fase1_') && f.endsWith('_PRE.wav'))
    const post = pre.replace('_PRE.wav', '_POST.wav')
    await (await page.$('#file-pre')).uploadFile(pre)
    await (await page.$('#file-post')).uploadFile(post)
    await page.waitForFunction(() => !document.getElementById('spg-post').hidden && window.__voce?.S.lati.POST?.tracce, { timeout: 300000 })
    // pixel non bianchi nello spettrogramma
    const scuri = await page.evaluate(() => { const c = document.getElementById('spg-pre'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n })
    assert.ok(scuri > 1000, 'spettrogramma vuoto')
    // misura del tratto «con una mano» (7,75-10,25 s nel file) e confronto con Praat 6.4.62 nativo
    await page.evaluate(() => window.__voce.seleziona(7.75, 10.25))
    await page.evaluate(() => window.__voce.misura())
    const ris = await page.evaluate(() => window.__voce.ultimiRisultati)
    const corpo = readFileSync('web/misure/tratto.praat', 'utf8')
    const n = leggiRisultati(eseguiNativo(corpo, { file$: pre, canale: 0, da: 7.75, a: 10.25, tetto: 5500, f0max: 1100 }))
    for (const k of ['f0_mediana', 'cpps', 'hnr', 'alpha', 'f1']) {
      assert.ok(Math.abs(ris.PRE[k] - n[k]) <= Math.max(0.005 * Math.abs(n[k]), 0.1), `${k}: browser ${ris.PRE[k]} nativo ${n[k]}`)
    }
    // A/B: la posizione resta la stessa
    await page.click('#play'); await new Promise(r => setTimeout(r, 1200))
    const p1 = await page.evaluate(() => window.__voce.S.ascolto.posizione())
    await page.click('#ab')
    const p2 = await page.evaluate(() => window.__voce.S.ascolto.posizione())
    assert.ok(Math.abs(p2 - p1) < 0.05, `A/B ha spostato la posizione: ${p1} → ${p2}`)
    await page.click('#play')
    // PNG
    await page.evaluate(() => window.__voce.esporta())
    const dim = await page.evaluate(() => window.__voce.ultimaFigura?.size || 0)
    assert.ok(dim > 50000, 'PNG troppo piccolo')
    // file non audio: messaggio e nessun errore in pagina
    const dir = mkdtempSync(join(tmpdir(), 'voce-'))
    const finto = join(dir, 'non-audio.wav'); execFileSync('sh', ['-c', `printf '%%PDF-1.4' > "${finto}"`])
    await (await page.$('#file-post')).uploadFile(finto)
    await page.waitForFunction(() => /Formato non riconosciuto/.test(document.getElementById('stato').textContent), { timeout: 20000 })
    assert.deepEqual(errori, [], 'errori in console: ' + errori.join(' | '))
  } finally {
    await browser.close(); srv.close()
  }
})

test('PRE a 48 kHz e POST a 44,1 kHz con durate diverse', { skip: salta && 'SALTATO', timeout: 600000 }, async () => {
  // si crea con Praat nativo una copia a 48 kHz di 25 s del file PRE, fuori dal repository
  const dir = mkdtempSync(join(tmpdir(), 'voce-'))
  const pre = files.find(f => f.includes('Fase1_') && f.endsWith('_PRE.wav'))
  const out48 = join(dir, 'pre48.wav')
  eseguiNativo(`s = Read from file: file$\nselectObject: s\nt = Extract part: 0, 25, "rectangular", 1, "no"\nr = Resample: 48000, 50\nSave as WAV file: uscita$\n`, { file$: pre, uscita$: out48 })
  const srv = createServer((req, res) => {
    const p = join('web', decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/voce\//, '/')))
    if (!existsSync(p)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TIPI[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p))
  }).listen(0, '127.0.0.1')
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${srv.address().port}/voce/index.html?prova-senza-accesso=1`)
    await (await page.$('#file-pre')).uploadFile(out48)
    await (await page.$('#file-post')).uploadFile(pre.replace('_PRE.wav', '_POST.wav'))
    await page.waitForFunction(() => window.__voce?.S.lati.POST?.tracce, { timeout: 300000 })
    await page.evaluate(() => window.__voce.seleziona(24.0, 30.0))   // oltre la fine del PRE (25 s)
    await page.evaluate(() => window.__voce.misura())
    const ris = await page.evaluate(() => window.__voce.ultimiRisultati)
    assert.ok(ris.PRE && !ris.PRE.errore && ris.PRE.durata < 1.01, 'il PRE va misurato solo fino alla sua fine')
    assert.ok(ris.POST && !ris.POST.errore && Math.abs(ris.POST.durata - 6) < 0.01)
  } finally { await browser.close(); srv.close() }
})
```

- [ ] **Step 2: eseguire**

Run: `node --test test/browser.test.mjs`
Expected: PASS entrambi. Se fallisce il confronto numerico, prima di toccare le tolleranze controllare che il browser passi a Praat il file originale (canale 0, byte WAV originali).

- [ ] **Step 3: mutazione** — in `app.js` togliere `limitaSelezione` (usare `S.selezione` diretta) → il secondo test deve fallire (PRE durata 6 o errore); rimettere → verde.

- [ ] **Step 4: prova a mano (Simone)** — Chrome e Safari sul Mac, `http://127.0.0.1:8790/web/index.html?prova-senza-accesso=1`: ascolto A/B in cuffia (nessuno scatto nello scambio), «PRE poi POST», rotella per lo zoom, PNG aperto in Anteprima leggibile. Annotare l'esito nel README.

- [ ] **Step 5: Commit**

```bash
git add test/browser.test.mjs
git commit -m "Prova completa in Chrome: misure uguali a Praat nativo, A/B senza salti, PNG, file non audio, frequenze diverse"
```

---

### Task 14: Pubblicazione su stageplot.it/voce/

**Files:**
- Create: `strumenti/pubblica-su-stageplot.mjs`, `test/pubblica.test.mjs`
- Modify (repository StagePlot, in un suo worktree): `voce/**` (nuova cartella)

**Interfaces:**
- Produces: `node strumenti/pubblica-su-stageplot.mjs <cartella-radice-stageplot>` copia `web/` in `<radice>/voce/` (la cartella `voce/` diventa uguale a `web/`, file tolti compresi), aggiunge `LICENSE`, `NOTICE`, `SORGENTE.txt` (link a https://github.com/castelsim/voce e commit corrente), e rifiuta di copiare se `npm test` non è verde o se `web/accesso/config.mjs` contiene `<<`.

- [ ] **Step 1: test (fallisce)**

```js
// test/pubblica.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('pubblica copia web/ in voce/ con licenza e sorgente, e toglie i file vecchi', () => {
  const radice = mkdtempSync(join(tmpdir(), 'sp-'))
  mkdirSync(join(radice, 'voce')); writeFileSync(join(radice, 'voce', 'vecchio.txt'), 'x')
  execFileSync('node', ['strumenti/pubblica-su-stageplot.mjs', radice, '--senza-test'])
  assert.ok(existsSync(join(radice, 'voce', 'index.html')))
  assert.ok(existsSync(join(radice, 'voce', 'vendor', 'praat-wasm', 'dist', 'praat.wasm')))
  assert.match(readFileSync(join(radice, 'voce', 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE/)
  assert.match(readFileSync(join(radice, 'voce', 'SORGENTE.txt'), 'utf8'), /github\.com\/castelsim\/voce/)
  assert.ok(!existsSync(join(radice, 'voce', 'vecchio.txt')))
})
```

- [ ] **Step 2: pubblica-su-stageplot.mjs**

```js
// strumenti/pubblica-su-stageplot.mjs — copia la build in <stageplot>/voce/ (GPL: licenza e link al sorgente)
import { cpSync, rmSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [radice, opz] = process.argv.slice(2)
if (!radice || !existsSync(radice)) { console.error('Uso: node strumenti/pubblica-su-stageplot.mjs <radice-stageplot>'); process.exit(1) }
if (readFileSync('web/accesso/config.mjs', 'utf8').includes('<<')) { console.error('config.mjs ha ancora il segnaposto della chiave'); process.exit(1) }
if (opz !== '--senza-test') execFileSync('npm', ['test'], { stdio: 'inherit' })
const dest = join(radice, 'voce')
rmSync(dest, { recursive: true, force: true })
cpSync('web', dest, { recursive: true })
copyFileSync('LICENSE', join(dest, 'LICENSE')); copyFileSync('NOTICE', join(dest, 'NOTICE'))
let commit = 'sconosciuto'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch (_) {}
writeFileSync(join(dest, 'SORGENTE.txt'), `Analisi vocale — GPL-3.0-or-later\nCodice sorgente completo: https://github.com/castelsim/voce\nCommit: ${commit}\n`)
console.log('copiato in', dest)
```

Run: `node --test test/pubblica.test.mjs` → Expected: PASS.

- [ ] **Step 3: pubblicare il repository della voce** — `git push origin <ramo>`; aprire una PR **bozza** su `castelsim/voce` (il ramo `main` remoto lo crea Simone con il merge).

- [ ] **Step 4: PR su StagePlot** (regole di `stageplot/AGENTS.md`):

```bash
SP=$STAGEPLOT   # cartella del checkout di StagePlot
git -C "$SP" fetch origin
git -C "$SP" worktree add "$SP/.claude/worktrees/voce-tappa1" -b voce-tappa1 origin/main
# dalla radice del worktree della voce (dove si sta eseguendo il piano):
node strumenti/pubblica-su-stageplot.mjs "$SP/.claude/worktrees/voce-tappa1"
cd "$SP/.claude/worktrees/voce-tappa1"
git add voce && git commit -m "voce/: Analisi vocale, tappa 1 (programma separato GPL-3, sorgente su github.com/castelsim/voce)"
git push -u origin voce-tappa1 && gh pr create --draft --title "Analisi vocale su stageplot.it/voce/ (tappa 1)" --body "Programma separato GPL-3 copiato da castelsim/voce. Nessun codice di StagePlot coinvolto. Verifiche: npm test e test/browser.test.mjs verdi nel repository della voce."
```

Controllare prima del commit: `voce/` non contiene audio (`find voce -name "*.wav" | wc -l` → 0) e `robots.txt`/`sitemap.xml` di StagePlot non cambiano (la pagina è `noindex`).

- [ ] **Step 5: dopo il merge di Simone** — verificare in produzione: `curl -sI https://stageplot.it/voce/vendor/praat-wasm/dist/praat.wasm | grep -i content-type` → `application/wasm`; aprire https://stageplot.it/voce/ in Chrome, accedere con Google, caricare due file, misurare un tratto. Si dice «pubblicato» solo dopo questa verifica.

- [ ] **Step 6: Commit** (nel repository della voce)

```bash
git add strumenti/pubblica-su-stageplot.mjs test/pubblica.test.mjs
git commit -m "Pubblicazione in stageplot/voce/ con licenza GPL e link al sorgente"
```

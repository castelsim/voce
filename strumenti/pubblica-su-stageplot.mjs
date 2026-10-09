// strumenti/pubblica-su-stageplot.mjs — copia la build in <stageplot>/voce/ (GPL: licenza e link al sorgente)
// Uso: node strumenti/pubblica-su-stageplot.mjs <radice-stageplot> [--senza-test] [--consenti-modifiche] [--sorgente <cartella>] [--licenza <file>]
// --senza-test e --consenti-modifiche servono solo ai test (saltano npm test, albero pulito e commit già pubblicato).
// Tutti i controlli avvengono prima di toccare il disco (salvo il ripristino di una voce/ lasciata da uno scambio interrotto);
// la nuova voce/ si costruisce in .voce-nuova e si scambia con rename.
import { cpSync, rmSync, copyFileSync, writeFileSync, readFileSync, existsSync, readdirSync, realpathSync, statSync, lstatSync, renameSync } from 'node:fs'
import { join, extname, resolve, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const opzione = (nome, predefinito) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : predefinito }
const senzaTest = args.includes('--senza-test')
const consentiModifiche = args.includes('--consenti-modifiche')
const sorgente = opzione('--sorgente', 'web')
const licenza = opzione('--licenza', 'LICENSE')
const iValori = ['--sorgente', '--licenza'].map(n => args.indexOf(n) + 1).filter(i => i > 0)
const radiceArg = args.find((a, i) => !a.startsWith('--') && !iValori.includes(i))
const rifiuta = (m) => { console.error('Pubblicazione rifiutata: ' + m); process.exit(1) }

// 1. radice validata
if (!radiceArg) rifiuta('manca la radice di StagePlot (uso: node strumenti/pubblica-su-stageplot.mjs <radice-stageplot>)')
let radice
try { radice = realpathSync(resolve(radiceArg)) } catch (_) { rifiuta('la radice non esiste: ' + radiceArg) }
if (!statSync(radice).isDirectory()) rifiuta('la radice non è una cartella: ' + radice)
if (radice === resolve('/')) rifiuta('la radice è /')
if (radice === realpathSync(homedir())) rifiuta('la radice è la cartella home')
if (radice === realpathSync(process.cwd())) rifiuta('la radice è il repository della voce stesso')
if (!existsSync(join(radice, 'CNAME'))) rifiuta('la radice non contiene CNAME: non sembra il repository di StagePlot (' + radice + ')')
if (readFileSync(join(radice, 'CNAME'), 'utf8').trim() !== 'stageplot.it') rifiuta('il CNAME della radice non è stageplot.it: non è il repository di StagePlot (' + radice + ')')
const dest = join(radice, 'voce'), nuova = join(radice, '.voce-nuova'), vecchia = join(radice, '.voce-vecchia')
// uno scambio interrotto può aver lasciato solo .voce-vecchia: è l'unica copia pubblicata, si rimette al suo posto prima di tutto
if (!lstatSync(dest, { throwIfNoEntry: false }) && lstatSync(vecchia, { throwIfNoEntry: false })?.isDirectory()) {
  renameSync(vecchia, dest)
  console.error('ripristinata voce/ da .voce-vecchia (scambio interrotto in una pubblicazione precedente)')
}
const statoVoce = lstatSync(dest, { throwIfNoEntry: false })
if (statoVoce) {
  if (statoVoce.isSymbolicLink()) rifiuta('voce/ è un link simbolico')
  if (!statoVoce.isDirectory()) rifiuta('voce esiste e non è una cartella')
}

// 2. file necessari
if (!sorgente || !existsSync(sorgente) || !statSync(sorgente).isDirectory()) rifiuta('cartella sorgente inesistente: ' + sorgente)
if (!existsSync(licenza)) rifiuta('manca il file di licenza: ' + licenza)
if (!existsSync('NOTICE')) rifiuta('manca NOTICE')
if (!existsSync(join(sorgente, 'accesso', 'config.mjs'))) rifiuta('manca accesso/config.mjs nella build')

// 3-4. contenuti vietati in tutta la build
const AUDIO = new Set(['.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a', '.ogg'])
function voci (dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    // un link simbolico porterebbe nella build file di fuori (o un ciclo): si rifiuta
    if (e.isSymbolicLink()) rifiuta('link simbolico nella build: ' + join(dir, e.name))
    return e.isDirectory() ? [{ p: join(dir, e.name), nome: e.name, cartella: true }, ...voci(join(dir, e.name))] : [{ p: join(dir, e.name), nome: e.name, cartella: false }]
  })
}
const èBinario = (b) => b.subarray(0, 8000).includes(0)
for (const v of voci(sorgente)) {
  const est = extname(v.nome).toLowerCase()
  if (v.nome.startsWith('.')) rifiuta('nome nascosto nella build: ' + v.p)
  if (v.cartella && (v.nome === 'test' || v.nome === 'node_modules')) rifiuta('cartella di sviluppo nella build: ' + v.p)
  if (v.cartella) continue
  if (est === '.map') rifiuta('source map nella build: ' + v.p)
  if (AUDIO.has(est)) rifiuta('file audio nella build: ' + v.p)
  if (est === '.json') rifiuta('file json nella build (non devono mai uscire): ' + v.p)
  const dati = readFileSync(v.p)
  // nelle librerie di terzi (vendor/) `/Users/` compare negli esempi del manuale di Praat dentro il wasm e `<<` è l'operatore di
  // scorrimento dei bit: lì si cerca solo il percorso della home di chi pubblica
  const inVendor = relative(sorgente, v.p).split(sep)[0] === 'vendor'
  if (dati.indexOf(inVendor ? homedir() + '/' : '/Users/') >= 0) rifiuta('percorso locale in ' + v.p)
  if (!inVendor && !èBinario(dati) && dati.toString('utf8').includes('<<')) rifiuta('segnaposto «<<» in ' + v.p)
}

// 5. albero pulito
if (!(senzaTest && consentiModifiche)) {
  const sporco = execFileSync('git', ['status', '--porcelain', '--', 'web', 'LICENSE', 'NOTICE'], { encoding: 'utf8' }).trim()
  if (sporco) rifiuta('ci sono modifiche non salvate in web/: fai un commit prima di pubblicare')
}

// 6. sorgente pubblicato: la GPL chiede che il commit scritto in SORGENTE.txt sia raggiungibile da chi usa la pagina
if (!consentiModifiche) {
  let remoti = ''
  try { remoti = execFileSync('git', ['branch', '-r', '--contains', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch (_) {}
  if (!remoti) rifiuta('pubblica prima il sorgente: git push del ramo (il commit attuale non è in nessun ramo remoto)')
}

if (!senzaTest) execFileSync('npm', ['test'], { stdio: 'inherit' })

// costruzione in .voce-nuova, poi scambio
let commit = 'sconosciuto'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch (_) {}
let scambioIniziato = false
try {
  rmSync(nuova, { recursive: true, force: true }); rmSync(vecchia, { recursive: true, force: true })
  cpSync(sorgente, nuova, { recursive: true })
  copyFileSync(licenza, join(nuova, 'LICENSE')); copyFileSync('NOTICE', join(nuova, 'NOTICE'))
  writeFileSync(join(nuova, 'SORGENTE.txt'), `Analisi vocale — GPL-3.0-or-later\nCodice sorgente completo: https://github.com/castelsim/voce\nCommit: ${commit}\nVersione di Praat: 6.4.62 (praat-wasm 6.4.6200)\n`)
  if (statoVoce) { scambioIniziato = true; renameSync(dest, vecchia) }
  renameSync(nuova, dest)
  rmSync(vecchia, { recursive: true, force: true })
} catch (e) {
  rmSync(nuova, { recursive: true, force: true })
  if (scambioIniziato && !existsSync(dest) && existsSync(vecchia)) renameSync(vecchia, dest)
  rifiuta('errore durante la copia: ' + e.message)
}
console.log('copiato in', dest)

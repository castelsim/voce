// test/strumenti/praat-nativo.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { componi } from '../../web/motore/script.mjs'

// Stessa versione di praat-wasm (6.4.62): così il test prova la fedeltà del motore, non le differenze fra versioni
export const PRAAT = process.env.PRAAT || join(homedir(), 'Applications/Praat 6.4.62.app/Contents/MacOS/Praat')
export const nativoDisponibile = () => existsSync(PRAAT)

// «7.0.02» da «Praat 7.0.02 (August 26 2026)»
export function versioneNativo () {
  try {
    const t = execFileSync(PRAAT, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return (t.match(/Praat (\d+\.\d+(?:\.\d+)?)/) || [])[1] || 'nativo'
  } catch (_) { return 'nativo' }
}

export function eseguiNativo (corpo, variabili) {
  const dir = mkdtempSync(join(tmpdir(), 'voce-'))
  try {
    const f = join(dir, 'script.praat')
    writeFileSync(f, componi(corpo, variabili))
    return execFileSync(PRAAT, ['--run', '--no-pref-files', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    // messaggio neutro: stderr e percorsi (anche dei file di prova) non vanno mai nei log
    throw new Error('Praat nativo ha restituito un errore (codice di uscita ' + (e && e.status != null ? e.status : 'sconosciuto') + ')')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

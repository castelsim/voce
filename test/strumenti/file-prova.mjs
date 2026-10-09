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

// test/coincidenza.test.mjs — gli stessi script in praat-wasm (6.4.62) e in Praat nativo danno gli stessi numeri.
// Riferimento predefinito: Praat 6.4.62 nativo (stessa versione del motore). Con PRAAT=… si confronta un'altra versione
// (per esempio Praat 7.0.02): il test stampa comunque lo scarto massimo per misura, anche quando fallisce.
// I file di prova sono privati: nei messaggi solo «file di prova n. i», mai percorsi né nomi.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leggiRisultati } from '../web/motore/script.mjs'
import { eseguiNativo, nativoDisponibile, versioneNativo } from './strumenti/praat-nativo.mjs'
import { eseguiWasm } from './strumenti/praat-wasm.mjs'
import { fileDiProva, tettoPer } from './strumenti/file-prova.mjs'

const CORPO = readFileSync('web/misure/tratto.praat', 'utf8')
// tolleranza assoluta per misura (oltre allo 0,5 % relativo)
const ASSOLUTA = { durata: 1e-6, f0_mediana: 0.5, f0_min: 0.5, f0_max: 0.5, f0_sd_cents: 0.5, scarto_cents: 0.5,
  cpps: 0.05, hnr: 0.05, jitter: 0.00002, shimmer: 0.0002, h1h2: 0.1, alpha: 0.05, pendenza: 0.05, spr: 0.05,
  f1: 2, f2: 2, f3: 3, f4: 3, livello: 0.05, livello_sd: 0.05 }
const TRATTI = [[2.0, 7.0], [7.75, 10.25]]

const files = fileDiProva()
const salta = !files || !nativoDisponibile()
const versione = salta ? '' : versioneNativo()

test(`tratto.praat: praat-wasm coincide con Praat ${versione || 'nativo'} sui file di prova`, { skip: salta && 'SALTATO: mancano file di prova o Praat nativo' }, async () => {
  const massimo = {} // per misura: { assoluto, relativo, dove }
  const fuori = []
  let casi = 0
  for (const [i, f] of files.entries()) {
    for (const [da, a] of TRATTI) {
      const dove = `file di prova n. ${i + 1}, ${da}-${a} s`
      const v = { file$: f, canale: 1, da, a, tetto: tettoPer(f), f0max: 1100 }
      const n = leggiRisultati(eseguiNativo(CORPO, v))
      const w = leggiRisultati(await eseguiWasm(CORPO, v, f))
      casi++
      for (const k of Object.keys(ASSOLUTA)) {
        if (!(k in n)) { fuori.push(`${dove} ${k}: manca nell'output nativo`); continue }
        if (n[k] === null || w[k] === null) {
          if (n[k] !== w[k]) fuori.push(`${dove} ${k}: wasm ${w[k]} nativo ${n[k]}`)
          continue
        }
        const assoluto = Math.abs(w[k] - n[k])
        const relativo = n[k] !== 0 ? assoluto / Math.abs(n[k]) : (assoluto === 0 ? 0 : Infinity)
        if (!massimo[k] || relativo > massimo[k].relativo) massimo[k] = { assoluto, relativo, dove }
        if (!(assoluto <= Math.max(0.005 * Math.abs(n[k]), ASSOLUTA[k]))) fuori.push(`${dove} ${k}: wasm ${w[k]} nativo ${n[k]}`)
      }
    }
  }
  console.log(`CONFRONTO praat-wasm 6.4.62 ↔ Praat ${versione}: ${files.length} file di prova × ${TRATTI.length} tratti = ${casi} casi`)
  for (const k of Object.keys(ASSOLUTA)) {
    const m = massimo[k]
    if (m) console.log(`SCARTO MASSIMO ${k}: ${(m.relativo * 100).toFixed(3)} % (assoluto ${m.assoluto.toPrecision(3)}; ${m.dove})`)
  }
  console.log(`FUORI TOLLERANZA: ${fuori.length}`)
  assert.deepEqual(fuori, [], 'misure fuori tolleranza:\n' + fuori.join('\n'))
})

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

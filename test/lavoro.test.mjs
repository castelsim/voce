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
const silenzio = (praat) => {
  praat.run('Create Sound from formula: "s", 1, 0, 1, 44100, "0"\nSave as WAV file: "/tmp/silenzio.wav"\nselect all\nRemove\n')
  return praat.getFile('/tmp/silenzio.wav').slice().buffer
}
const base = { nome: 'x.wav', canale: 1, tetto: 5500, f0max: 1100 }

const pulito = (praat) => {
  assert.equal(praat.FS.analyzePath('/tmp/ingresso.wav').exists, false)
  assert.deepEqual(praat.FS.readdir('/tmp/out').filter(n => n !== '.' && n !== '..'), [])
}
const oggetti = (praat) => {
  const info = praat.run('select all\nn = numberOfSelected ()\nwriteInfoLine: n')
  return Number(String(info).trim())
}

test('tratto troppo corto → errore tratto_corto, nessuna eccezione', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'misura', audio: tono(praat), da: 0.5, a: 0.55 })
  assert.deepEqual(r, { errore: 'tratto_corto' })
})

test('tratto esattamente al limite (0,1 s) non è troppo corto', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'misura', audio: tono(praat), da: 0.5, a: 0.6 })
  assert.notEqual(r.errore, 'tratto_corto')
})

test('da/a mancanti o invertiti → tratto_corto', async () => {
  const praat = await createPraatWasm()
  const audio = tono(praat)
  assert.deepEqual(await gestisci(praat, corpi, { ...base, tipo: 'misura', audio }), { errore: 'tratto_corto' })
  assert.deepEqual(await gestisci(praat, corpi, { ...base, tipo: 'misura', audio, da: 1, a: 0.5 }), { errore: 'tratto_corto' })
})

test('tipo non valido → errore praat', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'altro', audio: tono(praat) })
  assert.deepEqual(r, { errore: 'praat', dettaglio: 'tipo non valido' })
})

test('richiesta nulla → errore, nessuna eccezione', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, null)
  assert.equal(r.errore, 'praat')
  assert.ok(r.dettaglio)
})

test('audio mancante → errore formato', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'tracce' })
  assert.deepEqual(r, { errore: 'formato' })
})

test('file non audio → errore formato, e il file system resta pulito', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'tracce', audio: new TextEncoder().encode('%PDF-1.4').buffer, canale: 0 })
  assert.equal(r.errore, 'formato')
  pulito(praat)
})

test('errore di Praat con «file» nel messaggio → praat, non formato', async () => {
  const finto = {
    writeFile () {},
    run () { throw new Error('Save as headerless spreadsheet file: "x" not performed') },
    removeAll () {},
    FS: { unlink () {}, mkdirTree () {} }
  }
  const r = await gestisci(finto, corpi, { ...base, tipo: 'tracce', audio: new ArrayBuffer(8) })
  assert.equal(r.errore, 'praat')
})

test('scrittura dell\'audio che fallisce → praat', async () => {
  const finto = { writeFile () { throw new Error('disco pieno') }, run () {}, removeAll () {}, FS: { unlink () {} } }
  const r = await gestisci(finto, corpi, { ...base, tipo: 'tracce', audio: new ArrayBuffer(8) })
  assert.equal(r.errore, 'praat')
})

test('misura su un tono puro a 220 Hz', async () => {
  const praat = await createPraatWasm()
  const fasi = []
  const r = await gestisci(praat, corpi, { ...base, tipo: 'misura', audio: tono(praat), da: 0.2, a: 1.8 }, f => fasi.push(f))
  assert.ok(Math.abs(r.f0_mediana - 220) < 0.5)
  assert.deepEqual(fasi, ['misura'])
})

test('un avanzamento che lancia non interrompe il lavoro', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'misura', audio: tono(praat), da: 0.2, a: 1.8 }, () => { throw new Error('x') })
  assert.ok(Math.abs(r.f0_mediana - 220) < 0.5)
})

test('pulizia: dopo le tracce il file system virtuale è vuoto e Praat non ha oggetti', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { ...base, tipo: 'tracce', audio: tono(praat) })
  assert.equal(r.errore, undefined)
  pulito(praat)
  assert.equal(oggetti(praat), 0)
})

// Comportamento osservato con Praat 6.4.62: sul silenzio lo script fallisce (MelderError)
// e gestisci restituisce un errore 'praat', senza eccezioni.
test('tratto di silenzio: errore praat con dettaglio, risorse liberate', async () => {
  const praat = await createPraatWasm()
  try { praat.FS.mkdirTree('/tmp/out') } catch (_) {}
  const r = await gestisci(praat, corpi, { ...base, tipo: 'misura', audio: silenzio(praat), da: 0.2, a: 0.8 })
  assert.equal(r.errore, 'praat')
  assert.ok(r.dettaglio)
  pulito(praat)
  assert.equal(oggetti(praat), 0)
})

const files = fileDiProva()
test('tracce su file reale: forma dell\'oggetto', { skip: !files && 'SALTATO' }, async () => {
  const praat = await createPraatWasm()
  const b = readFileSync(files[0])
  const r = await gestisci(praat, corpi, { ...base, tipo: 'tracce', audio: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), nome: 'a.wav' })
  assert.ok(r.spettro instanceof Uint8Array && r.spettro.length === r.nT * r.nF)
})

test('conversione tipo wav: un AIFF scritto da Praat diventa un WAV con la stessa durata', async () => {
  const praat = await createPraatWasm()
  praat.run('Create Sound as pure tone: "t", 1, 0, 2, 44100, 220, 0.2, 0.01, 0.01\nSave as AIFF file: "/tmp/tono.aiff"\nselect all\nRemove\n')
  const aiff = praat.getFile('/tmp/tono.aiff').slice().buffer
  const r = await gestisci(praat, corpi, { tipo: 'wav', nome: 'x.aiff', audio: aiff })
  assert.ok(r.wav instanceof ArrayBuffer)
  assert.equal(new TextDecoder().decode(new Uint8Array(r.wav, 0, 4)), 'RIFF')
  praat.writeFile('/tmp/riletto.wav', new Uint8Array(r.wav))
  const info = praat.run('s = Read from file: "/tmp/riletto.wav"\nd = Get total duration\nwriteInfoLine: d\nselect all\nRemove\n')
  assert.ok(Math.abs(Number(String(info).trim()) - 2) < 0.001)
  assert.equal(praat.FS.analyzePath('/tmp/conversione.wav').exists, false)
  assert.equal(praat.FS.analyzePath('/tmp/ingresso.aiff').exists, false)
})

test('conversione tipo wav: un PDF dà errore formato', async () => {
  const praat = await createPraatWasm()
  const r = await gestisci(praat, corpi, { tipo: 'wav', nome: 'x.pdf', audio: new TextEncoder().encode('%PDF-1.4').buffer })
  assert.equal(r.errore, 'formato')
  assert.equal(praat.FS.analyzePath('/tmp/ingresso.pdf').exists, false)
})

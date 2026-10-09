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

const infoCon = (f0x1) => 'durata\t0.05\nsp_nx\t3\nsp_ny\t1\nsp_x1\t0.01\nsp_dx\t0.01\nsp_y1\t10\nsp_dy\t20\n' +
  `f0_x1\t${f0x1}\nf0_dx\t0.01\nfo_x1\t0.01\nfo_dx\t0.01\nin_x1\t0.01\nin_dx\t0.01\n`
const grezzi = (f0) => ({
  spettro: '1\t1\t1\n', f0,
  f1: '1\t1\t1\n', f2: '1\t1\t1\n', f3: '1\t1\t1\n', f4: '1\t1\t1\n', intensita: '70\t70\t70\n'
})

test('costruisciTracce: formanti di un istante sonoro e formante a 0', () => {
  const t = costruisciTracce(infoCon(0.02), {
    spettro: '1\t1\t1\n', f0: '0\t220\t230\n',
    f1: '500\t600\t700\n', f2: '1500\t1600\t0\n', f3: '2500\t2600\t2700\n', f4: '3500\t3600\t3700\n',
    intensita: '70\t70\t70\n'
  })
  assert.equal(t.f0[2], 220)   // 0,03 s → fotogramma 1
  assert.equal(t.formanti[0][2], 700)
  assert.ok(Number.isNaN(t.formanti[1][2]))  // formante a 0 → NaN
  assert.equal(t.formanti[2][2], 2700)
  assert.equal(t.formanti[3][2], 3700)
})

test('costruisciTracce: scarto non intero fra le griglie (arrotondamento al più vicino)', () => {
  // f0_x1 = 0,016: istanti a 0,4 e 1,4 passi → fotogrammi 0 e 1 (ceil darebbe 1 e 2)
  let t = costruisciTracce(infoCon(0.016), grezzi('100\t200\t300\n'))
  assert.equal(t.f0[1], 100); assert.equal(t.f0[2], 200)
  // f0_x1 = 0,014: istanti a 0,6 e 1,6 passi → fotogrammi 1 e 2 (floor darebbe 0 e 1)
  t = costruisciTracce(infoCon(0.014), grezzi('100\t200\t300\n'))
  assert.equal(t.f0[1], 200); assert.equal(t.f0[2], 300)
})

test('costruisciTracce: parità esatta (0,5 passi) sceglie il fotogramma successivo', () => {
  const t = costruisciTracce(infoCon(0.015), grezzi('100\t200\t300\n'))
  assert.equal(t.f0[1], 200)   // 0,5 passi → fotogramma 1, non 0
  assert.equal(t.f0[2], 300)   // 1,5 passi → fotogramma 2, non 1
  // f0_x1 = 0,025: in virgola mobile (0,03−0,025)/0,01 = 0,4999999999999997 e (0,02−0,025)/0,01 = −0,5000000000000001:
  // la parità deve comunque dare i fotogrammi 1 e 0
  const u = costruisciTracce(infoCon(0.025), grezzi('100\t200\t300\n'))
  assert.equal(u.f0[2], 200)
  assert.equal(u.f0[1], 100)
})

test('costruisciTracce: scala dello spettrogramma', () => {
  // valori: 100 → 20 dB (massimo), 1 → 0 dB, 1e-10 → −100 dB
  // 0 dB: (0 − 20 + 70) / 70 · 255 = 182,14 → 182 ; −100 dB: sotto −50 dB → 0
  const t = costruisciTracce(infoCon(0.02), { ...grezzi('0\t0\t0\n'), spettro: '100\t1\t1e-10\n' })
  assert.equal(t.spettro[0], 255)
  assert.equal(t.spettro[1], 182)
  assert.equal(t.spettro[2], 0)
  assert.ok(Math.abs(t.dbMax - 20) < 1e-5)
})

test('costruisciTracce: registrazione silenziosa → spettrogramma bianco e segnalata', () => {
  const t = costruisciTracce(infoCon(0.02), { ...grezzi('0\t0\t0\n'), spettro: '0\t0\t0\n' })
  assert.equal(t.silenzioso, true)
  assert.deepEqual(Array.from(t.spettro), [0, 0, 0])
  const u = costruisciTracce(infoCon(0.02), { ...grezzi('0\t0\t0\n'), spettro: '1e-14\t0\t0\n' }) // −140 dB: debole ma non silenzio
  assert.equal(u.silenzioso, false)
  assert.equal(u.spettro[0], 255)
})

test('costruisciTracce: dimensioni incoerenti del spettrogramma', () => {
  assert.throws(() => costruisciTracce(infoCon(0.02), { ...grezzi('0\t0\t0\n'), spettro: '1\t1\n' }), /dimensioni incoerenti/)
})

const files = fileDiProva()
test('tracce.praat in praat-wasm su un file reale', { skip: !files && 'SALTATO: mancano file di prova' }, async () => {
  const praat = await createPraatWasm()
  try {
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
    assert.ok(Array.from(t.formanti[0]).some(v => Number.isFinite(v) && v > 200 && v < 1500), 'nessun F1 plausibile')
    assert.ok(Array.from(t.intensita).some(Number.isFinite), 'intensità senza valori finiti')
    assert.ok(t.spettro.some(v => v === 255), 'spettrogramma senza massimo')
    assert.ok(t.spettro.some(v => v !== 0 && v !== 255), 'spettrogramma senza valori intermedi')
  } finally {
    for (const p of ['/tmp/in.wav', ...['spettro', 'f0', 'f1', 'f2', 'f3', 'f4', 'intensita'].map(n => '/tmp/out/' + n + '.txt')]) {
      try { praat.FS.unlink(p) } catch { /* file assente */ }
    }
  }
})

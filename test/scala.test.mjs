import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatoTempo, tempoInX, xInTempo, zoom, limitaSelezione, ordinaSelezione, scalaF0, taccheF0 } from '../web/vista/scala.mjs'

test('formatoTempo', () => {
  assert.equal(formatoTempo(192.5), '3\'12,5"')
  assert.equal(formatoTempo(5.04), '0\'05,0"')
  assert.equal(formatoTempo(59.96), '1\'00,0"')
})
test('tempo ↔ pixel', () => {
  const v = { da: 10, a: 20 }
  assert.equal(tempoInX(15, v, 1000), 500)
  assert.equal(xInTempo(250, v, 1000), 12.5)
})
test('zoom a punto fisso, limitato dentro il file', () => {
  assert.deepEqual(zoom({ da: 0, a: 30 }, 1, 0.5, 30), { da: 0.5, a: 15.5 })
  assert.deepEqual(zoom({ da: 0, a: 30 }, 29, 0.5, 30), { da: 14.5, a: 29.5 })
  assert.deepEqual(zoom({ da: 10, a: 12 }, 11, 4, 30), { da: 7, a: 15 })
  assert.deepEqual(zoom({ da: 0, a: 10 }, 0, 2, 30), { da: 0, a: 20 })
  assert.deepEqual(zoom({ da: 20, a: 30 }, 30, 2, 30), { da: 10, a: 30 })
  assert.deepEqual(zoom({ da: 0, a: 20 }, 10, 4, 30), { da: 0, a: 30 })
  const minimo = zoom({ da: 1, a: 1.1 }, 1.05, 0.1, 30)
  assert.ok(Math.abs((minimo.a - minimo.da) - 0.2) < 1e-9)
})
test('selezione limitata alla durata di ciascun file (PRE 40 s, POST 30 s)', () => {
  assert.deepEqual(limitaSelezione({ da: 28, a: 35 }, 30), { da: 28, a: 30 })
  assert.equal(limitaSelezione({ da: 31, a: 35 }, 30), null)
  assert.deepEqual(ordinaSelezione(5, 2), { da: 2, a: 5 })
})

const tracceF0 = (valori, t0 = 0.01, passo = 0.01) => ({ t0, passo, nT: valori.length, f0: Float32Array.from(valori) })

test('scalaF0: stessa scala per PRE e POST, solo la vista, margine di un semitono, multipli di 50', () => {
  const pre = tracceF0([NaN, 200, 210, 900, NaN])   // 900 Hz al fotogramma 3 (0,04 s)
  const post = tracceF0([300, 320, NaN])
  // vista 0-0,035 s: esclude il 900 del PRE; min 200/1,06 = 188,7 → 150; max 320·1,06 = 339,2 → 350
  assert.deepEqual(scalaF0([pre, post], { da: 0, a: 0.035 }), { min: 150, max: 350 })
  // tutta la durata: il 900 entra → 954 → 1000
  assert.deepEqual(scalaF0([pre, post], { da: 0, a: 1 }), { min: 150, max: 1000 })
  // un solo lato presente
  assert.deepEqual(scalaF0([null, post], { da: 0, a: 1 }), { min: 250, max: 350 })
})
test('scalaF0: ampiezza minima 100 Hz e niente voce nella vista', () => {
  // 220-226 Hz → 200-250, troppo stretta → 150-250
  assert.deepEqual(scalaF0([tracceF0([220, 226])], { da: 0, a: 1 }), { min: 150, max: 250 })
  // vicino a 0 non va sotto zero
  assert.deepEqual(scalaF0([tracceF0([20, 21])], { da: 0, a: 1 }), { min: 0, max: 100 })
  assert.equal(scalaF0([tracceF0([NaN, NaN])], { da: 0, a: 1 }), null)
  assert.equal(scalaF0([tracceF0([200, 210])], { da: 5, a: 6 }), null)
})
test('taccheF0: 100 Hz se ce ne stanno almeno 4, altrimenti 50 o 25', () => {
  assert.deepEqual(taccheF0({ min: 100, max: 400 }), [100, 200, 300, 400])
  assert.deepEqual(taccheF0({ min: 150, max: 350 }), [150, 200, 250, 300, 350])
  assert.deepEqual(taccheF0({ min: 150, max: 250 }), [150, 175, 200, 225, 250])
  assert.ok(taccheF0({ min: 0, max: 1200 }).length >= 4)
})

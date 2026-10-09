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

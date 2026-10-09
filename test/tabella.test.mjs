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
  assert.equal(chiavi.length, 20)
  for (const k of chiavi) assert.ok(REGISTRO.some(x => x.chiave === k), 'manca nel registro: ' + k)
})
test('differenza calcolata sui valori arrotondati', () => {
  const r = righeTabella({ cpps: 1.004 }, { cpps: 1.016 }, REGISTRO).find(x => x.chiave === 'cpps')
  assert.deepEqual([r.pre, r.post, r.differenza], ['1,00', '1,02', '+0,02'])
})
test('niente «−0» né «+0»', () => {
  const s = righeTabella({ scarto_cents: -0.04, cpps: 5.001 }, { scarto_cents: -0.04, cpps: 5.004 }, REGISTRO)
  const sc = s.find(x => x.chiave === 'scarto_cents'), cp = s.find(x => x.chiave === 'cpps')
  assert.deepEqual([sc.pre, sc.post, sc.differenza], ['0,0', '0,0', '0,0'])
  assert.deepEqual([cp.pre, cp.post, cp.differenza], ['5,00', '5,00', '0,00'])
})
test('valori negativi con meno tipografico', () => {
  const r = righeTabella({ pendenza: -12.34 }, { pendenza: -10.06 }, REGISTRO).find(x => x.chiave === 'pendenza')
  assert.deepEqual([r.pre, r.post, r.differenza], ['−12,3', '−10,1', '+2,2'])
})
test('arrotondamento simmetrico', () => {
  const r = righeTabella({ f1: -2.5 }, { f1: 2.5 }, REGISTRO).find(x => x.chiave === 'f1')
  assert.deepEqual([r.pre, r.post, r.differenza], ['−3', '3', '+6'])
})
test('non finiti dopo la scala', () => {
  const r = righeTabella({ jitter: 1e307 }, { jitter: 0.01 }, REGISTRO).find(x => x.chiave === 'jitter')
  assert.deepEqual([r.pre, r.post, r.differenza], ['—', '1,00', '—'])
  const g = righeTabella({ f1: 1e15 }, { f1: 1 }, REGISTRO).find(x => x.chiave === 'f1')
  assert.deepEqual([g.pre, g.differenza], ['—', '—'])
})
test('shimmer, pre/post mancanti, stringhe, differenza negativa che vale zero', () => {
  const sh = righeTabella({ shimmer: 0.0425 }, { shimmer: 0.0425 }, REGISTRO).find(x => x.chiave === 'shimmer')
  assert.equal(sh.pre, '4,25')
  for (const pre of [null, undefined]) {
    const r = righeTabella(pre, { cpps: 8 }, REGISTRO).find(x => x.chiave === 'cpps')
    assert.deepEqual([r.pre, r.post, r.differenza], ['—', '8,00', '—'])
  }
  const m = righeTabella({ cpps: 8 }, null, REGISTRO).find(x => x.chiave === 'cpps')
  assert.deepEqual([m.pre, m.post, m.differenza], ['8,00', '—', '—'])
  const s = righeTabella({ cpps: '7.6' }, { cpps: 8 }, REGISTRO).find(x => x.chiave === 'cpps')
  assert.deepEqual([s.pre, s.differenza], ['—', '—'])
  const z = righeTabella({ cpps: 5.004 }, { cpps: 5.001 }, REGISTRO).find(x => x.chiave === 'cpps')
  assert.equal(z.differenza, '0,00')
})
test('registro ben formato', () => {
  const viste = new Set()
  for (const m of REGISTRO) {
    for (const c of ['etichetta', 'unita', 'aiuto']) assert.ok(typeof m[c] === 'string' && m[c].length > 0, m.chiave + ' ' + c)
    assert.ok(Number.isInteger(m.decimali) && m.decimali >= 0, m.chiave)
    assert.ok(!viste.has(m.chiave), 'doppia: ' + m.chiave)
    viste.add(m.chiave)
  }
})
test('motivoErrore: oggetto { errore, dettaglio }', () => {
  const o = { errore: 'motore', dettaglio: '/percorso/interno.js' }
  assert.equal(motivoErrore(o), motivoErrore('motore'))
  assert.ok(!motivoErrore(o).includes('percorso'))
  assert.equal(motivoErrore({ dettaglio: 'x' }), motivoErrore('praat'))
})
test('motivoErrore: tutti i codici', () => {
  assert.match(motivoErrore('tratto_corto'), /0,1 s/)
  assert.match(motivoErrore('formato'), /file audio \(WAV, AIFF, FLAC, MP3, M4A, OGG…\)/)
  assert.match(motivoErrore('praat'), /Praat non è riuscito/)
  assert.match(motivoErrore('nessuno'), /uno o due file/)
  assert.match(motivoErrore('troppi'), /Al massimo due file/)
  assert.match(motivoErrore('motore'), /Ricarica la pagina/)
  assert.match(motivoErrore('preparazione'), /Non riesco a preparare Praat/)
  assert.match(motivoErrore({ errore: 'preparazione', dettaglio: 'wasm' }), /ricarica la pagina/)
  assert.match(motivoErrore('troppo_lungo'), /al massimo 30 minuti/)
  assert.match(motivoErrore('oltre_fine'), /oltre la fine di questa registrazione/)
  assert.equal(motivoErrore('boh'), motivoErrore('praat'))
  assert.equal(motivoErrore(undefined), motivoErrore('praat'))
})

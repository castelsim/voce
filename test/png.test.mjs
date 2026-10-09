// test/png.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomeFigura } from '../web/esporta/png.mjs'

test('nomeFigura pulisce il nome e mette i tempi', () => {
  assert.equal(nomeFigura('Fase1 Nome (PRE).wav', { da: 7.75, a: 10.25 }, 184.75), 'voce_Fase1-Nome-PRE_3m12-3m15.png')
  assert.equal(nomeFigura('x.wav', null, 0), 'voce_x.png')
})

test('nomeFigura toglie gli accenti', () => {
  assert.equal(nomeFigura('Allieva À · prova è', null), 'voce_Allieva-A-prova-e.png')
  assert.equal(nomeFigura('Allieva A · prova', { da: 1, a: 2 }), 'voce_Allieva-A-prova_0m01-0m02.png')
})

test('nomeFigura con titolo vuoto: voce, con o senza tempi', () => {
  assert.equal(nomeFigura('', null), 'voce.png')
  assert.equal(nomeFigura('  ·· ', null), 'voce.png')
  assert.equal(nomeFigura('', { da: 1, a: 2 }), 'voce_0m01-0m02.png')
})

test('nomeFigura: al massimo 60 caratteri di titolo', () => {
  assert.equal(nomeFigura('a'.repeat(100), null), 'voce_' + 'a'.repeat(60) + '.png')
})

test('piede della figura: CPPS Robust solo con le misure, tetto delle formanti solo per la voce maschile', async () => {
  const { T } = await import('../web/testi/it.mjs')
  assert.equal(T.piede('6.4.62'), 'Analisi con Praat 6.4.62 (Boersma & Weenink) nel browser · stageplot.it/voce')
  assert.equal(T.piede('6.4.62', { misure: true }), 'Analisi con Praat 6.4.62 (Boersma & Weenink) nel browser · CPPS Robust · stageplot.it/voce')
  assert.match(T.piede('6.4.62', { maschile: true }), / · formanti fino a 5000 Hz · /)
  assert.doesNotMatch(T.piede('6.4.62', { maschile: true }), /CPPS/)
})

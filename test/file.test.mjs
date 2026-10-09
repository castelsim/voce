// test/file.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificaFile, scegliModo, wavPcm24, guadagnoPareggiato, avvisoDurata, durataIntestazione, troppoLungo, TETTO_SECONDI, TETTO_BYTE } from '../web/audio/file.mjs'
import { createPraatWasm } from '../web/vendor/praat-wasm/js/praat-wasm.mjs'

test('classificaFile', () => {
  assert.equal(classificaFile('a.WAV', 'audio/wav'), 'praat')
  assert.equal(classificaFile('a.m4a', 'audio/mp4'), 'decodifica')
  assert.equal(classificaFile('tesi.pdf', 'application/pdf'), 'non_audio')
  assert.equal(classificaFile('take.1.final.WaV', ''), 'praat')
  assert.equal(classificaFile('a.flac', ''), 'praat')
  assert.equal(classificaFile('a.mp3', ''), 'praat')
  assert.equal(classificaFile('registrazione', 'audio/ogg'), 'decodifica')
  assert.equal(classificaFile('a.xyz', 'audio/x-qualcosa'), 'decodifica')
  assert.equal(classificaFile('a.txt', ''), 'non_audio')
  assert.equal(classificaFile('a.txt'), 'non_audio')
})

test('scegliModo', () => {
  assert.deepEqual(scegliModo([{ nome: 'a', canali: 1 }, { nome: 'b', canali: 1 }]), { modo: 'coppia' })
  assert.deepEqual(scegliModo([{ nome: 'lr', canali: 2 }]), { modo: 'chiedi_stereo' })
  assert.deepEqual(scegliModo([{ nome: 'm', canali: 1 }]), { modo: 'uno_solo' })
  assert.deepEqual(scegliModo([{}, {}, {}]), { errore: 'troppi' })
  assert.deepEqual(scegliModo([]), { errore: 'nessuno' })
  assert.deepEqual(scegliModo([{ nome: 'm', canali: 6 }]), { modo: 'uno_solo' })
})

test('wavPcm24: byte e intestazione', () => {
  const b = new Uint8Array(wavPcm24(Float32Array.from([0.5, -0.5, 1, -1, 0]), 48000))
  const testo = (o, n) => String.fromCharCode(...b.slice(o, o + n))
  const v = new DataView(b.buffer)
  assert.equal(testo(0, 4), 'RIFF'); assert.equal(testo(8, 4), 'WAVE')
  assert.equal(testo(12, 4), 'fmt '); assert.equal(testo(36, 4), 'data')
  assert.equal(v.getUint32(40, true), 15)
  assert.equal(b.length, 60)
  assert.equal(v.getUint32(4, true), 52)
  const hex = (o) => [...b.slice(o, o + 3)].map(x => x.toString(16).padStart(2, '0')).join(' ')
  assert.equal(hex(44), 'ff ff 3f'); assert.equal(hex(47), '01 00 c0'); assert.equal(hex(50), 'ff ff 7f')
  assert.equal(hex(53), '01 00 80'); assert.equal(hex(56), '00 00 00')
  assert.equal(b[59], 0)
})

test('wavPcm24 con byte di riempimento: Praat rilegge 5 campioni', async () => {
  const praat = await createPraatWasm()
  try {
    praat.writeFile('/tmp/y.wav', new Uint8Array(wavPcm24(Float32Array.from([0.5, -0.5, 1, -1, 0]), 48000)))
    const info = praat.run('s = Read from file: "/tmp/y.wav"\nn = Get number of samples\nwriteInfoLine: n\n')
    assert.equal(info.trim(), '5')
  } finally {
    if (praat.FS.analyzePath('/tmp/y.wav').exists) praat.FS.unlink('/tmp/y.wav')
  }
})

test('wavPcm24 è letto da Praat con durata e frequenza giuste', async () => {
  const sr = 48000, c = new Float32Array(sr).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / sr))
  const praat = await createPraatWasm()
  try {
    praat.writeFile('/tmp/x.wav', new Uint8Array(wavPcm24(c, sr)))
    const info = praat.run('s = Read from file: "/tmp/x.wav"\nd = Get total duration\nf = Get sampling frequency\nwriteInfoLine: d, " ", f\n')
    assert.equal(info.trim(), '1 48000')
  } finally {
    if (praat.FS.analyzePath('/tmp/x.wav').exists) praat.FS.unlink('/tmp/x.wav')
  }
})

test('FLAC scritto e riletto da Praat: durata e frequenza giuste', async () => {
  const praat = await createPraatWasm()
  try {
    praat.run('Create Sound as pure tone: "t", 1, 0, 1, 44100, 220, 0.2, 0.01, 0.01\nSave as FLAC file: "/tmp/x.flac"\nselect all\nRemove\n')
    const info = praat.run('s = Read from file: "/tmp/x.flac"\nd = Get total duration\nf = Get sampling frequency\nwriteInfoLine: d, " ", f\n')
    assert.equal(info.trim(), '1 44100')
  } finally {
    if (praat.FS.analyzePath('/tmp/x.flac').exists) praat.FS.unlink('/tmp/x.flac')
  }
})

test('guadagnoPareggiato porta la voce a −20 dBFS', () => {
  const sr = 1000, c = new Float32Array(sr * 2)
  for (let i = sr; i < 2 * sr; i++) c[i] = 0.01 * Math.sin(i)   // metà silenzio, metà voce piano
  const g = guadagnoPareggiato(c, sr)
  const rmsVoce = 0.01 / Math.SQRT2
  assert.ok(Math.abs(20 * Math.log10(rmsVoce * g) - (-20)) < 0.5)
})

test('guadagnoPareggiato non porta i picchi sopra −1 dBFS', () => {
  const sr = 1000, c = new Float32Array(sr * 2)
  for (let i = sr; i < 2 * sr; i++) c[i] = 0.01 * Math.sin(i)
  c[1500] = 0.9
  const g = guadagnoPareggiato(c, sr)
  assert.ok(g * c[1500] <= 10 ** (-1 / 20) + 1e-9)
})

test('guadagnoPareggiato: valori non finiti contano come 0', () => {
  const sr = 1000, c = new Float32Array(sr * 2)
  for (let i = sr; i < 2 * sr; i++) c[i] = 0.01 * Math.sin(i)
  c[1200] = Infinity; c[1300] = NaN
  const g = guadagnoPareggiato(c, sr)
  assert.ok(Number.isFinite(g) && g > 0)
})

test('guadagnoPareggiato: file più corto di 50 ms → 1', () => {
  assert.equal(guadagnoPareggiato(new Float32Array(40).fill(0.1), 1000), 1)
})

test('avvisoDurata', () => { assert.equal(avvisoDurata(599), null); assert.equal(avvisoDurata(601), 'lungo') })

test('durataIntestazione: WAV, AIFF e FLAC scritti da Praat, senza decodificare', async () => {
  const praat = await createPraatWasm()
  praat.run('Create Sound as pure tone: "t", 1, 0, 2.5, 22050, 440, 0.2, 0.01, 0.01\n' +
    'Save as WAV file: "/tmp/d.wav"\nSave as AIFF file: "/tmp/d.aiff"\nSave as FLAC file: "/tmp/d.flac"\nselect all\nRemove\n')
  for (const e of ['wav', 'aiff', 'flac']) {
    const u8 = praat.getFile('/tmp/d.' + e).slice()
    const d = durataIntestazione(u8.subarray(0, 65536), u8.length)
    assert.ok(Math.abs(d - 2.5) < 1e-6, e + ': ' + d)
    praat.FS.unlink('/tmp/d.' + e)
  }
})
test('durataIntestazione: WAV troncato vale per i byte presenti; formati sconosciuti → null', () => {
  const wav = new Uint8Array(wavPcm24(new Float32Array(44100), 44100)) // 1 s, 24 bit mono
  assert.ok(Math.abs(durataIntestazione(wav) - 1) < 1e-9)
  assert.ok(Math.abs(durataIntestazione(wav.subarray(0, 1000), 44 + 44100 * 3 / 2) - 0.5) < 1e-9)
  assert.equal(durataIntestazione(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0])), null) // MP3 con ID3
  assert.equal(durataIntestazione(new Uint8Array(0)), null)
})
test('troppoLungo: oltre 30 minuti o oltre 1 GB', () => {
  assert.equal(troppoLungo({ dimensione: 1000, durata: TETTO_SECONDI }), false)
  assert.equal(troppoLungo({ dimensione: 1000, durata: TETTO_SECONDI + 1 }), true)
  assert.equal(troppoLungo({ dimensione: TETTO_BYTE + 1, durata: null }), true)
  assert.equal(troppoLungo({ dimensione: 1000, durata: null }), false)
})

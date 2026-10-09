import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync, readFileSync } from 'node:fs'

test('praat-wasm è copiato in web/vendor con la sua licenza', () => {
  const wasm = 'web/vendor/praat-wasm/dist/praat.wasm'
  assert.ok(existsSync(wasm), 'manca ' + wasm)
  assert.ok(statSync(wasm).size > 20_000_000, 'praat.wasm troppo piccolo')
  assert.ok(existsSync('web/vendor/praat-wasm/js/praat-wasm.mjs'))
  assert.ok(existsSync('web/vendor/praat-wasm/LICENSE'))
  assert.match(readFileSync('web/vendor/praat-wasm/VERSIONE', 'utf8'), /^6\.4\.6200/)
})

test('supabase-js è copiato con la sua licenza', () => {
  assert.ok(existsSync('web/vendor/supabase/supabase.js'))
  assert.match(readFileSync('web/vendor/supabase/LICENSE', 'utf8'), /MIT/)
})

test('ogni libreria di terzi dichiara versione e provenienza (pacchetto npm, integrità, repository, commit)', () => {
  assert.equal(readFileSync('web/vendor/supabase/VERSIONE', 'utf8'), '2.110.0\n')
  const pw = readFileSync('web/vendor/praat-wasm/FONTE.txt', 'utf8')
  assert.match(pw, /registry\.npmjs\.org\/praat-wasm\/-\/praat-wasm-6\.4\.6200\.tgz/)
  assert.match(pw, /sha512-/)
  assert.match(pw, /github\.com\/reynoldsnlp\/praat\.github\.io/)
  assert.match(pw, /Commit: f2da7c33e1ae99cb134251cbd90b5e5fecf2e4cc/)
  const sb = readFileSync('web/vendor/supabase/FONTE.txt', 'utf8')
  assert.match(sb, /supabase-js-2\.110\.0\.tgz/)
  assert.match(sb, /github\.com\/supabase\/supabase-js/)
  assert.match(sb, /Licenza: MIT/)
})

test('createPraatWasm parte in Node ed esegue uno script', async () => {
  const { createPraatWasm } = await import('../web/vendor/praat-wasm/js/praat-wasm.mjs')
  const praat = await createPraatWasm()
  const info = praat.run('Create Sound as pure tone: "t", 1, 0, 0.5, 44100, 440, 0.2, 0.01, 0.01\nd = Get total duration\nwriteInfoLine: d\n')
  assert.equal(Number(info.trim()), 0.5)
})

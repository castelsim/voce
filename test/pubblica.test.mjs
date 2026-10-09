import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, symlinkSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT = 'strumenti/pubblica-su-stageplot.mjs'
const BASE = ['--senza-test', '--consenti-modifiche']

// radice finta di StagePlot (con CNAME) e una voce/ preesistente con un file noto
function radiceFinta () {
  const radice = mkdtempSync(join(tmpdir(), 'sp-'))
  writeFileSync(join(radice, 'CNAME'), 'stageplot.it\n') // con l'a capo finale, come lo scrive GitHub
  mkdirSync(join(radice, 'voce')); writeFileSync(join(radice, 'voce', 'vecchio.txt'), 'x')
  return radice
}
const lancia = (radice, ...extra) => spawnSync('node', [SCRIPT, radice, ...BASE, ...extra], { encoding: 'utf8' })
const pulita = (radice) => !existsSync(join(radice, '.voce-nuova')) && !existsSync(join(radice, '.voce-vecchia'))
const intatta = (radice) => readFileSync(join(radice, 'voce', 'vecchio.txt'), 'utf8') === 'x' && !existsSync(join(radice, 'voce', 'index.html')) && pulita(radice)

test('pubblica copia web/ in voce/ con licenza e sorgente, toglie i file vecchi, non lascia residui', () => {
  const radice = radiceFinta()
  try {
    const r = lancia(radice)
    assert.equal(r.status, 0, r.stderr)
    assert.ok(existsSync(join(radice, 'voce', 'index.html')))
    assert.ok(existsSync(join(radice, 'voce', 'vendor', 'praat-wasm', 'dist', 'praat.wasm')))
    assert.match(readFileSync(join(radice, 'voce', 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE/)
    assert.ok(existsSync(join(radice, 'voce', 'NOTICE')))
    const sorg = readFileSync(join(radice, 'voce', 'SORGENTE.txt'), 'utf8')
    assert.match(sorg, /github\.com\/castelsim\/voce/)
    assert.match(sorg, /6\.4\.62/)
    assert.ok(!existsSync(join(radice, 'voce', 'vecchio.txt')))
    assert.ok(pulita(radice))
  } finally { rmSync(radice, { recursive: true, force: true }) }
})

// copia temporanea di web/ modificata da `modifica`; il rifiuto deve lasciare la vecchia voce/ intatta
function rifiuto (nome, modifica, extra = []) {
  test('pubblica rifiuta: ' + nome, () => {
    const radice = radiceFinta()
    const sorgente = mkdtempSync(join(tmpdir(), 'web-'))
    try {
      cpSync('web', sorgente, { recursive: true })
      modifica(sorgente, radice)
      const r = lancia(radice, '--sorgente', sorgente, ...extra)
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /rifiutata/)
      assert.ok(intatta(radice))
    } finally { rmSync(radice, { recursive: true, force: true }); rmSync(sorgente, { recursive: true, force: true }) }
  })
}

rifiuto('file audio', (s) => writeFileSync(join(s, 'prova.wav'), 'RIFF'))
rifiuto('file json', (s) => writeFileSync(join(s, 'dati.json'), '{}'))
rifiuto('segnaposto << in un file della build', (s) => writeFileSync(join(s, 'accesso', 'config.mjs'), "export const K = '<<chiave>>'"))
rifiuto('/Users/ in un file di testo', (s) => writeFileSync(join(s, 'nota.txt'), 'in /Users/qualcuno/x'))
rifiuto('/Users/ in un file binario', (s) => writeFileSync(join(s, 'dati.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from('/Users/qualcuno'), Buffer.from([0])])))
rifiuto('file nascosto .DS_Store', (s) => writeFileSync(join(s, '.DS_Store'), 'x'))
rifiuto('source map', (s) => writeFileSync(join(s, 'app.js.map'), 'x'))
rifiuto('cartella test', (s) => { mkdirSync(join(s, 'test')) })
rifiuto('cartella node_modules', (s) => { mkdirSync(join(s, 'node_modules')) })
rifiuto('config.mjs mancante', (s) => rmSync(join(s, 'accesso', 'config.mjs')))
rifiuto('LICENSE mancante', () => {}, ['--licenza', '/percorso/inesistente/LICENSE'])
rifiuto('radice senza CNAME', (s, radice) => rmSync(join(radice, 'CNAME')))
rifiuto('voce come link simbolico', (s, radice) => {
  rmSync(join(radice, 'voce'), { recursive: true })
  mkdirSync(join(radice, 'altrove')); writeFileSync(join(radice, 'altrove', 'vecchio.txt'), 'x')
  symlinkSync(join(radice, 'altrove'), join(radice, 'voce'))
})

rifiuto('CNAME di un altro sito', (s, radice) => writeFileSync(join(radice, 'CNAME'), 'example.com\n'))
rifiuto('link simbolico dentro la sorgente', (s) => symlinkSync(tmpdir(), join(s, 'fuori')))

test('pubblica rifiuta la radice uguale al repository della voce', () => {
  const r = lancia(process.cwd())
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /repository della voce/)
})

test('voce/ mancante e .voce-vecchia presente: si ripristina prima di tutto, anche se poi la pubblicazione è rifiutata', () => {
  const radice = radiceFinta()
  const sorgente = mkdtempSync(join(tmpdir(), 'web-'))
  try {
    cpSync('web', sorgente, { recursive: true })
    writeFileSync(join(sorgente, 'prova.wav'), 'RIFF') // rifiuto dopo il ripristino
    renameSync(join(radice, 'voce'), join(radice, '.voce-vecchia'))
    const r = lancia(radice, '--sorgente', sorgente)
    assert.notEqual(r.status, 0)
    assert.ok(intatta(radice), 'la vecchia voce/ doveva tornare al suo posto')
  } finally { rmSync(radice, { recursive: true, force: true }); rmSync(sorgente, { recursive: true, force: true }) }
})

test('pubblica rifiuta un commit che non è in nessun ramo remoto (senza --consenti-modifiche)', () => {
  const radice = radiceFinta()
  const repo = mkdtempSync(join(tmpdir(), 'repo-'))
  const git = (...a) => spawnSync('git', ['-c', 'user.name=prova', '-c', 'user.email=prova@locale', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, encoding: 'utf8' })
  try {
    mkdirSync(join(repo, 'web', 'accesso'), { recursive: true })
    writeFileSync(join(repo, 'web', 'accesso', 'config.mjs'), "export const K = 'x'\n")
    cpSync('LICENSE', join(repo, 'LICENSE')); cpSync('NOTICE', join(repo, 'NOTICE'))
    assert.equal(git('init', '-q').status, 0)
    assert.equal(git('add', '.').status, 0)
    assert.equal(git('commit', '-q', '-m', 'prova').status, 0)
    const r = spawnSync('node', [join(process.cwd(), SCRIPT), radice, '--senza-test'], { cwd: repo, encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /pubblica prima il sorgente: git push del ramo/)
    assert.ok(intatta(radice))
  } finally { rmSync(radice, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
})

test('pubblica rifiuta una radice inesistente e la cartella home', () => {
  assert.notEqual(lancia('/percorso/che/non/esiste').status, 0)
  assert.notEqual(lancia(process.env.HOME).status, 0)
})

test('pubblica rifiuta se web/ ha modifiche non salvate (senza --consenti-modifiche)', () => {
  const radice = radiceFinta()
  const marcatore = 'web/provvisorio-pubblica-test.txt'
  try {
    writeFileSync(marcatore, 'x')
    const r = spawnSync('node', [SCRIPT, radice, '--senza-test'], { encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /modifiche non salvate/)
    assert.ok(intatta(radice))
  } finally { rmSync(marcatore, { force: true }); rmSync(radice, { recursive: true, force: true }) }
})

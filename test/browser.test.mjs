// test/browser.test.mjs — la pagina vera in Chrome: carica, calcola, seleziona, misura, A/B, PNG
// Riferimento numerico: Praat 6.4.62 nativo (stessa versione di praat-wasm).
// I file di prova sono privati: nei messaggi si scrive sempre «file di prova», mai il percorso.
// Requisito: per ogni «Fase1_…_PRE.wav» deve esistere il «_POST.wav» accanto, e il POST deve durare almeno 30 s
// (serve al secondo test, che seleziona 24-30 s).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import puppeteer from 'puppeteer-core'
import { fileDiProva } from './strumenti/file-prova.mjs'
import { eseguiNativo, nativoDisponibile } from './strumenti/praat-nativo.mjs'
import { leggiRisultati } from '../web/motore/script.mjs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.praat': 'text/plain' }
const files = fileDiProva()
const pre = files && files.find(f => f.includes('Fase1_') && f.endsWith('_PRE.wav'))
const post = pre && pre.replace('_PRE.wav', '_POST.wav')
const causa = !existsSync(CHROME) ? 'manca Chrome'
  : !nativoDisponibile() ? 'manca Praat 6.4.62 nativo'
    : !pre ? 'mancano i file di prova'
      : !existsSync(post) ? 'manca il POST'
        : false

async function server () {
  const srv = createServer((req, res) => {
    const p = join('web', decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/voce\//, '/')))
    if (!p.startsWith('web') || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TIPI[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p))
  })
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve))
  return srv
}

// stesso Praat 6.4.62 nel browser (wasm) e nativo: differenze osservate <= 4e-4 in relativo
const vicino = (a, b) => Math.abs(a - b) <= Math.max(1e-3 * Math.abs(b), 0.01)

// avvia server, cartella temporanea e Chrome; ogni risorsa si chiude anche se la precedente lancia
async function conPagina (fn) {
  const dir = mkdtempSync(join(tmpdir(), 'voce-'))
  try {
    const srv = await server()
    try {
      const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] })
      try {
        const sessione = await browser.target().createCDPSession()
        // la figura PNG parte come download: si registra il nome ma non scende sul disco
        const scaricati = []
        const attese = [] // chi aspetta un download: si sveglia all'evento, non dopo un tempo fisso
        sessione.on('Browser.downloadWillBegin', e => { scaricati.push(e.suggestedFilename); attese.splice(0).forEach(r => r()) })
        const download = (ms = 5000) => new Promise((resolve, reject) => {
          if (scaricati.length) { resolve(); return }
          const t = setTimeout(() => reject(new Error('nessun download entro ' + ms + ' ms')), ms)
          attese.push(() => { clearTimeout(t); resolve() })
        })
        await sessione.send('Browser.setDownloadBehavior', { behavior: 'deny', eventsEnabled: true })
        const page = await browser.newPage()
        const errori = []
        page.on('pageerror', e => errori.push(e.message))
        page.on('console', m => m.type() === 'error' && errori.push(m.text()))
        await page.goto(`http://127.0.0.1:${srv.address().port}/voce/index.html?prova-senza-accesso=1`)
        await fn({ page, dir, errori, scaricati, download })
      } finally { await browser.close() }
    } finally { srv.close(); srv.closeAllConnections() }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const pronte = () => window.__voce?.S.lati.PRE?.tracce && window.__voce?.S.lati.POST?.tracce

test('giro completo nel browser', { skip: causa, timeout: 600000 }, async () => {
  await conPagina(async ({ page, dir, errori, scaricati, download }) => {
    await (await page.$('#file-pre')).uploadFile(pre)
    await (await page.$('#file-post')).uploadFile(post)
    await page.waitForFunction(pronte, { timeout: 300000 })

    // pixel scuri (luminanza < 100) nella sola area dati di entrambi gli spettrogrammi
    for (const id of ['spg-pre', 'spg-post']) {
      const scuri = await page.evaluate(async (id) => {
        const { margini } = await import('./vista/spettrogramma.mjs')
        const m = margini(), c = document.getElementById(id), k = c.width / c.clientWidth
        const x0 = Math.round(m.s * k), y0 = Math.round(m.a * k)
        const w = Math.round(c.width - (m.s + m.d) * k), h = Math.round(c.height - (m.a + m.b) * k)
        const d = c.getContext('2d').getImageData(x0, y0, w, h).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 100) n++
        return n
      }, id)
      assert.ok(scuri > 1000, `spettrogramma ${id} vuoto nell'area dati: ${scuri} pixel scuri`)
    }

    // misura del tratto 7,75-10,25 s e confronto, PRE e POST, con Praat 6.4.62 nativo
    const corpo = readFileSync('web/misure/tratto.praat', 'utf8')
    await page.evaluate(() => window.__voce.seleziona(7.75, 10.25))
    await page.evaluate(() => window.__voce.misura())
    const ris = await page.evaluate(() => window.__voce.ultimiRisultati)
    for (const [lato, file] of [['PRE', pre], ['POST', post]]) {
      assert.ok(ris && ris[lato] && !ris[lato].errore, `misura ${lato} non riuscita`)
      const n = leggiRisultati(eseguiNativo(corpo, { file$: file, canale: 0, da: 7.75, a: 10.25, tetto: 5500, f0max: 1100 }))
      const confronto = []
      for (const k of ['f0_mediana', 'cpps', 'hnr', 'alpha', 'f1']) {
        confronto.push(`${k}: browser ${ris[lato][k]} nativo ${n[k]}`)
        assert.ok(vicino(ris[lato][k], n[k]), `${lato} ${k}: browser ${ris[lato][k]} nativo Praat 6.4.62 ${n[k]}`)
      }
      console.log(`CONFRONTO ${lato} (tetto 5500) ` + confronto.join(' | '))
    }

    // voce maschile: le tracce si ricalcolano e f1 coincide con Praat 6.4.62 nativo a 5000 Hz
    await page.evaluate(() => { window.__traccePrima = window.__voce.S.lati.PRE.tracce })
    await page.click('#c-maschile')
    await page.waitForFunction(() => { const L = window.__voce.S.lati; return L.PRE?.tracce && L.POST?.tracce && L.PRE.tracce !== window.__traccePrima }, { timeout: 300000 })
    await page.evaluate(() => window.__voce.seleziona(7.75, 10.25))
    await page.evaluate(() => window.__voce.misura())
    const risM = await page.evaluate(() => window.__voce.ultimiRisultati)
    for (const [lato, file] of [['PRE', pre], ['POST', post]]) {
      assert.ok(risM && risM[lato] && !risM[lato].errore, `misura ${lato} (voce maschile) non riuscita`)
      const nM = leggiRisultati(eseguiNativo(corpo, { file$: file, canale: 0, da: 7.75, a: 10.25, tetto: 5000, f0max: 1100 }))
      console.log(`CONFRONTO ${lato} (tetto 5000) f1: browser ${risM[lato].f1} nativo ${nM.f1}`)
      assert.ok(vicino(risM[lato].f1, nM.f1), `${lato} f1 voce maschile: browser ${risM[lato].f1} nativo Praat 6.4.62 ${nM.f1}`)
    }
    await page.click('#c-maschile')   // si torna al tetto normale
    await page.evaluate(() => { window.__traccePrima = null })
    await page.waitForFunction(pronte, { timeout: 300000 })

    // A/B: dopo che la riproduzione è avanzata, lo scambio cambia lato e non sposta la posizione
    await page.evaluate(() => window.__voce.seleziona(7.75, 10.25))
    await page.click('#play')
    await page.waitForFunction(() => window.__voce.S.ascolto.inRiproduzione() && window.__voce.S.ascolto.posizione() > 7.75 + 0.5, { timeout: 20000 })
    const prima = await page.evaluate(() => ({ p: window.__voce.S.ascolto.posizione(), lato: window.__voce.S.ascolto.sceltoÈ() }))
    await page.click('#ab')
    const dopo = await page.evaluate(() => ({ p: window.__voce.S.ascolto.posizione(), lato: window.__voce.S.ascolto.sceltoÈ() }))
    assert.ok(prima.p > 7.75 + 0.5, `la riproduzione non è avanzata: ${prima.p}`)
    assert.ok(dopo.p >= prima.p, `A/B ha mandato indietro la posizione: ${prima.p} → ${dopo.p}`)
    // 0,25 s: fra le due letture l'audio continua a scorrere per la durata del click (un salto vero sarebbe di secondi)
    assert.ok(Math.abs(dopo.p - prima.p) < 0.25, `A/B ha spostato la posizione: ${prima.p} → ${dopo.p}`)
    assert.notEqual(dopo.lato, prima.lato, `A/B non ha cambiato il lato attivo (${prima.lato})`)
    await page.click('#play')

    // PNG: dimensione e nome del download (che resta rifiutato)
    await page.evaluate(() => window.__voce.esporta())
    const dim = await page.evaluate(() => window.__voce.ultimaFigura?.size || 0)
    assert.ok(dim > 50000, 'PNG troppo piccolo: ' + dim)
    await download() // l'evento CDP del download arriva un attimo dopo il click
    assert.equal(scaricati.length, 1, 'il PNG doveva partire come un solo download')
    assert.ok(scaricati[0].endsWith('.png'), 'il download del PNG non finisce in .png')

    // file non audio: messaggio e nessun errore in pagina
    const finto = join(dir, 'non-audio.wav'); writeFileSync(finto, '%PDF-1.4')
    await (await page.$('#file-post')).uploadFile(finto)
    await page.waitForFunction(() => /Formato non riconosciuto/.test(document.getElementById('stato').textContent), { timeout: 20000 })
    assert.deepEqual(errori, [], 'errori in console: ' + errori.join(' | '))
  })
})

test('PRE a 48 kHz e POST a 44,1 kHz con durate diverse', { skip: causa, timeout: 600000 }, async (t) => {
  await conPagina(async ({ page, dir, errori }) => {
    // con Praat nativo si crea una copia a 48 kHz di 25 s del file PRE, fuori dal repository
    const out48 = join(dir, 'pre48.wav')
    eseguiNativo('s = Read from file: file$\nselectObject: s\nt = Extract part: 0, 25, "rectangular", 1, "no"\nr = Resample: 48000, 50\nSave as WAV file: uscita$\n', { file$: pre, uscita$: out48 })
    await (await page.$('#file-pre')).uploadFile(out48)
    await (await page.$('#file-post')).uploadFile(post)
    await page.waitForFunction(pronte, { timeout: 300000 })
    const durataPost = await page.evaluate(() => window.__voce.S.lati.POST.durata)
    if (durataPost < 30) { t.skip('POST più corto di 30 s'); return }
    await page.evaluate(() => window.__voce.seleziona(24.0, 30.0))   // oltre la fine del PRE (25 s)
    await page.evaluate(() => window.__voce.misura())
    const ris = await page.evaluate(() => window.__voce.ultimiRisultati)
    console.log(`DURATE MISURATE PRE ${ris.PRE?.durata} POST ${ris.POST?.durata}`)
    assert.ok(ris.PRE && !ris.PRE.errore && ris.PRE.durata < 1.01, 'il PRE va misurato solo fino alla sua fine')
    assert.ok(ris.POST && !ris.POST.errore && Math.abs(ris.POST.durata - 6) < 0.01, 'il POST va misurato per 6 s')
    // sopra la tabella si dice che il PRE è misurato solo fino alla sua fine
    const fine = await page.$eval('#avviso-fine', e => (e.hidden ? '' : e.textContent))
    assert.match(fine, /Il PRE finisce a 0'25,0": misurato fino lì\./)
    assert.doesNotMatch(fine, /POST/)

    // loop: dalla selezione 24-30 il ciclo resta nei 25 s del più corto, e rientra (la posizione torna indietro)
    await page.click('#play')
    await page.waitForFunction(() => window.__voce.S.ascolto.inRiproduzione(), { timeout: 20000 })
    const campioni = await page.evaluate(() => new Promise((resolve) => {
      const out = []
      const id = setInterval(() => {
        out.push(window.__voce.S.ascolto.posizione())
        if (out.length >= 12) { clearInterval(id); resolve(out) }
      }, 250)
    }))
    console.log('POSIZIONI NEL LOOP ' + campioni.map(p => p.toFixed(2)).join(' '))
    assert.ok(campioni.length >= 3)
    assert.ok(campioni.every(p => p >= 24 - 0.001 && p <= 25.001), 'il loop esce da 24-25 s: ' + campioni.join(' '))
    assert.ok(campioni.some((p, i) => i > 0 && p < campioni[i - 1]), 'il loop non è rientrato nel ciclo: ' + campioni.join(' '))
    await page.click('#play')
    assert.deepEqual(errori, [], 'errori in console: ' + errori.join(' | '))
  })
})

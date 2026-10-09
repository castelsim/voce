import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { statoAccesso, provaSenzaAccesso } from '../web/accesso/accesso.mjs'

test('offline con sessione salvata resta dentro (la prima utente alla discussione)', () => {
  assert.equal(statoAccesso({ sessione: null, salvata: true, online: false }), 'dentro')
  assert.equal(statoAccesso({ sessione: null, salvata: false, online: false }), 'fuori')
  assert.equal(statoAccesso({ sessione: { user: {} }, salvata: true, online: true }), 'dentro')
  assert.equal(statoAccesso({ sessione: null, salvata: true, online: true }), 'fuori')
})
test('rete presente ma Supabase irraggiungibile: decide la sessione salvata', () => {
  assert.equal(statoAccesso({ sessione: null, salvata: true, online: true, raggiungibile: false }), 'dentro')
  assert.equal(statoAccesso({ sessione: null, salvata: false, online: true, raggiungibile: false }), 'fuori')
})
test('la prova senza accesso vale solo su 127.0.0.1', () => {
  assert.equal(provaSenzaAccesso({ hostname: '127.0.0.1', search: '?prova-senza-accesso=1' }), true)
  assert.equal(provaSenzaAccesso({ hostname: 'stageplot.it', search: '?prova-senza-accesso=1' }), false)
})
test('config.mjs ha la chiave vera (nessun segnaposto)', async () => {
  const { readFileSync } = await import('node:fs')
  assert.ok(!readFileSync('web/accesso/config.mjs', 'utf8').includes('<<'))
})
test('la chiave è quella pubblica (ruolo anon) del progetto StagePlot', async () => {
  const { SB_ANON } = await import('../web/accesso/config.mjs')
  const parte = SB_ANON.split('.')[1]
  const dati = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'))
  assert.equal(dati.role, 'anon')
  assert.equal(dati.ref, 'vsodplqkuvnsdiikvmjb')
})

test('provaSenzaAccesso: localhost e [::1] non valgono', () => {
  assert.equal(provaSenzaAccesso({ hostname: 'localhost', search: '?prova-senza-accesso=1' }), false)
  assert.equal(provaSenzaAccesso({ hostname: '[::1]', search: '?prova-senza-accesso=1' }), false)
})

// --- avviaAccesso con oggetti finti ---
const { avviaAccesso, chiaveSessione, _azzeraPerTest } = await import('../web/accesso/accesso.mjs')
const SALVATA = JSON.stringify({ refresh_token: 'r', user: { id: 'u1', email: 'a@b.it' } })

async function conFinti ({ salvato, online = true, getSession, search = '' }, fn) {
  const vecchi = {}
  const chiavi = ['window', 'localStorage', 'navigator', 'location']
  for (const k of chiavi) vecchi[k] = Object.getOwnPropertyDescriptor(globalThis, k)
  const mem = new Map()
  if (salvato !== undefined) mem.set(chiaveSessione(), salvato)
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
  def('window', { supabase: { createClient: () => ({ auth: { getSession } }) } })
  def('localStorage', { getItem: (k) => (mem.has(k) ? mem.get(k) : null) })
  def('navigator', { onLine: online })
  def('location', { hostname: 'stageplot.it', search })
  _azzeraPerTest()
  try { return await fn() } finally {
    for (const k of chiavi) { if (vecchi[k]) Object.defineProperty(globalThis, k, vecchi[k]); else delete globalThis[k] }
    _azzeraPerTest()
  }
}

test('getSession con errore di rete e sessione salvata valida: dentro, utente dal salvato', async () => {
  await conFinti({ salvato: SALVATA, getSession: async () => ({ data: { session: null }, error: new Error('rete') }) }, async () => {
    const r = await avviaAccesso()
    assert.equal(r.stato, 'dentro')
    assert.deepEqual(r.utente, { id: 'u1', email: 'a@b.it' })
  })
})
test('getSession che non risponde mai: dentro entro il timeout', { timeout: 2000 }, async () => {
  await conFinti({ salvato: SALVATA, getSession: () => new Promise(() => {}) }, async () => {
    const r = await avviaAccesso({ attesaMs: 50 })
    assert.equal(r.stato, 'dentro')
    assert.equal(r.utente.id, 'u1')
  })
})
test('getSession con sessione valida: dentro, utente dalla sessione', async () => {
  const sessione = { user: { id: 'u2', email: 'c@d.it' } }
  await conFinti({ salvato: SALVATA, getSession: async () => ({ data: { session: sessione }, error: null }) }, async () => {
    const r = await avviaAccesso()
    assert.equal(r.stato, 'dentro')
    assert.deepEqual(r.utente, { id: 'u2', email: 'c@d.it' })
  })
})
test('nessuna sessione salvata e getSession senza sessione: fuori', async () => {
  await conFinti({ getSession: async () => ({ data: { session: null }, error: null }) }, async () => {
    const r = await avviaAccesso()
    assert.equal(r.stato, 'fuori')
    assert.equal(r.utente, null)
  })
})
test('valore salvato non JSON e offline: fuori', async () => {
  await conFinti({ salvato: 'x', online: false, getSession: async () => { throw new Error('non deve essere chiamata') } }, async () => {
    assert.equal((await avviaAccesso()).stato, 'fuori')
  })
})
test('sessione salvata senza refresh_token non conta', async () => {
  await conFinti({ salvato: JSON.stringify({ user: { id: 'u1' } }), online: false, getSession: async () => null }, async () => {
    assert.equal((await avviaAccesso()).stato, 'fuori')
  })
})

test('attesaPer: 15 s al ritorno da Google (?code=), altrimenti 4 s', async () => {
  const { attesaPer } = await import('../web/accesso/accesso.mjs')
  assert.equal(attesaPer({ search: '?code=abc' }), 15000)
  assert.equal(attesaPer({ search: '?x=1&code=abc' }), 15000)
  assert.equal(attesaPer({ search: '' }), 4000)
  assert.equal(attesaPer({ search: '?codice=1' }), 4000)
})
test('al ritorno da Google avviaAccesso aspetta getSession fino a 15 s', async () => {
  const sessione = { user: { id: 'u3', email: 'e@f.it' } }
  let rispondi
  const getSession = () => new Promise((resolve) => { rispondi = resolve })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    await conFinti({ getSession, search: '?code=abc' }, async () => {
      let esito = null
      const p = avviaAccesso().then(r => { esito = r })
      mock.timers.tick(5000) // oltre i 4 s normali: deve ancora aspettare
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(esito, null, 'con ?code= non deve arrendersi dopo 4 s')
      rispondi({ data: { session: sessione }, error: null })
      await p
      assert.equal(esito.stato, 'dentro')
      assert.equal(esito.utente.id, 'u3')
    })
  } finally { mock.timers.reset() }
})

// --- esci() con oggetti finti: ordine delle chiamate e ricarica anche se la rete non risponde ---
const { esci } = await import('../web/accesso/accesso.mjs')
async function conUscita (signOut, fn) {
  const chiavi = ['window', 'localStorage', 'location']
  const vecchi = {}
  for (const k of chiavi) vecchi[k] = Object.getOwnPropertyDescriptor(globalThis, k)
  const passi = []
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
  def('window', { supabase: { createClient: () => ({ auth: { signOut: (o) => { passi.push(o && o.scope === 'local' ? 'locale' : 'globale'); return signOut(o) } } }) } })
  def('localStorage', { removeItem: (k) => passi.push('rimossa ' + (k === chiaveSessione() ? 'sessione' : k)) })
  def('location', { hostname: 'stageplot.it', search: '', reload: () => passi.push('ricarica') })
  _azzeraPerTest()
  try { return await fn(passi) } finally {
    for (const k of chiavi) { if (vecchi[k]) Object.defineProperty(globalThis, k, vecchi[k]); else delete globalThis[k] }
    _azzeraPerTest()
  }
}
test('esci: prima locale e chiave salvata, poi globale, poi ricarica', async () => {
  await conUscita(async () => ({ error: null }), async (passi) => {
    await esci()
    assert.deepEqual(passi, ['locale', 'rimossa sessione', 'globale', 'ricarica'])
  })
})
test('esci: con la rete che non risponde ricarica comunque entro il limite', { timeout: 2000 }, async () => {
  await conUscita(() => new Promise(() => {}), async (passi) => {
    await esci({ limiteMs: 50 })
    assert.deepEqual(passi, ['locale', 'rimossa sessione', 'globale', 'ricarica'])
  })
})
test('esci: signOut che lancia non ferma l\'uscita', async () => {
  await conUscita(() => { throw new Error('rete') }, async (passi) => {
    await esci({ limiteMs: 50 })
    assert.deepEqual(passi, ['locale', 'rimossa sessione', 'globale', 'ricarica'])
  })
})

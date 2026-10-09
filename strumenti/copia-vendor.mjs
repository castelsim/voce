// strumenti/copia-vendor.mjs — copia le librerie di terzi in web/vendor/ con licenze, versione e provenienza
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

function copia (da, a) { mkdirSync(dirname(a), { recursive: true }); copyFileSync(da, a) }

// Provenienza delle versioni usate, letta da `npm view <pacchetto>@<versione> --json` (il package.json installato non
// contiene gitHead né integrity). Cambiando versione si aggiorna qui, rileggendo npm view.
const PROVENIENZA = {
  'praat-wasm@6.4.6200': {
    commit: 'f2da7c33e1ae99cb134251cbd90b5e5fecf2e4cc (gitHead dichiarato nel pacchetto npm; nessuna attestazione di provenienza)',
    integrita: 'sha512-JoOa9iKkzAKprNkYiiEBDk+7vsMOUgbvV8HJ85u77lHvFERpEv5YtHBZxOVhSVL6hlw/Y+0FBoxuIgDm6U5nYQ==',
    pacchetto: 'https://registry.npmjs.org/praat-wasm/-/praat-wasm-6.4.6200.tgz',
    repository: 'https://github.com/reynoldsnlp/praat.github.io (fork di Praat, PR praat/praat#3316)'
  },
  '@supabase/supabase-js@2.110.0': {
    commit: 'non dichiarato nel pacchetto npm',
    integrita: 'sha512-8yI84VJiEVW4zxZpLUmxXmjzQ7O2St9X/ymzlBETDHTURPWG3LmvbSiibq+7dqAJmyoUfxZnSfXeM4HCM8s4XQ==',
    pacchetto: 'https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.110.0.tgz',
    repository: 'https://github.com/supabase/supabase-js (cartella packages/core/supabase-js)'
  }
}

function fonte (nome, ver, descrizione, licenza) {
  const p = PROVENIENZA[nome + '@' + ver]
  if (!p) throw new Error(`provenienza di ${nome}@${ver} sconosciuta: aggiorna PROVENIENZA con npm view ${nome}@${ver} --json`)
  return `${nome} ${ver} — ${descrizione}\n` +
    `Pacchetto npm: ${p.pacchetto}\nIntegrità (npm): ${p.integrita}\n` +
    `Repository di origine: ${p.repository}\nCommit: ${p.commit}\nLicenza: ${licenza}\n`
}

const pw = 'node_modules/praat-wasm'
for (const f of ['js/praat-wasm.mjs', 'js/classes.mjs', 'js/worker.mjs', 'js/worker-client.mjs', 'dist/praat.mjs', 'dist/praat.wasm']) {
  copia(join(pw, f), join('web/vendor/praat-wasm', f))
}
const ver = JSON.parse(readFileSync(join(pw, 'package.json'), 'utf8')).version
writeFileSync('web/vendor/praat-wasm/VERSIONE', ver + '\n')
// praat-wasm non include un file di licenza: GPL-3.0-or-later dichiarata in package.json → copia del testo GPL del progetto
copia('LICENSE', 'web/vendor/praat-wasm/LICENSE')
writeFileSync('web/vendor/praat-wasm/FONTE.txt', fonte('praat-wasm', ver, 'Praat (Boersma & Weenink) compilato in WebAssembly', 'GPL-3.0-or-later'))

const sb = 'node_modules/@supabase/supabase-js'
const verSb = JSON.parse(readFileSync(join(sb, 'package.json'), 'utf8')).version
copia(join(sb, 'dist/umd/supabase.js'), 'web/vendor/supabase/supabase.js')
const lic = existsSync(join(sb, 'LICENSE')) ? join(sb, 'LICENSE') : join(sb, 'LICENSE.md')
copia(lic, 'web/vendor/supabase/LICENSE')
writeFileSync('web/vendor/supabase/VERSIONE', verSb + '\n')
writeFileSync('web/vendor/supabase/FONTE.txt', fonte('@supabase/supabase-js', verSb, 'client di Supabase (solo per l\'accesso con Google)', 'MIT'))
console.log('vendor copiato: praat-wasm', ver, '· supabase-js', verSb)

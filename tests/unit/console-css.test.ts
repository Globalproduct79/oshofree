// tests/unit/console-css.test.ts
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/styles/console.css', 'utf8')
it.each(['.btn.p', '.mc .v', '.cc .cv', '.hero .art', '.st-live', '.st-declined', '.pill[aria-pressed=true]',
  'a.cc', '.q', '.notif', '.modal.on', '.phone', '.fun .fb', '.hbar .b', '.lead .rk', '.empty', '.toast.on', '.sw[aria-checked=true]',
  '.opt[aria-pressed=true]', '.drop', '.est', '.steps', '.kv', '.tagp', '.warn', '.crumb', '.head h1', '.wrap', '.two'])(
  'defines %s', (sel) => expect(css).toContain(sel))
it('declares every token', () => {
  for (const t of ['--ink:#14171D', '--phx:#FF5A1F', '--grn:#0E9F6E', '--amb:#B7791F', '--red:#C53030', '--blu:#2B5FD9', '--pur:#6C5CE7', '--r:14px', '--sb:248px'])
    expect(css.replace(/\s/g, '')).toContain(t)
})
it('adds the missing declined pill', () => expect(css).toMatch(/\.st-declined\{background:var\(--red2\);color:var\(--red\)\}/))

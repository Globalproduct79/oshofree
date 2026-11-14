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
it('stacks a team row under 600 px: who on the first line, the controls on the second', () => {
  expect(css).toMatch(/@media\(max-width:600px\)\{[^@]*\.team-row \.nm\{flex-basis:calc\(100% - 42px\)\}[^@]*\.team-row \.ctl\{flex-basis:100%;padding-left:42px\}/)
})
it("keeps the head's primary on one line", () => expect(css).toContain('.head .acts .btn.p{white-space:nowrap}'))
it('the creative picker: a lit zone for a drag, the upload bar, a message line, and a splash phone at 40%', () => {
  for (const sel of ['.f + .drop{margin-top:6px}', '.drop[data-over]', '.drop .bar i', '.dacts', '.dmsg.bad{color:var(--red)}'])
    expect(css).toContain(sel)
  expect(css).toContain('.phone-thumb .phone{transform:scale(.4)')
  // The prototype's `.drop img` clamps a thumbnail to 90 px; inside the phone the splash must fill the screen.
  expect(css).toContain('.drop .phone-thumb img,.drop .phone-thumb video{max-height:none;max-width:none;margin:0;border-radius:0}')
})
it("puts a placement tile's inventory badge on the tile's top edge, clear of the title", () => {
  expect(css).toContain('.opt .soon{top:-9px;right:10px;margin:0;line-height:1.4}')
  // After the prototype's rule (which placed it inside the tile, over a long title), so this one wins.
  expect(css.indexOf('.opt .soon{top:-9px')).toBeGreaterThan(css.indexOf('.opt .soon{position:absolute;top:8px'))
})

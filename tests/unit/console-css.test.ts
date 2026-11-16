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
it("draws an offer's creative inside its box, a creator's line under a card's sub-line, and a Review row's video cover", () => {
  expect(css).toContain('.box .cr{display:block;max-width:100%;max-height:220px')
  expect(css).toContain('.cc .b .by{display:block}')
  expect(css).toContain('.q .cv video{width:100%;height:100%;object-fit:cover')
  // A card's video fills its cover under the pills, which come after it.
  expect(css).toContain('.cc .cv video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}')
})
it("spaces the New form's Review step into titled sections", () => {
  expect(css).toContain('.summary{display:grid;gap:18px}.summary .subt{display:block;margin-bottom:8px}')
})
it("draws the preview's format tabs, an off tab saying why, and the real landing page in the phone at its scale", () => {
  for (const sel of ['.tabs{display:flex', '.tab[aria-selected=true]{background:var(--phx2);border-color:var(--phx);color:var(--phx)}',
    '.tab:disabled{', '.tab i{display:block', '.pv-page{position:absolute;top:20px', '.pv-page iframe{display:block;border:0;width:375px;height:680px;transform:scale(.656);transform-origin:0 0}',
    '.pv-side .msg{', '.modal .in > .sub{'])
    expect(css).toContain(sel)
  // A video creative fills the phone's featured slot and grid tile like an image.
  expect(css).toContain('.feat video{width:100%;display:block;height:100px;object-fit:cover}')
  expect(css).toContain('.pc .tl video{width:100%;height:100%;object-fit:cover}')
})
it('makes the preview a full-screen sheet under 720 px, every tab in view, Close above the phone, and the phone shrunk to the width it has', () => {
  expect(css).toMatch(/@media\(max-width:720px\)\{\.modal \.in\.sheet\{width:100%;height:100%;max-height:none;border-radius:0;[^}]*\}/)
  // Every tab stays in view: three to a row. The line about the tab and Close come before the phone, the prototype's
  // long explainer stays on the desktop.
  expect(css).toMatch(/@media\(max-width:720px\)\{[^@]*\.tabs\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
  expect(css).toMatch(/@media\(max-width:720px\)\{[^@]*\.pv-side\{order:-1\}\.pv-side \.ex\{display:none\}/)
  expect(css).toContain('.pv-stage{container-type:inline-size;min-width:0}')
  expect(css).toMatch(/@container \(max-width:259px\)\{\.pv-stage \.phone\{zoom:\.85\}\}/)
})
it("lights the activity line a link asked for, spaces Show more under a list, and draws a sharer as a row that opens", () => {
  expect(css).toContain('.hist li.on{background:var(--phx2);color:var(--ink);border-radius:8px;padding-left:8px;padding-right:8px}')
  expect(css).toContain('.box > .btns{margin-top:12px}')
  for (const sel of ['.shr details{border-bottom:1px solid var(--line)}', '.shr summary{display:flex;flex-wrap:wrap', '.shr summary::-webkit-details-marker{display:none}',
    '.shr details[open] > summary::before{content:"▾"}', '.shr .ph{font-family:ui-monospace', '.shr .v{margin-left:auto', '.shr details > .hist'])
    expect(css).toContain(sel)
  // Keyboard focus on a row shows the ring inside the box.
  expect(css).toContain('.shr summary:focus-visible{outline-offset:-2px')
})
it('draws a form button as a link, Newest over the activity list, and a Show more on its way dimmed', () => {
  expect(css).toContain('.linkbtn{background:none;border:0;padding:0;font:inherit;color:var(--blu)')
  expect(css).toContain('.linkbtn:disabled{opacity:.6')
  expect(css).toContain('form.enter{display:inline;margin:0}')
  expect(css).toContain('.box > .btns.top{margin:0 0 10px}')
  expect(css).toContain('.btn[aria-disabled=true]{opacity:.6')
})

it("draws a demo workspace's grey pill beside its name, and its line at the foot of the sidebar", () => {
  expect(css).toContain('.dm{display:inline-block;margin-left:6px;padding:0 7px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--ink2)')
  expect(css).toContain('.side .foot .dmf{display:block')
})

import { tokens as t } from '@/lib/tokens'

// The landing page's only stylesheet, inlined in <head>: every colour and radius comes from tokens.
const FONT = '-apple-system,"Segoe UI",system-ui,Helvetica,Arial,sans-serif'
const MONO = 'ui-monospace,Menlo,Consolas,monospace'

export const landingCss = [
  '*{box-sizing:border-box}',
  `body{margin:0;background:${t.bg};color:${t.ink};font:15px/1.45 ${FONT};-webkit-text-size-adjust:100%}`,
  'main{max-width:480px;margin:0 auto;padding:16px 16px 32px}',
  `.art{display:block;width:100%;aspect-ratio:16/9;border-radius:${t.radius};object-fit:cover;background:${t.line2}}`,
  `.tile{display:flex;align-items:center;justify-content:center;color:${t.card};font-size:40px;font-weight:800}`,
  `.brand{margin:16px 0 4px;font-size:13px;color:${t.ink2};overflow-wrap:anywhere}`,
  'h1{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere}',
  'h2{margin:0;font-size:17px;line-height:1.3}',
  'h3{margin:16px 0 0;font-size:15px}',
  'p{margin:0;overflow-wrap:anywhere}',
  '.desc{margin-top:8px;font-size:15px}',
  `.reward{display:flex;align-items:center;gap:6px;margin-top:12px;color:${t.accent};font-weight:600}`,
  '.reward svg{flex:none;width:16px;height:16px}',
  `.ends{margin-top:4px;font-size:13px;color:${t.ink2}}`,
  'form{margin:0}',
  `.btn{display:block;width:100%;margin-top:16px;padding:14px 16px;border:1px solid ${t.line};border-radius:${t.radius};font:inherit;font-size:16px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}`,
  `.primary{background:${t.accent};border-color:${t.accent};color:${t.card}}`,
  `.secondary{background:${t.card};color:${t.ink}}`,
  '.stack .btn{margin-top:8px}',
  `.code{margin-top:16px;padding:16px;border:1px dashed ${t.accentLine};border-radius:${t.radius};background:${t.accentSoft};text-align:center;font:700 24px/1.2 ${MONO};letter-spacing:.08em;overflow-wrap:anywhere;user-select:all}`,
  `.code small{display:block;margin-bottom:6px;font:400 13px/1.3 ${FONT};letter-spacing:0;color:${t.ink2}}`,
  `section{margin-top:24px;padding:16px;border:1px solid ${t.line};border-radius:${t.radius};background:${t.card}}`,
  `.lead{margin-top:4px;font-size:14px;color:${t.ink2}}`,
  `label{display:block;margin:12px 0 4px;font-size:13px;color:${t.ink2}}`,
  `input{display:block;width:100%;padding:12px;border:1px solid ${t.line};border-radius:${t.radius};background:${t.card};color:${t.ink};font:inherit;font-size:16px}`,
  `.error{margin-top:12px;padding:10px 12px;border-radius:${t.radius};background:${t.redSoft};color:${t.red};font-size:14px}`,
  `.status{margin-top:32px;font-size:17px;text-align:center;color:${t.ink2}}`,
  '.status .brand{margin-top:0}',
].join('')

// Added to a preview only (Prompt 7), so the real page's stylesheet is unchanged: the line saying nothing is recorded,
// and a control that does nothing says so to the pointer.
export const previewCss = [
  `.pv{margin:0 0 16px;padding:8px 12px;border:1px dashed ${t.accentLine};border-radius:${t.radius};background:${t.accentSoft};color:${t.bannerText};font-size:13px;font-weight:600;text-align:center}`,
  'button:disabled,input:disabled,a[aria-disabled]{cursor:not-allowed}',
].join('')

import { Fragment } from 'react'
import { Box, TokenChip } from '@/components/og'
import { type DocBox, ERRORS } from '@/lib/api-docs'
import { API_COPY } from '@/lib/copy-api'

// Prose with `backticks` around inline tokens, drawn as .tok chips.
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 ? <TokenChip key={i}>{part}</TokenChip> : <Fragment key={i}>{part}</Fragment>))}
    </>
  )
}

// JSON keys, strings, and numbers / booleans / null, as the prototype colours them.
const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g

function jsonLine(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(JSON_TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index))
    if (m[1] !== undefined && m[2] !== undefined) {
      out.push(<span className="k" key={m.index}>{m[1]}</span>, m[2])
    } else if (m[1] !== undefined) {
      out.push(<span className="s" key={m.index}>{m[1]}</span>)
    } else {
      out.push(<span className="n" key={m.index}>{m[0]}</span>)
    }
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

// The request line's method, the header line and the reply line are grey comments; the rest is JSON.
function codeLine(line: string): React.ReactNode[] {
  if (/^(Authorization|→)/.test(line)) return [<span className="c" key="c">{line}</span>]
  const request = /^(GET|POST)(\s.*)$/.exec(line)
  if (request) return [<span className="c" key="c">{request[1]}</span>, request[2]]
  return jsonLine(line)
}

export function Code({ code }: { code: string }) {
  return (
    <pre>
      {code.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {codeLine(line)}
        </Fragment>
      ))}
    </pre>
  )
}

export function DocSection({ box }: { box: DocBox }) {
  return (
    <Box title={box.title} sub={box.sub && <Rich text={box.sub} />}>
      {box.code && <Code code={box.code} />}
      {box.rows && (
        <table>
          <tbody>
            {box.rows.map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>
                  <Rich text={value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Box>
  )
}

export function ErrorsBox() {
  return (
    <Box title={API_COPY.errorsTitle}>
      <table>
        <tbody>
          {ERRORS.map(([status, error, when]) => (
            <tr key={error}>
              <td>{status}</td>
              <td>
                <TokenChip>{error}</TokenChip>
              </td>
              <td>{when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}

import { ERRORS, type Endpoint } from '@/lib/api-docs'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

export const Code = ({ children }: { children: string }) => (
  <pre
    className="overflow-x-auto border p-3 text-xs leading-relaxed"
    style={{ backgroundColor: tokens.card, borderColor: tokens.line, borderRadius: tokens.radius, color: tokens.ink }}
  >
    {children}
  </pre>
)

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-3 text-lg font-semibold" style={{ color: tokens.ink }}>
    {children}
  </h2>
)
const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide" style={{ color: tokens.ink3 }}>
    {children}
  </p>
)

export function EndpointSection({ e }: { e: Endpoint }) {
  const request = [`${e.method} ${e.path}`, ...e.headers, ...(e.body ? ['', JSON.stringify(e.body, null, 2)] : [])].join('\n')
  return (
    <section className="mb-10" id={e.id}>
      <H2>{e.title}</H2>
      <p className="text-sm" style={{ color: tokens.ink2 }}>
        {e.purpose}
      </p>
      <Label>Request</Label>
      <Code>{request}</Code>
      <Label>Response {e.status}</Label>
      <Code>{JSON.stringify(e.response, null, 2)}</Code>
      <Label>Rules</Label>
      <ul className="list-disc pl-5 text-sm" style={{ color: tokens.ink2 }}>
        {e.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </section>
  )
}

export function ErrorsSection() {
  return (
    <section className="mb-10">
      <H2>{COPY.api.errors}</H2>
      <table className="w-full text-left text-sm" style={{ color: tokens.ink2 }}>
        <thead>
          <tr>
            {COPY.api.errorColumns.map((c) => (
              <th key={c} className="py-1 pr-4 font-medium" style={{ color: tokens.ink }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ERRORS.map(([status, error, when]) => (
            <tr key={error}>
              <td className="py-1 pr-4">{status}</td>
              <td className="py-1 pr-4 font-mono text-xs">{error}</td>
              <td className="py-1">{when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function RulesSection() {
  return (
    <section className="mb-10">
      <H2>{COPY.api.rulesTitle}</H2>
      <ul className="list-disc pl-5 text-sm" style={{ color: tokens.ink2 }}>
        {COPY.api.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </section>
  )
}

export function DevKeyBox({ keyValue }: { keyValue: string }) {
  const curl = `curl -H "Authorization: Bearer ${keyValue}" "${process.env.APP_URL}/api/v1/offers?country=KE"`
  return (
    <section className="mb-10">
      <p className="mb-2 text-sm font-medium" style={{ color: tokens.ink }}>
        {COPY.api.devKey}: <span className="font-mono">{keyValue}</span>
      </p>
      <Code>{curl}</Code>
      <p className="mt-1 text-xs" style={{ color: tokens.ink3 }}>
        {COPY.api.devKeyNote}
      </p>
    </section>
  )
}

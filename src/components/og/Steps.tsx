// Numbered grey tiles (Sharing's "How a share works").
export function Steps({ steps }: { steps: readonly { title: React.ReactNode; body: React.ReactNode }[] }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={i} className="step">
          <b>
            <i>{i + 1}</i>
            {s.title}
          </b>
          <p>{s.body}</p>
        </div>
      ))}
    </div>
  )
}

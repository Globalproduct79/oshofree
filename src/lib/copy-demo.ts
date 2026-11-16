// The demo controls (spec §6.7): Global only, and only with DEMO_CONTROLS=1.
export const DEMO = {
  simulate: 'Simulate a day',
  // The prototype's toast (ADV §15).
  simulated: 'Simulated one day on Phoenix — delivery, shares, rewards and statements updated',
  errors: {
    ALREADY_SIMULATED: 'Already simulated today.',
    NO_PHOENIX: 'Phoenix is not live, so nothing was delivered.',
    FORBIDDEN: 'Only Global can simulate a day.',
  },
  // "Run daily job" (Review): the label is the controller's; the toasts are the builder's.
  runDaily: 'Run daily job',
  ranDaily: 'Daily job ran — delivery, statuses and invoices updated',
  ranDailyWithErrors: (n: number) => `Daily job ran with ${n === 1 ? '1 error' : `${n} errors`}`,
  dailySkipped: 'The daily job already ran today.',
  dailyForbidden: 'Only Global can run the daily job.',
  // Ours (Prompt 9): the seed's workspaces are demo data. The grey pill beside a demo workspace's name (its tooltip is
  // the footer line), and the line at the foot of its sidebar.
  pill: 'Demo',
  footer: 'Demo data — reseeded on each reset',
} as const

export type SimulateError = keyof typeof DEMO.errors

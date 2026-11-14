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
} as const

export type SimulateError = keyof typeof DEMO.errors

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { sweepTarget } from '../../scripts/ux-sweep'

// Fix round 1: the sweep flips fraud switches, tops up, invites — so it must never reach the dev server (3100) or its
// database. Its address is fixed to the test server's port and checked against .env.test before anything runs.
describe('the dead-end sweep', () => {
  it('runs against the test server on 3101 when .env.test says so', () => {
    expect(sweepTarget('APP_URL=http://localhost:3101\nDATABASE_URL=x')).toBe('http://localhost:3101')
  })

  it("refuses when .env.test's APP_URL is not 3101, is missing, or the address is not 3101", () => {
    expect(() => sweepTarget('APP_URL=http://localhost:3100')).toThrow(/only runs against the test server on port 3101/)
    expect(() => sweepTarget('DATABASE_URL=x')).toThrow(/APP_URL missing/)
    expect(() => sweepTarget('APP_URL=http://localhost:3101', 'http://localhost:3100')).toThrow(/port 3101/)
  })

  it('importing it runs nothing, and no address comes from the environment (SWEEP_URL is gone)', () => {
    const run = spawnSync('npx', ['tsx', '-e', "import('./scripts/ux-sweep.ts').then(() => console.log('loaded'))"], {
      env: { ...process.env, SWEEP_URL: 'http://localhost:3100' },
      encoding: 'utf8',
    })
    expect(run.stdout).toContain('loaded')
    expect(run.stdout + run.stderr).not.toContain('3100')
  })
})

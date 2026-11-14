// Deterministic PRNG (mulberry32): the same seed always gives the same sequence. No database and no
// server-only import: the seed uses it too.
export type Rng = () => number

export function prng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A whole number from lo to hi, both included.
export function between(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

// U(lo, hi): a uniform real from lo (included) to hi.
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { normalisePhone, upsertConsumer } from '@/lib/consumers'

describe('normalisePhone', () => {
  it('normalises a Nigerian number in every accepted shape', () => {
    expect(normalisePhone('0803 123 4567', 'NG')).toBe('+2348031234567')
    expect(normalisePhone('2348031234567', 'NG')).toBe('+2348031234567')
    expect(normalisePhone('+2348031234567', 'NG')).toBe('+2348031234567')
    expect(normalisePhone('(0803) 123-4567', 'NG')).toBe('+2348031234567')
  })
  it('handles Kenya', () => {
    expect(normalisePhone('0712345678', 'KE')).toBe('+254712345678')
  })
  it('rejects a different dial code and other shapes', () => {
    expect(normalisePhone('+447700900000', 'NG')).toBeNull()
    expect(normalisePhone('12345', 'NG')).toBeNull()
    expect(normalisePhone('+23480312', 'NG')).toBeNull()
    expect(normalisePhone('0803abc4567', 'NG')).toBeNull()
  })
})

describe('upsertConsumer', () => {
  it('keys by phone and updates the name only when one is given', async () => {
    const a = await upsertConsumer('+2348031234567', 'NG', 'Ada')
    const b = await upsertConsumer('+2348031234567', 'NG')
    expect(b.id).toBe(a.id)
    expect(b.name).toBe('Ada')
    const c = await upsertConsumer('+2348031234567', 'NG', 'Ada O')
    expect(c.name).toBe('Ada O')
    expect(await db.consumer.count()).toBe(1)
  })
})

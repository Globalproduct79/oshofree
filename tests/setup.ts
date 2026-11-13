import { beforeEach } from 'vitest'
import { resetDb } from '../scripts/db-truncate'

beforeEach(async () => {
  await resetDb()
})

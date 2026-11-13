import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Tests truncate every table, so they must never see .env's development DATABASE_URL.
config({ path: '.env.test', override: true, quiet: true })

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
  },
})

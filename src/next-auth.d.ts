import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    isGlobalAdmin: boolean
  }
  interface Session {
    user: { id: string; isGlobalAdmin: boolean } & DefaultSession['user']
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string
    isGlobalAdmin: boolean
  }
}

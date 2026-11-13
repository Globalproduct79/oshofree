import type { NextAuthConfig } from 'next-auth'

// Edge-safe: no Prisma, no bcrypt. The Credentials provider is added in auth.ts.
export const authConfig = {
  pages: { signIn: '/sign-in' },
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.isGlobalAdmin = user.isGlobalAdmin
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.isGlobalAdmin = token.isGlobalAdmin
      return session
    },
  },
} satisfies NextAuthConfig

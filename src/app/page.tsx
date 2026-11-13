import { redirect } from 'next/navigation'

// The root is the console; /app sends a signed-out visitor on to /sign-in.
export default function Home() {
  redirect('/app')
}

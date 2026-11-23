import NextLink from 'next/link'
import type { ComponentProps } from 'react'

// Every in-app link, with prefetching off. On Next 15.5.29's production build a navigation to a prefetched route
// never committed about 1 click in 15: the server answered in full, the URL and page stayed put until a reload
// (Playwright stress of /admin/advertisers → detail: 10 and 11 stuck of 150 with prefetching, 0 of 150 without; the
// dev build, which never prefetches, 0 of 80). Navigation costs about 50 ms more without the cache. Lint keeps
// `next/link` out of the rest of src; try the default again on a later Next.
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />
}

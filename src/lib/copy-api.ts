// Phoenix API page strings (GLB §2.6) and the Keys box (spec §6.14.7), plus the offers feed's button label.
export const API_COPY = {
  crumb: 'Phoenix API',
  title: 'Phoenix API',
  lead: "The contract Phoenix's engineers build against: offers out, events in.",
  // Every offer's cta.label: OshoFree stores no custom button text.
  ctaLabel: 'Get this offer',
  keys: {
    title: 'Keys',
    // GLB §2.6 "Environments: api-sandbox and api", for the one server this page runs on.
    environments: (base: string) => `Environments: this server is \`${base}\`.`,
    channel: 'Phoenix Browser',
    created: (date: string) => `Live key · created ${date}`,
    rotate: 'Rotate key',
    notSetUp: 'Phoenix is not set up yet.',
    devKey: 'Development key',
    devKeyNote: 'Local and test environments only. Never shown in production.',
    confirmTitle: 'Rotate the Phoenix key?',
    confirmBody: 'Phoenix gets a new key now. The current key keeps working for 24 hours, so Phoenix can switch without downtime.',
    cancel: 'Cancel',
    newTitle: 'New Phoenix key',
    newBody: "Copy it now and send it to Phoenix's engineers. It is shown once; OshoFree keeps only a hash.",
    copy: 'Copy',
    done: 'Done',
    rotated: 'Key rotated',
    copied: 'Key copied',
    copyFailed: 'Copy the key above before closing.',
  },
  errorsTitle: 'Errors',
} as const

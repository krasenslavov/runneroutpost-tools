/** Caps and limits. They live here, never inline. See docs/BRIEF.md ("Billing: free and paid"). */
export const LIMITS = {
  free: {
    /** A free (individual) group holds up to this many members. */
    members: 10,
    upcomingRuns: 4,
    weeklyRepeats: 2,
    /** Routes are view only on the free tier. */
    routeUpload: false,
    /** Bulk schedule import, calendar-file import and group import are Pro. */
    bulkImport: false,
    publicRuns: false,
    /** Logo and accent colour on the invite page. */
    brandedInvite: false,
    /** The RSVP history and its CSV export. */
    rsvpHistory: false,
  },
  pro: {
    /** Members included in the Pro subscription; each one above this is billed as an extra member. */
    includedMembers: 25,
    /** No cap on extra members: a group of 500 pays for 475 extra members. */
    maxMembers: null,
    coAdmins: 0,
    routeUpload: true,
    bulkImport: true,
    publicRuns: true,
    brandedInvite: true,
    rsvpHistory: true,
  },
  group: {
    nameMaxLength: 60,
    areaMaxLength: 60,
    firstNameMaxLength: 30,
  },
  /** Fixed windows, per caller. Keys are built in the route handlers; see src/lib/rate-limit.ts. */
  rate: {
    createGroup: { max: 5, windowS: 3600 },
    joinGroup: { max: 20, windowS: 3600 },
    /** Counted per signed-in account as well as per address, so one account cannot spam many groups. */
    joinGroupDevice: { max: 10, windowS: 3600 },
    /** Posting runs and answering "I'm coming", per device. */
    postRun: { max: 20, windowS: 86400 },
    rsvp: { max: 120, windowS: 3600 },
    /** Admin tools and edits, per address. */
    admin: { max: 300, windowS: 3600 },
    /** Place and member search, per device. */
    find: { max: 60, windowS: 3600 },
    /** Imports and exports, per address. */
    importExport: { max: 30, windowS: 3600 },
    /** Turning reminders on or off, per device and per address. */
    pushDevice: { max: 30, windowS: 3600 },
    listRuns: { max: 240, windowS: 3600 },
    /** Reports, per device and per address. */
    report: { max: 10, windowS: 86400 },
    /** Public map views, route fetches and reports, per address. */
    publicRead: { max: 600, windowS: 3600 },
    /** Every moderator request, per address. */
    moderation: { max: 120, windowS: 3600 },
  },
  report: { reasonMaxLength: 500 },
  /** The group logo, after the browser shrank it: a small PNG, JPEG or WebP. */
  logo: { maxBytes: 150 * 1024 },
  /** Routes: a drawn or uploaded line, kept small and without time or elevation. */
  route: {
    maxPoints: 500,
    /** A GPX file bigger than this is refused before it is read. */
    maxFileBytes: 2 * 1024 * 1024,
    maxKm: 150,
    /** Tolerance when thinning a line, in metres; it grows until the point cap is met. */
    simplifyToleranceM: 5,
    /** "Hide the first and last 200 m": cut from each end before the line is stored. */
    hideEndsM: 200,
  },
  /** Import and export: every file and every list has a cap, and a preview comes before saving. */
  import: {
    maxRows: 50,
    maxNames: 200,
    maxFileBytes: 1024 * 1024,
    maxTextChars: 20000,
  },
  run: {
    noteMaxLength: 500,
    titleMaxLength: 80,
  },
} as const;

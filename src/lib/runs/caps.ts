import { LIMITS } from "@/config/limits";

/** Run caps for a group: a free group (no owner) is limited, a Pro owner's is not. */
export function runCaps(group: { ownerId: string | null }) {
  const free = group.ownerId === null;
  return {
    upcomingRuns: free ? LIMITS.free.upcomingRuns : null,
    weeklyRepeats: free ? LIMITS.free.weeklyRepeats : null,
    bulkImport: free ? LIMITS.free.bulkImport : LIMITS.pro.bulkImport,
    publicRuns: free ? LIMITS.free.publicRuns : LIMITS.pro.publicRuns,
    brandedInvite: free ? LIMITS.free.brandedInvite : LIMITS.pro.brandedInvite,
    rsvpHistory: free ? LIMITS.free.rsvpHistory : LIMITS.pro.rsvpHistory,
    routeUpload: free ? LIMITS.free.routeUpload : LIMITS.pro.routeUpload,
  };
}

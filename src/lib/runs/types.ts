import type { Effort } from "@/config/runs";

/** A run as the Map screen receives it from GET /api/runs. `startsAt` is the next occurrence. */
export type RunItem = {
  id: string;
  groupId: string;
  groupName: string;
  author: string | null;
  mine: boolean;
  title: string;
  placeName: string | null;
  /** Near its poster's Home: lat and lng are the centre of a HOME_HIDE_M area, not the exact spot. */
  approx?: boolean;
  lat: number;
  lng: number;
  startsAt: string;
  tz: string;
  paceMin: number | null;
  paceMax: number | null;
  effort: Effort;
  distanceKm: number | null;
  note: string | null;
  repeatWeekly: boolean;
  /** Last day (YYYY-MM-DD) a weekly run happens, or null. */
  repeatUntil: string | null;
  /** Length of the route in km, or null when the run has none. */
  routeKm: number | null;
  status: "active" | "cancelled";
  going: string[];
  imComing: boolean;
};

export type GroupItem = {
  id: string;
  name: string;
  memberId: string;
  firstName: string;
  colour: string;
  isAdmin: boolean;
  /** Pro groups can add routes; free groups can only see them. */
  canRoute: boolean;
  /** True for a group with an owner on a paid plan; free groups carry the small RunnerOutpost mark. */
  pro: boolean;
  /** Pro group whose admin switched public runs on (only matters while public search is on). */
  allowPublic: boolean;
};

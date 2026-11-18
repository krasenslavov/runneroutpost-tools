/**
 * Map styles: the OpenFreeMap "liberty" style recoloured to our paper and ink (files in
 * public/map). Tiles and fonts still come from OpenFreeMap (https://openfreemap.org), free and
 * without a key. The credit ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") comes from the
 * style and must stay visible. The service has no guarantee: to swap or self-host, change the
 * style files. Keep the provider in docs/PROCESSORS.md.
 */
export const MAP_STYLES = {
  light: "/map/runneroutpost-light.json",
  dark: "/map/runneroutpost-dark.json",
} as const;

/** Where the map starts when there is no run to show: a wide view of Europe. */
export const MAP_START = { lng: 8, lat: 47, zoom: 3.5 } as const;

/** Pins closer than this many pixels join a cluster until the map is zoomed in. */
export const CLUSTER_RADIUS_PX = 50;
export const CLUSTER_MAX_ZOOM = 14;
/** The zoom a pin or the "locate me" button flies to. */
export const FLY_TO_ZOOM = 14;

/**
 * A runner's Home pin hides everything within this many metres: a run that starts this close to
 * Home shows other people only an area of this radius, never the exact spot. Free and Pro alike.
 */
export const HOME_HIDE_M = 500;

/** From this zoom on, the map draws the routes of every run shown, with no need to open one. */
export const ROUTES_MIN_ZOOM = 11;

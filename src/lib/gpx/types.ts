/** One recorded position. `time` is Unix milliseconds. */
export type TrackPoint = {
  lat: number;
  lon: number;
  ele: number | null;
  time: number | null;
};

export type Split = {
  /** 1-based kilometre. The last split may cover less than a kilometre. */
  km: number;
  distanceM: number;
  /** Moving seconds spent in this split, or null when the file has no timestamps. */
  timeS: number | null;
  /** Seconds per kilometre, scaled for a partial last split. */
  paceSPerKm: number | null;
  gainM: number;
};

/** [kilometre, elevation in metres, elapsed seconds since the start]. */
export type ProfileSample = [number, number | null, number | null];

export type TrackAnalysis = {
  pointsCount: number;
  /** ISO 8601, or null when the file has no timestamps. */
  startTime: string | null;
  distanceM: number;
  elevationGainM: number;
  /** Wall-clock seconds from first to last point. */
  elapsedTimeS: number | null;
  /** Elapsed time minus stops. */
  movingTimeS: number | null;
  splits: Split[];
  profile: ProfileSample[];
  /** Simplified route as GeoJSON-order [lon, lat] pairs. */
  line: [number, number][];
};

export type GpxErrorCode = "tooLarge" | "invalidXml" | "noPoints" | "tooFewPoints";

export class GpxError extends Error {
  constructor(public readonly code: GpxErrorCode) {
    super(code);
    this.name = "GpxError";
  }
}

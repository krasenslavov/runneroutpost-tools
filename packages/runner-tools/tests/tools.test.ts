import { describe, expect, it } from "vitest";
import {
  daylight,
  formatDuration,
  meetingTimes,
  paceWindow,
  parsePace,
  parseSchedule,
  routeStats,
  scheduleToIcs,
  trimGpx,
} from "../src/index";

const NOW = new Date("2026-11-16T10:00:00Z");

describe("parseSchedule", () => {
  it("reads a five-line weekly schedule in the group's time zone", () => {
    const { runs, problems } = parseSchedule(
      [
        "Tuesday 18:30 Track intervals @ Stade Pierre hard 4:45-5:15/km 8 km",
        "Thu 6:30pm Tempo @ Quai",
        "Sat 8am Long run @ Lake pier easy until 2027-03-31",
        "Sunday 09:00 Recovery jog",
        "Wed 7:00 Hills @ Parc",
      ].join("\n"),
      { timeZone: "Europe/Zurich", now: NOW },
    );
    expect(problems).toEqual([]);
    expect(runs).toHaveLength(5);
    expect(runs[0]).toMatchObject({
      title: "Track intervals",
      place: "Stade Pierre",
      distanceKm: 8,
      timeZone: "Europe/Zurich",
    });
    // 18:30 in Zurich in November is 17:30 UTC.
    expect(runs[0]!.startsAt).toBe("2026-11-17T17:30:00.000Z");
    expect(runs[2]!.repeatUntil).toBe("2027-03-31");
  });
  it("returns lines it cannot read, with a reason", () => {
    const { runs, problems } = parseSchedule("Someday 18:30 Run\nTuesday Run", {
      timeZone: "UTC",
      now: NOW,
    });
    expect(runs).toEqual([]);
    expect(problems.map((p) => p.line)).toEqual([1, 2]);
    expect(problems[0]!.reason).toMatch(/weekday/i);
  });
  it("refuses an unknown time zone", () => {
    expect(() => parseSchedule("Tue 18:00 Run", { timeZone: "Mars/Base" })).toThrow(RangeError);
  });
});

describe("scheduleToIcs", () => {
  const { runs } = parseSchedule("Tuesday 18:30 Track @ Stade Pierre 8 km", {
    timeZone: "Europe/Zurich",
    now: NOW,
  });
  const ics = scheduleToIcs(runs, { name: "Club runs", weeks: 4, now: NOW });
  it("is a valid calendar with CRLF line endings and weekly dates", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Club runs");
    expect(ics).toContain("DTSTART:20261117T173000Z");
    expect(ics).toContain("SUMMARY:Track");
    expect(ics).toContain("LOCATION:Stade Pierre");
    expect(ics.match(/RDATE:(.*)/)![1]!.split(",")).toHaveLength(3);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("keeps the local time across a clock change by listing each date in UTC", () => {
    const run = parseSchedule("Sunday 08:00 Long run", {
      timeZone: "Europe/Zurich",
      now: new Date("2027-03-01T00:00:00Z"),
    }).runs;
    const out = scheduleToIcs(run, { weeks: 6, now: NOW });
    // Clocks go forward on 28 March 2027: 08:00 is 07:00 UTC before and 06:00 UTC after.
    expect(out).toContain("DTSTART:20270307T070000Z");
    expect(out).toContain("20270328T060000Z");
  });
  it("escapes commas and semicolons in text", () => {
    const out = scheduleToIcs(
      [{ title: "Run, jog; chat", startsAt: "2027-01-05T07:00:00.000Z", timeZone: "UTC" }],
      { now: NOW },
    );
    expect(out).toContain("SUMMARY:Run\\, jog\; chat");
  });
});

// A straight 1 km track along a meridian with time, elevation and heart rate in every point.
const point = (i: number) =>
  `<trkpt lat="${(46.2 + i * 0.0001).toFixed(6)}" lon="6.1"><ele>${400 + i}</ele><time>2026-11-01T07:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z</time><extensions><hr>150</hr></extensions></trkpt>`;
const gpx = (n: number) =>
  `<?xml version="1.0"?><gpx version="1.1"><wpt lat="46.2" lon="6.1"><name>Home</name></wpt><trk><name>Run</name><trkseg>${Array.from({ length: n }, (_, i) => point(i)).join("")}</trkseg></trk></gpx>`;

describe("trimGpx", () => {
  it("cuts both ends and writes only latitude and longitude", () => {
    const r = trimGpx(gpx(100), { meters: 200 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 100 points 0.0001 deg apart is about 1.1 km; 200 m off each end leaves about 0.7 km.
    expect(r.km).toBeGreaterThan(1);
    expect(r.trimmedKm).toBeGreaterThan(0.6);
    expect(r.trimmedKm).toBeLessThan(0.75);
    expect(r.hadTimeOrElevation).toBe(true);
    expect(r.gpx).not.toMatch(/<ele>|<time>|<hr>|<wpt|Home/);
    // The first point written is further from the start than 200 m.
    const first = Number(/<trkpt lat="([\d.]+)"/.exec(r.gpx)![1]);
    expect((first - 46.2) * 111_320).toBeGreaterThan(195);
  });
  it("says so when the route is too short to hide its ends", () => {
    expect(trimGpx(gpx(20), { meters: 200 })).toEqual({ ok: false, reason: "tooShort" });
  });
  it("refuses a file that is not GPX or has no track", () => {
    expect(trimGpx("not xml at all").ok).toBe(false);
    expect(trimGpx(`<gpx version="1.1"></gpx>`)).toEqual({ ok: false, reason: "empty" });
  });
  it("trims by a chosen distance, and zero keeps the whole route", () => {
    const whole = trimGpx(gpx(100), { meters: 0 });
    expect(whole.ok && whole.trimmedKm).toBeCloseTo(whole.ok ? whole.km : 0, 1);
  });
});

describe("meetingTimes", () => {
  it("shows one moment in several zones, with the day shift", () => {
    const r = meetingTimes({ date: "2026-12-05", time: "08:00", timeZone: "Europe/Zurich" }, [
      "America/Los_Angeles",
      "Pacific/Auckland",
    ]);
    expect(r.startsAt).toBe("2026-12-05T07:00:00.000Z");
    expect(r.times.map((t) => t.timeZone)).toEqual([
      "Europe/Zurich",
      "America/Los_Angeles",
      "Pacific/Auckland",
    ]);
    expect(r.times[1]!.local).toContain("23:00");
    expect(r.times[1]!.dayShift).toBe(-1);
    expect(r.times[2]!.dayShift).toBe(0);
    expect(r.times[2]!.local).toContain("20:00");
  });
  it("writes a message for the chat", () => {
    const r = meetingTimes({ date: "2026-12-05", time: "08:00", timeZone: "Europe/Zurich" }, [
      "America/New_York",
    ]);
    expect(r.message("the lake pier")).toMatch(
      /^Run at the lake pier:\nEurope\/Zurich: .*08:00\nAmerica\/New York: .*02:00$/,
    );
  });
  it("uses daylight saving rules of each zone", () => {
    const winter = meetingTimes({ date: "2027-01-10", time: "12:00", timeZone: "UTC" }, [
      "Europe/London",
    ]);
    const summer = meetingTimes({ date: "2027-07-10", time: "12:00", timeZone: "UTC" }, [
      "Europe/London",
    ]);
    expect(winter.times[1]!.local).toContain("12:00");
    expect(summer.times[1]!.local).toContain("13:00");
  });
  it("throws on bad input", () => {
    expect(() => meetingTimes({ date: "2026-13-40", time: "25:00", timeZone: "UTC" }, [])).toThrow(
      RangeError,
    );
    expect(() =>
      meetingTimes({ date: "2026-12-05", time: "08:00", timeZone: "Nope/Zone" }, []),
    ).toThrow(RangeError);
  });
});

describe("paceWindow", () => {
  it("turns a pace range into a finish-time window and splits", () => {
    const w = paceWindow(10, 300, 360)!;
    expect(w.fastSeconds).toBe(3000);
    expect(w.slowSeconds).toBe(3600);
    expect(w.gapSeconds).toBe(600);
    expect(w.fastKmh).toBeCloseTo(12, 5);
    expect(w.splits).toHaveLength(10);
    expect(w.splits[4]).toEqual({ km: 5, fastSeconds: 1500, slowSeconds: 1800 });
  });
  it("splits by the mile when asked", () => {
    const w = paceWindow(10, 300, 300, 1.609344)!;
    expect(w.splits).toHaveLength(6);
  });
  it("refuses numbers that make no sense", () => {
    expect(paceWindow(0, 300, 360)).toBeNull();
    expect(paceWindow(10, 360, 300)).toBeNull();
    expect(paceWindow(10, 0, 300)).toBeNull();
    expect(paceWindow(5000, 300, 360)).toBeNull();
  });
  it("reads and writes paces and durations", () => {
    expect(parsePace("4:45")).toBe(285);
    expect(parsePace("5:30/km")).toBe(330);
    expect(parsePace("5:30 per mile")).toBe(330);
    expect(parsePace("5:75")).toBeNull();
    expect(parsePace("fast")).toBeNull();
    expect(formatDuration(3000)).toBe("50:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

const gpxOf = (pts: [number, number, number?][]) =>
  `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${pts
    .map(
      ([la, lo, e]) =>
        `<trkpt lat="${la}" lon="${lo}">${e === undefined ? "" : `<ele>${e}</ele>`}</trkpt>`,
    )
    .join("")}</trkseg></trk></gpx>`;

describe("routeStats", () => {
  it("measures distance, climb and descent, and ignores small wobbles", () => {
    const r = routeStats(
      gpxOf([
        [47.0, 8.0, 400],
        [47.001, 8.0, 401],
        [47.002, 8.0, 430],
        [47.003, 8.0, 420],
        [47.004, 8.0, 440],
      ]),
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.km).toBeCloseTo(0.445, 2);
    expect(r.highM).toBe(440);
    expect(r.lowM).toBe(400);
    expect(r.gainM).toBeCloseTo(30 + 20, 5);
    expect(r.lossM).toBeCloseTo(10, 5);
    expect(r.loop).toBe(false);
  });
  it("says when a route is a loop, and when the file has no elevation", () => {
    const r = routeStats(
      gpxOf([
        [47, 8],
        [47.01, 8],
        [47.01, 8.01],
        [47.0001, 8.0001],
      ]),
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.loop).toBe(true);
    expect(r.gainM).toBeNull();
    expect(r.highM).toBeNull();
  });
  it("returns a reason for a bad file", () => {
    expect(routeStats("not xml at all")).toMatchObject({ ok: false });
    expect(routeStats(gpxOf([[47, 8]]))).toEqual({ ok: false, reason: "empty" });
  });
});

describe("daylight", () => {
  const minutesOf = (iso: string | null, tz: string) => {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso!));
    const [h, m] = p.split(":").map(Number);
    return h! * 60 + m!;
  };
  it("finds sunrise and sunset within a few minutes (Zurich, midsummer)", () => {
    const r = daylight({
      lat: 47.3769,
      lon: 8.5417,
      date: "2026-06-21",
      time: "12:00",
      timeZone: "Europe/Zurich",
      runMinutes: 60,
    });
    expect(Math.abs(minutesOf(r.sunrise, "Europe/Zurich") - (5 * 60 + 28))).toBeLessThanOrEqual(4);
    // Day length at 47.4 N on the solstice is about 15 h 58 min.
    const day = (Date.parse(r.sunset!) - Date.parse(r.sunrise!)) / 60000;
    expect(day).toBeGreaterThan(15 * 60 + 55);
    expect(day).toBeLessThan(16 * 60 + 2);
    expect(r.minutes).toEqual({ total: 60, daylight: 60, twilight: 0, dark: 0 });
  });
  it("finds sunrise and sunset within a few minutes (London, midwinter)", () => {
    const r = daylight({
      lat: 51.5074,
      lon: -0.1278,
      date: "2026-12-21",
      time: "12:00",
      timeZone: "Europe/London",
      runMinutes: 30,
    });
    expect(Math.abs(minutesOf(r.sunrise, "Europe/London") - (8 * 60 + 4))).toBeLessThanOrEqual(4);
    expect(Math.abs(minutesOf(r.sunset, "Europe/London") - (15 * 60 + 53))).toBeLessThanOrEqual(4);
  });
  it("splits an evening run into daylight, twilight and dark", () => {
    const r = daylight({
      lat: 51.5074,
      lon: -0.1278,
      date: "2026-12-21",
      time: "15:30",
      timeZone: "Europe/London",
      runMinutes: 90,
    });
    expect(r.minutes.total).toBe(90);
    expect(r.minutes.daylight + r.minutes.twilight + r.minutes.dark).toBeGreaterThanOrEqual(89);
    expect(r.minutes.daylight).toBeGreaterThan(15);
    expect(r.minutes.twilight).toBeGreaterThan(20);
    expect(r.minutes.dark).toBeGreaterThan(15);
  });
  it("handles a 6 am winter run as dark, and the polar day and night", () => {
    const dark = daylight({
      lat: 51.5074,
      lon: -0.1278,
      date: "2026-12-21",
      time: "06:00",
      timeZone: "Europe/London",
      runMinutes: 45,
    });
    expect(dark.minutes.dark).toBe(45);
    const day = daylight({
      lat: 69.65,
      lon: 18.96,
      date: "2026-06-21",
      time: "23:30",
      timeZone: "Europe/Oslo",
      runMinutes: 60,
    });
    expect(day.sun).toBe("day");
    expect(day.sunrise).toBeNull();
    expect(day.minutes.daylight).toBe(60);
    const night = daylight({
      lat: 69.65,
      lon: 18.96,
      date: "2026-12-21",
      time: "03:00",
      timeZone: "Europe/Oslo",
      runMinutes: 60,
    });
    expect(night.sun).toBe("night");
    expect(night.minutes.daylight).toBe(0);
  });
  it("throws on a bad place or zone", () => {
    const base = { date: "2026-06-21", time: "08:00", timeZone: "UTC", runMinutes: 30 };
    expect(() => daylight({ ...base, lat: 95, lon: 0 })).toThrow(RangeError);
    expect(() => daylight({ ...base, lat: 0, lon: 0, timeZone: "Mars/Base" })).toThrow(RangeError);
    expect(() => daylight({ ...base, lat: 0, lon: 0, runMinutes: 0 })).toThrow(RangeError);
  });
});

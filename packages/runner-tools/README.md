# runneroutpost-tools

Small tools for running groups. They run in the browser, Node or an extension, send nothing anywhere and store nothing. The same code is behind the free tools on the [RunnerOutpost blog](https://blog.runneroutpost.com/tools/).

```ts
import {
  parseSchedule,
  scheduleToIcs,
  trimGpx,
  meetingTimes,
  paceWindow,
  routeStats,
  daylight,
} from "runneroutpost-tools";

// A pasted weekly schedule to a calendar file.
const { runs, problems } = parseSchedule("Tuesday 18:30 Track @ Stade Pierre 8 km", {
  timeZone: "Europe/Zurich",
});
const ics = scheduleToIcs(runs, { name: "Club runs", weeks: 26 });

// Hide the first and last 200 m of a route; time, elevation and waypoints are dropped.
const result = trimGpx(gpxText, { meters: 200 });
if (result.ok) save(result.gpx);

// One meeting time in other time zones, and a message for the chat.
const m = meetingTimes({ date: "2026-12-05", time: "08:00", timeZone: "Europe/Zurich" }, [
  "America/New_York",
]);
console.log(m.message("the lake pier"));

// A pace range (seconds per km) over 10 km: the finish-time window and the splits.
const w = paceWindow(10, 300, 360);

// Distance, climb, descent, high and low point, and loop or not, from a GPX file.
const stats = routeStats(gpxText);

// Sunrise, sunset and twilight, and the minutes of a run that fall in the dark.
const light = daylight({
  lat: 47.37,
  lon: 8.54,
  date: "2026-11-17",
  time: "18:30",
  timeZone: "Europe/Zurich",
  runMinutes: 60,
});
```

In a web page, `runneroutpost-tools/browser` fills every element with `data-tool="schedule-to-calendar"`, `"gpx-privacy-trimmer"`, `"meeting-time-planner"`, `"pace-calculator"`, `"gpx-route-stats"` or `"daylight-check"` with a ready form.

MIT licence. RunnerOutpost is a private app for running groups: https://runneroutpost.com

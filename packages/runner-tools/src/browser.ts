/**
 * The six tools as small forms. One file serves the blog's tool pages, the embed pages and the
 * browser extension popup. Everything runs in the page: nothing is uploaded, nothing is stored and
 * nothing is sent anywhere. Mount with `mountTools()`; each element with `data-tool="<slug>"` gets its tool.
 */
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
} from "./index";

type Mount = (root: HTMLElement) => void;

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Puts markup into an element by parsing it first and then moving the parsed nodes in, instead of
 * assigning to innerHTML (browser add-on reviewers flag every innerHTML assignment). Every value that
 * comes from the user is escaped with `esc` before it reaches the markup, as before.
 */
function setHtml(el: Element, markup: string): void {
  const doc = new DOMParser().parseFromString(`<body>${markup}</body>`, "text/html");
  el.replaceChildren(
    ...Array.from(doc.body.childNodes).map((node) => document.importNode(node, true)),
  );
}

let counter = 0;
const uid = () => `rt-tool-${++counter}`;

function zones(): string[] {
  const list = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone");
  return list && list.length > 0
    ? list
    : [
        "UTC",
        "Europe/London",
        "Europe/Zurich",
        "America/New_York",
        "America/Los_Angeles",
        "Australia/Sydney",
      ];
}
const myZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function zoneOptions(selected: string): string {
  const all = zones();
  if (!all.includes(selected)) all.unshift(selected);
  return all
    .map(
      (z) =>
        `<option value="${esc(z)}"${z === selected ? " selected" : ""}>${esc(z.replace(/_/g, " "))}</option>`,
    )
    .join("");
}

function download(name: string, type: string, text: string): string {
  const url = URL.createObjectURL(new Blob([text], { type }));
  return `<a class="btn" download="${esc(name)}" href="${url}">Download ${esc(name)}</a>`;
}

const scheduleTool: Mount = (root) => {
  const id = uid();
  setHtml(
    root,
    `
<form class="tool-form" novalidate>
  <label for="${id}-text">Your weekly schedule, one run per line</label>
  <textarea id="${id}-text" rows="6" spellcheck="false" placeholder="Tuesday 18:30 Track intervals @ Stade Pierre 8 km&#10;Sat 8am Long run @ Lake pier easy"></textarea>
  <div class="tool-row">
    <div><label for="${id}-tz">Time zone</label><select id="${id}-tz">${zoneOptions(myZone())}</select></div>
    <div><label for="${id}-weeks">Weeks to add</label><select id="${id}-weeks"><option>8</option><option selected>26</option><option>52</option></select></div>
    <div><label for="${id}-name">Calendar name</label><input id="${id}-name" value="Group runs" maxlength="60"></div>
  </div>
</form>
<div class="tool-out" role="status" aria-live="polite"></div>`,
  );
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const text = q<HTMLTextAreaElement>("textarea");
  const tz = q<HTMLSelectElement>(`#${id}-tz`);
  const weeks = q<HTMLSelectElement>(`#${id}-weeks`);
  const name = q<HTMLInputElement>(`#${id}-name`);
  const out = q<HTMLElement>(".tool-out");
  const update = () => {
    if (!text.value.trim()) {
      out.replaceChildren();
      return;
    }
    const { runs, problems } = parseSchedule(text.value, { timeZone: tz.value });
    const day = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz.value,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const list = runs
      .map(
        (r) =>
          `<li><strong>${esc(r.title)}</strong>, every ${esc(day.format(new Date(r.startsAt)))}${r.place ? ` at ${esc(r.place)}` : ""}${r.distanceKm ? `, ${r.distanceKm} km` : ""}</li>`,
      )
      .join("");
    const bad = problems.map((p) => `<li>Line ${p.line}: ${esc(p.reason)}</li>`).join("");
    const file = runs.length
      ? download(
          "group-runs.ics",
          "text/calendar",
          scheduleToIcs(runs, {
            name: name.value.trim() || "Group runs",
            weeks: Number(weeks.value),
          }),
        )
      : "";
    setHtml(
      out,
      `${list ? `<ul class="tool-list">${list}</ul>` : ""}${bad ? `<ul class="tool-problems">${bad}</ul>` : ""}${file}`,
    );
  };
  for (const el of [text, tz, weeks, name]) el.addEventListener("input", update);
};

const gpxTool: Mount = (root) => {
  const id = uid();
  setHtml(
    root,
    `
<form class="tool-form" novalidate>
  <label for="${id}-file">GPX file</label>
  <input id="${id}-file" type="file" accept=".gpx,application/gpx+xml,text/xml,application/xml">
  <div class="tool-row"><div><label for="${id}-m">Hide this many metres at each end</label><input id="${id}-m" type="number" min="0" max="5000" step="50" value="200" inputmode="numeric"></div></div>
</form>
<div class="tool-out" role="status" aria-live="polite"></div>`,
  );
  const file = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const meters = root.querySelector<HTMLInputElement>('input[type="number"]')!;
  const out = root.querySelector<HTMLElement>(".tool-out")!;
  let source = "";
  let fileName = "route";
  const update = () => {
    if (!source) return;
    const r = trimGpx(source, { meters: Number(meters.value) });
    if (!r.ok) {
      const why = {
        invalid: "That does not look like a GPX file.",
        empty: "No track points were found in this file.",
        tooShort: "This route is too short to hide that much at both ends. Try a smaller number.",
        tooLarge: "This file is too large.",
      }[r.reason];
      setHtml(out, `<p class="tool-problems">${why}</p>`);
      return;
    }
    setHtml(
      out,
      `<p>Route ${r.km.toFixed(1)} km, ${r.trimmedKm.toFixed(1)} km left after hiding both ends. ${r.hadTimeOrElevation ? "Time and elevation were removed." : "The file had no time or elevation."} Waypoints were removed too.</p>${download(`${fileName}-trimmed.gpx`, "application/gpx+xml", r.gpx)}`,
    );
  };
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    fileName =
      f.name
        .replace(/\.gpx$/i, "")
        .replace(/[^\w-]+/g, "-")
        .slice(0, 40) || "route";
    source = await f.text();
    update();
  });
  meters.addEventListener("input", update);
};

const meetingTool: Mount = (root) => {
  const id = uid();
  const mine = myZone();
  const today = new Date().toISOString().slice(0, 10);
  setHtml(
    root,
    `
<form class="tool-form" novalidate>
  <div class="tool-row">
    <div><label for="${id}-d">Date</label><input id="${id}-d" type="date" value="${today}"></div>
    <div><label for="${id}-t">Time</label><input id="${id}-t" type="time" value="08:00"></div>
    <div><label for="${id}-z">Time zone</label><select id="${id}-z">${zoneOptions(mine)}</select></div>
  </div>
  <label for="${id}-o">Other time zones, separated by commas</label>
  <input id="${id}-o" list="${id}-list" value="America/New_York, Europe/London, Australia/Sydney" spellcheck="false" autocomplete="off">
  <datalist id="${id}-list">${zones()
    .map((z) => `<option value="${esc(z)}">`)
    .join("")}</datalist>
  <label for="${id}-p">Meeting place (optional)</label>
  <input id="${id}-p" maxlength="80" placeholder="the lake pier">
</form>
<div class="tool-out" role="status" aria-live="polite"></div>`,
  );
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const date = q<HTMLInputElement>(`#${id}-d`);
  const time = q<HTMLInputElement>(`#${id}-t`);
  const zone = q<HTMLSelectElement>(`#${id}-z`);
  const others = q<HTMLInputElement>(`#${id}-o`);
  const place = q<HTMLInputElement>(`#${id}-p`);
  const out = q<HTMLElement>(".tool-out");
  const update = () => {
    try {
      const list = others.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const bad = list.filter((z) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: z });
          return false;
        } catch {
          return true;
        }
      });
      const r = meetingTimes(
        { date: date.value, time: time.value, timeZone: zone.value },
        list.filter((z) => !bad.includes(z)),
      );
      const rows = r.times
        .map(
          (t) =>
            `<tr><th scope="row">${esc(t.timeZone.replace(/_/g, " "))}</th><td>${esc(t.local)}${t.dayShift ? ` <small>(${t.dayShift > 0 ? "next day" : "day before"})</small>` : ""}</td></tr>`,
        )
        .join("");
      setHtml(
        out,
        `<table class="tool-table"><tbody>${rows}</tbody></table>${bad.length ? `<p class="tool-problems">Unknown time zone: ${bad.map(esc).join(", ")}</p>` : ""}<button type="button" class="btn" data-copy>Copy message for the chat</button><span class="tool-copied" hidden> Copied.</span>`,
      );
      out.querySelector<HTMLButtonElement>("[data-copy]")!.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(r.message(place.value.trim() || undefined));
          out.querySelector<HTMLElement>(".tool-copied")!.hidden = false;
        } catch {
          /* clipboard blocked: the table is still on screen */
        }
      });
    } catch {
      setHtml(out, `<p class="tool-problems">Enter a date, a time and a time zone.</p>`);
    }
  };
  for (const el of [date, time, zone, others, place]) el.addEventListener("input", update);
  update();
};

const KM_PER_MILE = 1.609344;

const paceTool: Mount = (root) => {
  const id = uid();
  setHtml(
    root,
    `
<form class="tool-form" novalidate>
  <div class="tool-row">
    <div><label for="${id}-d">Distance</label><input id="${id}-d" type="number" inputmode="decimal" min="0" step="any" value="10"></div>
    <div><label for="${id}-u">Unit</label><select id="${id}-u"><option value="km" selected>Kilometres</option><option value="mi">Miles</option></select></div>
    <div><label for="${id}-p">Common distances</label><select id="${id}-p"><option value="">Choose one</option><option value="5">5K</option><option value="10">10K</option><option value="21.0975">Half marathon</option><option value="42.195">Marathon</option></select></div>
  </div>
  <div class="tool-row">
    <div><label for="${id}-f">Quickest pace (m:ss)</label><input id="${id}-f" value="5:00" inputmode="numeric" autocomplete="off" spellcheck="false"></div>
    <div><label for="${id}-s">Slowest pace (m:ss)</label><input id="${id}-s" value="6:00" inputmode="numeric" autocomplete="off" spellcheck="false"></div>
  </div>
</form>
<div class="tool-out" role="status" aria-live="polite"></div>`,
  );
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const dist = q<HTMLInputElement>(`#${id}-d`);
  const unit = q<HTMLSelectElement>(`#${id}-u`);
  const preset = q<HTMLSelectElement>(`#${id}-p`);
  const fast = q<HTMLInputElement>(`#${id}-f`);
  const slow = q<HTMLInputElement>(`#${id}-s`);
  const out = q<HTMLElement>(".tool-out");
  const update = () => {
    const miles = unit.value === "mi";
    const per = miles ? KM_PER_MILE : 1;
    const f = parsePace(fast.value);
    const sl = parsePace(slow.value);
    const d = Number(dist.value);
    if (f === null || sl === null) {
      setHtml(
        out,
        `<p class="tool-problems">Write each pace as minutes and seconds, such as 5:30.</p>`,
      );
      return;
    }
    const w = paceWindow(d * per, f / per, sl / per, per);
    if (!w) {
      setHtml(
        out,
        `<p class="tool-problems">Enter a distance, and a quickest pace that is not slower than the slowest.</p>`,
      );
      return;
    }
    const kmh = (v: number) => (miles ? v / KM_PER_MILE : v).toFixed(1);
    const label = miles ? "mile" : "km";
    const rows = w.splits
      .map(
        (r) =>
          `<tr><th scope="row">${label} ${Math.round(r.km / per)}</th><td>${formatDuration(r.fastSeconds)}</td><td>${formatDuration(r.slowSeconds)}</td></tr>`,
      )
      .join("");
    setHtml(
      out,
      `<p><strong>${formatDuration(w.fastSeconds)}</strong> to <strong>${formatDuration(w.slowSeconds)}</strong> for ${esc(String(d))} ${miles ? "miles" : "km"}. The group finishes ${formatDuration(w.gapSeconds)} apart, at ${kmh(w.fastKmh)} to ${kmh(w.slowKmh)} ${miles ? "mph" : "km/h"}.</p>
<table class="tool-table"><thead><tr><th scope="col">Split</th><th scope="col">Quickest</th><th scope="col">Slowest</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  };
  preset.addEventListener("change", () => {
    if (!preset.value) return;
    const km = Number(preset.value);
    dist.value = String(miles(unit.value) ? Math.round((km / KM_PER_MILE) * 100) / 100 : km);
    update();
  });
  const miles = (v: string) => v === "mi";
  for (const el of [dist, unit, fast, slow]) el.addEventListener("input", update);
  update();
};

const statsTool: Mount = (root) => {
  const id = uid();
  setHtml(
    root,
    `
<form class="tool-form" novalidate>
  <label for="${id}-file">GPX file</label>
  <input id="${id}-file" type="file" accept=".gpx,application/gpx+xml,text/xml,application/xml">
</form>
<div class="tool-out" role="status" aria-live="polite"></div>`,
  );
  const file = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const out = root.querySelector<HTMLElement>(".tool-out")!;
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    const r = routeStats(await f.text());
    if (!r.ok) {
      const why = {
        invalid: "That does not look like a GPX file.",
        empty: "No track points were found in this file.",
        tooLarge: "This file is too large.",
      }[r.reason];
      setHtml(out, `<p class="tool-problems">${why}</p>`);
      return;
    }
    const m = (v: number | null) => (v === null ? "not in this file" : `${Math.round(v)} m`);
    setHtml(
      out,
      `<table class="tool-table"><tbody>
<tr><th scope="row">Distance</th><td>${r.km.toFixed(2)} km (${(r.km / KM_PER_MILE).toFixed(2)} miles)</td></tr>
<tr><th scope="row">Climb</th><td>${m(r.gainM)}</td></tr>
<tr><th scope="row">Descent</th><td>${m(r.lossM)}</td></tr>
<tr><th scope="row">Highest point</th><td>${m(r.highM)}</td></tr>
<tr><th scope="row">Lowest point</th><td>${m(r.lowM)}</td></tr>
<tr><th scope="row">Shape</th><td>${r.loop ? "A loop: it ends where it starts." : `Point to point: the end is ${(r.startEndM / 1000).toFixed(1)} km from the start in a straight line.`}</td></tr>
<tr><th scope="row">Points</th><td>${r.points}</td></tr></tbody></table>
<p class="note">Climb and descent ignore changes under 3 m, which are noise from the watch.</p>`,
    );
  });
};

const daylightTool: Mount = (root) => {
  const id = uid();
  const today = new Date().toISOString().slice(0, 10);
  setHtml(
    root,
    `
<form class="tool-form" novalidate>
  <div class="tool-row">
    <div><label for="${id}-la">Latitude</label><input id="${id}-la" type="number" inputmode="decimal" min="-90" max="90" step="any" placeholder="47.37"></div>
    <div><label for="${id}-lo">Longitude</label><input id="${id}-lo" type="number" inputmode="decimal" min="-180" max="180" step="any" placeholder="8.54"></div>
  </div>
  <div class="tool-row">
    <div><label for="${id}-d">Date</label><input id="${id}-d" type="date" value="${today}"></div>
    <div><label for="${id}-t">Start time</label><input id="${id}-t" type="time" value="18:30"></div>
    <div><label for="${id}-m">Run length (minutes)</label><input id="${id}-m" type="number" inputmode="numeric" min="5" max="600" step="5" value="60"></div>
  </div>
  <label for="${id}-z">Time zone</label><select id="${id}-z">${zoneOptions(myZone())}</select>
</form>
<div class="tool-out" role="status" aria-live="polite"></div>`,
  );
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const lat = q<HTMLInputElement>(`#${id}-la`);
  const lon = q<HTMLInputElement>(`#${id}-lo`);
  const date = q<HTMLInputElement>(`#${id}-d`);
  const time = q<HTMLInputElement>(`#${id}-t`);
  const mins = q<HTMLInputElement>(`#${id}-m`);
  const zone = q<HTMLSelectElement>(`#${id}-z`);
  const out = q<HTMLElement>(".tool-out");
  const update = () => {
    if (lat.value === "" || lon.value === "") {
      setHtml(
        out,
        `<p class="note">Enter the latitude and longitude of the start. A map app shows them when you press and hold a spot. They stay on this page.</p>`,
      );
      return;
    }
    try {
      const r = daylight({
        lat: Number(lat.value),
        lon: Number(lon.value),
        date: date.value,
        time: time.value,
        timeZone: zone.value,
        runMinutes: Number(mins.value),
      });
      const at = (iso: string | null) =>
        iso
          ? new Intl.DateTimeFormat("en-GB", {
              timeZone: zone.value,
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(new Date(iso))
          : "none";
      const k = r.minutes;
      const verdict =
        k.dark === 0 && k.twilight === 0
          ? "The whole run is in daylight."
          : k.dark === 0
            ? `${k.twilight} of ${k.total} minutes are in twilight. There is enough light to run, but bring something reflective.`
            : k.dark === k.total
              ? "The whole run is in the dark. Bring lights and wear something reflective."
              : `${k.dark} of ${k.total} minutes are in the dark. Bring lights and wear something reflective.`;
      const note =
        r.sun === "day"
          ? '<p class="note">The sun does not set on this date at this place.</p>'
          : r.sun === "night"
            ? '<p class="note">The sun does not rise on this date at this place.</p>'
            : "";
      setHtml(
        out,
        `<p><strong>${esc(verdict)}</strong></p>
<table class="tool-table"><tbody>
<tr><th scope="row">First light</th><td>${at(r.dawn)}</td></tr>
<tr><th scope="row">Sunrise</th><td>${at(r.sunrise)}</td></tr>
<tr><th scope="row">Sunset</th><td>${at(r.sunset)}</td></tr>
<tr><th scope="row">Last light</th><td>${at(r.dusk)}</td></tr></tbody></table>${note}
<p class="note">First and last light are when the sun is 6 degrees below the horizon. Times are accurate to a few minutes.</p>`,
      );
    } catch {
      setHtml(
        out,
        `<p class="tool-problems">Enter a place, a date, a start time and a run length.</p>`,
      );
    }
  };
  for (const el of [lat, lon, date, time, mins, zone]) el.addEventListener("input", update);
  update();
};

export const TOOL_MOUNTS: Record<string, Mount> = {
  "schedule-to-calendar": scheduleTool,
  "gpx-privacy-trimmer": gpxTool,
  "meeting-time-planner": meetingTool,
  "pace-calculator": paceTool,
  "gpx-route-stats": statsTool,
  "daylight-check": daylightTool,
};

/** Fills every `[data-tool]` element under `scope` with its tool. Safe to call twice. */
export function mountTools(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>("[data-tool]").forEach((el) => {
    const mount = TOOL_MOUNTS[el.dataset.tool ?? ""];
    if (mount && !el.dataset.mounted) {
      el.dataset.mounted = "1";
      mount(el);
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => mountTools());
  else mountTools();
}

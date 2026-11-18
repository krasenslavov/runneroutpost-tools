// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { mountTools } from "../src/browser";

const type = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = `<div data-tool="schedule-to-calendar"></div><div data-tool="gpx-privacy-trimmer"></div><div data-tool="meeting-time-planner"></div>`;
  URL.createObjectURL = () => "blob:test";
});

describe("browser tools", () => {
  it("fills every tool once, and twice is harmless", () => {
    mountTools();
    mountTools();
    expect(document.querySelectorAll("textarea")).toHaveLength(1);
    expect(document.querySelectorAll("form.tool-form")).toHaveLength(3);
  });

  it("schedule: shows the runs, the lines it cannot read, and a download", () => {
    mountTools();
    const root = document.querySelector<HTMLElement>('[data-tool="schedule-to-calendar"]')!;
    type(root.querySelector("select")!, "Europe/Zurich");
    type(root.querySelector("textarea")!, "Tuesday 18:30 Track @ Pier 8 km\nnonsense line");
    const out = root.querySelector(".tool-out")!;
    expect(out.textContent).toContain("Track");
    expect(out.textContent).toContain("Line 2");
    expect(out.querySelector("a[download]")?.getAttribute("download")).toBe("group-runs.ics");
  });

  it("schedule: escapes what the user typed", () => {
    mountTools();
    const root = document.querySelector<HTMLElement>('[data-tool="schedule-to-calendar"]')!;
    type(
      root.querySelector("textarea")!,
      "Tuesday 18:30 <img src=x onerror=alert(1)> @ <b>Pier</b>",
    );
    expect(root.querySelector(".tool-out img")).toBeNull();
    expect(root.querySelector(".tool-out b")).toBeNull();
  });

  it("meeting planner: lists the zones and flags an unknown one", () => {
    mountTools();
    const root = document.querySelector<HTMLElement>('[data-tool="meeting-time-planner"]')!;
    const inputs = root.querySelectorAll("input");
    type(inputs[0]!, "2026-12-05");
    type(inputs[1]!, "08:00");
    type(root.querySelector("select")!, "Europe/Zurich");
    type(inputs[2]!, "America/Los_Angeles, Mars/Base");
    const text = root.querySelector(".tool-out")!.textContent!;
    expect(text).toContain("23:00");
    expect(text).toContain("day before");
    expect(text).toContain("Unknown time zone: Mars/Base");
  });

  it("makes no network calls", () => {
    const fetched: unknown[] = [];
    (globalThis as { fetch?: unknown }).fetch = (...args: unknown[]) => fetched.push(args);
    mountTools();
    const root = document.querySelector<HTMLElement>('[data-tool="schedule-to-calendar"]')!;
    type(root.querySelector("textarea")!, "Sat 8am Long run");
    expect(fetched).toEqual([]);
  });
});

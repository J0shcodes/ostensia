import { beforeAll, describe, expect, it } from "vitest";
import { formatLocalInstant, formatLocalInstantSeconds, formatUtcInstant, isInPast, localInputToUtcIso, utcIsoToLocalInput } from "./datetime.ts";

// Every expectation here depends on a time zone, so the tests pin one instead of using
// whatever the machine is set to. New York has both daylight-saving edges in 2026
// (8 March forward, 1 November back), which are the cases worth checking.
beforeAll(() => {
  process.env["TZ"] = "America/New_York";
});

describe("localInputToUtcIso", () => {
  it("converts winter time (UTC-5)", () => {
    expect(localInputToUtcIso("2026-11-20T15:30")).toEqual({ ok: true, iso: "2026-11-20T20:30:00.000Z" });
  });

  it("converts summer time (UTC-4)", () => {
    expect(localInputToUtcIso("2026-07-01T12:00")).toEqual({ ok: true, iso: "2026-07-01T16:00:00.000Z" });
  });

  it("accepts seconds when the input has them", () => {
    expect(localInputToUtcIso("2026-11-20T15:30:45")).toEqual({ ok: true, iso: "2026-11-20T20:30:45.000Z" });
  });

  it("reports empty and malformed input", () => {
    expect(localInputToUtcIso("")).toEqual({ ok: false, reason: "empty" });
    expect(localInputToUtcIso("  ")).toEqual({ ok: false, reason: "empty" });
    for (const bad of ["2026-11-20 15:30", "tomorrow", "2026-11-20", "20/11/2026 15:30", "2026-11-20T15"]) {
      expect(localInputToUtcIso(bad)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("rejects a date or time that does not exist", () => {
    // The Date constructor would roll each of these over to a different, real moment.
    for (const bad of [
      "2026-02-30T10:00", // 30 February
      "2026-13-01T10:00", // month 13
      "2026-04-31T10:00", // 31 April
      "2026-11-20T25:00", // hour 25
      "2026-11-20T10:60", // minute 60
      "0050-01-01T10:00", // year 50 would silently become 1950
      "2026-03-08T02:30", // skipped by the clocks going forward in New York
    ]) {
      expect(localInputToUtcIso(bad)).toEqual({ ok: false, reason: "not_a_time" });
    }
  });

  it("takes the earlier instant for a time that happens twice (clocks going back)", () => {
    // 01:30 on 1 November 2026 occurs in both EDT and EST. The earlier one is chosen,
    // which is the stricter expiry.
    expect(localInputToUtcIso("2026-11-01T01:30")).toEqual({ ok: true, iso: "2026-11-01T05:30:00.000Z" });
  });
});

describe("utcIsoToLocalInput", () => {
  it("converts to the minute-level value an <input type=datetime-local> takes", () => {
    expect(utcIsoToLocalInput("2026-11-20T20:30:00.000Z")).toEqual({ value: "2026-11-20T15:30", exact: true });
    expect(utcIsoToLocalInput("2026-07-01T16:00:00Z")).toEqual({ value: "2026-07-01T12:00", exact: true });
  });

  it("rounds down, and says so, when seconds or fractions are dropped", () => {
    expect(utcIsoToLocalInput("2026-11-20T20:30:45Z")).toEqual({ value: "2026-11-20T15:30", exact: false });
    expect(utcIsoToLocalInput("2026-11-20T20:30:00.500Z")).toEqual({ value: "2026-11-20T15:30", exact: false });
  });

  it("returns null for anything that is not a real UTC timestamp", () => {
    for (const bad of [
      "",
      "2026-11-20",
      "2026-11-20T20:30:00", // no Z
      "2026-11-20T20:30:00+01:00",
      "next friday",
      "2026-02-30T00:00:00Z", // would roll over to 2 March
      "2026-13-01T00:00:00Z",
      "2026-11-20T24:00:00Z",
    ]) {
      expect(utcIsoToLocalInput(bad)).toBeNull();
    }
  });

  it("round-trips with localInputToUtcIso", () => {
    for (const local of ["2026-11-20T15:30", "2026-12-31T23:59", "2027-01-01T00:00", "2026-07-04T09:05"]) {
      const utc = localInputToUtcIso(local);
      expect(utc.ok).toBe(true);
      if (utc.ok) expect(utcIsoToLocalInput(utc.iso)).toEqual({ value: local, exact: true });
    }
  });
});

describe("formatLocalInstant", () => {
  it("shows the person's own time zone, in the requested locale", () => {
    const text = formatLocalInstant("2026-11-20T20:30:00.000Z", "en-US");
    expect(text).toContain("Nov 20, 2026");
    expect(text).toMatch(/3:30\sPM/);
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatLocalInstant("not a date", "en-US")).toBe("not a date");
  });
});

describe("isInPast", () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  it("is true at and before now, false after", () => {
    expect(isInPast("2026-11-20T12:00:00.000Z", now)).toBe(true);
    expect(isInPast("2026-11-20T11:59:59.000Z", now)).toBe(true);
    expect(isInPast("2026-11-20T12:00:01.000Z", now)).toBe(false);
  });
  it("is false for something that is not a date", () => {
    expect(isInPast("nope", now)).toBe(false);
  });
});

describe("the audit record times", () => {
  it("shows the person's own time zone to the second", () => {
    // 2026-11-07 14:03:21 UTC is 09:03:21 in New York (UTC-5 after 1 November).
    expect(formatLocalInstantSeconds("2026-11-07T14:03:21.000Z", "en-US")).toContain("9:03:21");
  });

  it("shows the same instant in UTC, whatever the time zone", () => {
    expect(formatUtcInstant("2026-11-07T14:03:21.456Z")).toBe("2026-11-07 14:03:21 UTC");
  });

  it("returns a value that is not a time as it came", () => {
    expect(formatLocalInstantSeconds("not a time")).toBe("not a time");
    expect(formatUtcInstant("not a time")).toBe("not a time");
  });
});

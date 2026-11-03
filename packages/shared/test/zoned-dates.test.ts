import { describe, expect, it } from "vitest";
import { addDays, eachDay, zoneOffsetMinutes, zonedDate, zonedStartOfDay } from "../src";

const NY = "America/New_York";

describe("time-zone dates", () => {
  it("knows the zone offset, including daylight saving", () => {
    expect(zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), NY)).toBe(-300); // EST
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), NY)).toBe(-240); // EDT
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Asia/Tokyo")).toBe(540);
  });

  it("converts local midnight to the right UTC instant", () => {
    expect(zonedStartOfDay("2026-11-03", NY).toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(zonedStartOfDay("2026-07-01", NY).toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(zonedStartOfDay("2026-11-03", "Asia/Tokyo").toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(zonedStartOfDay("2026-11-03", "UTC").toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // US DST ends on 1 Nov 2026 and starts on 8 Mar 2026; midnight is unaffected (change is at 2 am).
    expect(zonedStartOfDay("2026-11-01", NY).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(zonedStartOfDay("2026-11-02", NY).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(zonedStartOfDay("2026-03-08", NY).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedStartOfDay("2026-03-09", NY).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("puts a late-night payment on the restaurant's calendar day", () => {
    // 02:30 UTC on 4 Nov is 21:30 on 3 Nov in New York.
    expect(zonedDate(new Date("2026-11-04T02:30:00Z"), NY)).toBe("2026-11-03");
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(() => zonedStartOfDay("3 Nov", NY)).toThrow();
  });
});

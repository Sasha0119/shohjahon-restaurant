import type { OpeningHours } from "@app/config";
import { describe, expect, it } from "vitest";
import {
  bookableTimes,
  isValidPhone,
  normalizePhone,
  reservationDateRange,
  reservationInstant,
} from "../src/reservations";

// 2026-11-09 is a Monday, 2026-11-13 a Friday, 2026-11-15 a Sunday.
const hours = {
  mon: [{ open: "11:00", close: "14:00" }],
  fri: [{ open: "11:00", close: "00:30" }],
} as unknown as OpeningHours;

describe("bookableTimes", () => {
  it("offers half-hour starts, the last one an hour before closing", () => {
    expect(bookableTimes(hours, "2026-11-09")).toEqual(["11:00", "11:30", "12:00", "12:30", "13:00"]);
  });

  it("stops at 23:30 when the night runs past midnight", () => {
    const times = bookableTimes(hours, "2026-11-13");
    expect(times.at(0)).toBe("11:00");
    expect(times.at(-1)).toBe("23:30");
  });

  it("offers nothing on a closed day", () => {
    expect(bookableTimes(hours, "2026-11-15")).toEqual([]);
  });
});

describe("reservationInstant", () => {
  it("reads the time in the restaurant's zone, not the server's", () => {
    expect(reservationInstant("2026-11-09", "13:00", "Asia/Tashkent").toISOString()).toBe("2026-11-09T08:00:00.000Z");
  });
});

describe("reservationDateRange", () => {
  it("starts on the restaurant's current date", () => {
    // 20:00 UTC is already the next day in Tashkent (UTC+5).
    expect(reservationDateRange(new Date("2026-11-09T20:00:00Z"), "Asia/Tashkent")).toEqual({
      min: "2026-11-10",
      max: "2026-12-10",
    });
  });
});

describe("isValidPhone", () => {
  it.each(["+998 90 123 45 67", "+998901234567", "(71) 200-00-00", "1234567"])("accepts %s", (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });
  it.each(["", "123", "abc", "+998 90 abc 45 67", "1234567890123456"])("refuses %j", (phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("treats the same number typed two ways as one", () => {
    expect(normalizePhone("+998 (71) 000-00-00")).toBe(normalizePhone("+998710000000"));
  });
});

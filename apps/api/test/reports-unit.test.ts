import { describe, expect, it } from "vitest";
import { centsToDecimal, csvCell, csvDocument } from "../src/reports/csv.ts";
import { previousRange, resolveRange } from "../src/reports/range.ts";

const NY = "America/New_York";

describe("CSV", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("neutralises spreadsheet formulas in text cells", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5"); // real numbers are left alone
  });

  it("writes an Excel-friendly document", () => {
    const doc = csvDocument(["a", "b"], [[1, "x"], [2, "y,z"]]);
    expect(doc.startsWith("﻿")).toBe(true);
    expect(doc).toBe('﻿a,b\r\n1,x\r\n2,"y,z"\r\n');
    expect(centsToDecimal(1250)).toBe("12.50");
    expect(centsToDecimal(1500, 0)).toBe("1500");
  });
});

describe("report date ranges", () => {
  const now = new Date("2026-11-04T02:30:00Z"); // 21:30 on 3 Nov in New York

  it("defaults to the last 30 days ending today, in the restaurant's time zone", () => {
    const r = resolveRange({}, NY, now);
    expect(r).toMatchObject({ from: "2026-10-05", to: "2026-11-03", days: 30 });
    expect(r.end.toISOString()).toBe("2026-11-04T05:00:00.000Z");
  });

  it("uses inclusive local dates and handles the DST change", () => {
    const r = resolveRange({ from: "2026-10-31", to: "2026-11-02" }, NY, now);
    expect(r.days).toBe(3);
    expect(r.start.toISOString()).toBe("2026-10-31T04:00:00.000Z"); // EDT
    expect(r.end.toISOString()).toBe("2026-11-03T05:00:00.000Z"); // EST
  });

  it("computes the previous period of the same length", () => {
    const p = previousRange(resolveRange({ from: "2026-11-02", to: "2026-11-03" }, NY, now), NY);
    expect(p).toMatchObject({ from: "2026-10-31", to: "2026-11-01", days: 2 });
  });

  it("rejects inverted and overly long ranges", () => {
    expect(() => resolveRange({ from: "2026-11-05", to: "2026-11-01" }, NY, now)).toThrow();
    expect(() => resolveRange({ from: "2024-01-01", to: "2026-01-01" }, NY, now)).toThrow(/at most/);
  });
});

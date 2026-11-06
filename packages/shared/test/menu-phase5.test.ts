import { describe, expect, it } from "vitest";
import { isAvailableAt, localParts, openState } from "../src";
import { menuItemInput, menuOrderInput, zImagePath } from "../src/api";

describe("time zones", () => {
  // 2026-11-03 14:30 UTC = 09:30 in New York (EST, UTC−5) = 23:30 in Tokyo (UTC+9).
  const instant = new Date(Date.UTC(2026, 10, 3, 14, 30));

  it("reads the local day and time of the restaurant, not the server", () => {
    expect(localParts(instant, "America/New_York")).toEqual({ dayIdx: 2, minute: 9 * 60 + 30 });
    expect(localParts(instant, "Asia/Tokyo")).toEqual({ dayIdx: 2, minute: 23 * 60 + 30 });
    expect(localParts(instant, "UTC")).toEqual({ dayIdx: 2, minute: 14 * 60 + 30 });
  });

  it("crosses midnight correctly", () => {
    const lateUtc = new Date(Date.UTC(2026, 10, 3, 23, 30)); // Tuesday 23:30 UTC
    expect(localParts(lateUtc, "Asia/Tokyo").dayIdx).toBe(3); // already Wednesday 08:30 in Tokyo
  });

  it("filters time-based menus in the restaurant's zone", () => {
    const breakfast = [{ from: "08:00", to: "11:00" }];
    expect(isAvailableAt(breakfast, instant, "America/New_York")).toBe(true);
    expect(isAvailableAt(breakfast, instant, "Asia/Tokyo")).toBe(false);
  });

  it("uses the zone for opening hours too", () => {
    const hours = {
      mon: [],
      tue: [{ open: "09:00", close: "17:00" }],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    };
    expect(openState(hours, instant, "America/New_York").isOpen).toBe(true);
    expect(openState(hours, instant, "Asia/Tokyo").isOpen).toBe(false);
  });
});

describe("menu input rules", () => {
  it("accepts only bundled or uploaded photos", () => {
    for (const ok of ["/images/menu/burger.jpg", "/uploads/3f9a0c.webp", "/uploads/a/b-c_d.PNG"]) {
      expect(zImagePath.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of [
      "https://example.com/x.jpg",
      "//evil.example/x.jpg",
      "/uploads/../.env",
      "/uploads/x.svg",
      "/images/x.jpg?y=1",
      "javascript:alert(1)",
      "",
    ]) {
      expect(zImagePath.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("defaults new items to not archived", () => {
    const item = menuItemInput.parse({
      slug: "x",
      categoryId: "c1",
      name: "X",
      priceCents: 100,
      imageUrl: "/images/menu/x.jpg",
    });
    expect(item.archived).toBe(false);
  });

  it("validates reorder requests", () => {
    expect(menuOrderInput.safeParse({}).success).toBe(false);
    expect(menuOrderInput.safeParse({ categoryIds: ["a", "a"] }).success).toBe(false);
    expect(menuOrderInput.safeParse({ items: { categoryId: "c", itemIds: ["a", "b"] } }).success).toBe(true);
  });
});

describe("report query rules", async () => {
  const { ordersQuery, auditQuery, zLocalDate } = await import("../src/api");
  it("accepts local calendar dates only", () => {
    expect(zLocalDate.safeParse("2026-11-03").success).toBe(true);
    expect(zLocalDate.safeParse("dddd-dd-dd").success).toBe(false);
    expect(zLocalDate.safeParse("2026-11-03T00:00:00Z").success).toBe(false);
  });
  it("validates ranges and filters", () => {
    expect(ordersQuery.safeParse({ from: "2026-11-05", to: "2026-11-01" }).success).toBe(false);
    expect(ordersQuery.parse({ table: "4", page: "2" })).toMatchObject({ table: 4, page: 2, pageSize: 50 });
    expect(auditQuery.safeParse({ action: "payment." }).success).toBe(true);
    expect(auditQuery.safeParse({ action: "DROP TABLE" }).success).toBe(false);
  });
});

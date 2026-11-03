import { describe, expect, it } from "vitest";
import { homeForRole } from "../src/lib/api";
import { safeNext } from "../src/lib/safe-next";

describe("safeNext (post-login redirect)", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/admin/staff", "/x")).toBe("/admin/staff");
    expect(safeNext("/waiter?tab=calls", "/x")).toBe("/waiter?tab=calls");
  });

  it("blocks open redirects", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, "/a\nb"]) {
      expect(safeNext(bad, "/fallback")).toBe("/fallback");
    }
  });

  it("sends each role to its own home", () => {
    expect(homeForRole).toEqual({ manager: "/admin/overview", waiter: "/waiter", kitchen: "/kitchen" });
  });
});

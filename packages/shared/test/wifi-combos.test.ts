import { describe, expect, it } from "vitest";
import { applyCombos, wifiQrPayload } from "../src";
import { seedMenu } from "./fixtures/classic-menu";

describe("wifiQrPayload", () => {
  it("builds the standard payload", () => {
    expect(wifiQrPayload({ ssid: "Guest", password: "pass1234", security: "WPA" })).toBe(
      "WIFI:T:WPA;S:Guest;P:pass1234;;",
    );
  });

  it("escapes special characters", () => {
    expect(wifiQrPayload({ ssid: 'Cafe;"Main"', password: "a:b,c\\d", security: "WPA" })).toBe(
      'WIFI:T:WPA;S:Cafe\\;\\"Main\\";P:a\\:b\\,c\\\\d;;',
    );
  });

  it("omits the password for open networks and flags hidden ones", () => {
    expect(wifiQrPayload({ ssid: "Open", password: "", security: "nopass", hidden: true })).toBe(
      "WIFI:T:nopass;S:Open;H:true;;",
    );
  });
});

describe("applyCombos", () => {
  const q = (entries: [string, number][]) => new Map(entries);

  it("applies a combo once per complete set", () => {
    const res = applyCombos(
      q([
        ["item-double-smash-burger", 2],
        ["item-parmesan-fries", 2],
        ["item-house-iced-tea", 1],
      ]),
      seedMenu.upsells,
    );
    expect(res.combos).toEqual([{ comboId: "combo-burger-night", name: "Burger night", times: 1, discount: 300 }]);
    expect(res.discount).toBe(300);
  });

  it("returns nothing for incomplete sets", () => {
    const res = applyCombos(q([["item-classic-tiramisu", 3]]), seedMenu.upsells);
    expect(res).toEqual({ combos: [], discount: 0 });
  });

  it("stacks different combos", () => {
    const res = applyCombos(
      q([
        ["item-double-smash-burger", 1],
        ["item-parmesan-fries", 1],
        ["item-house-iced-tea", 1],
        ["item-classic-tiramisu", 2],
        ["item-flat-white", 2],
      ]),
      seedMenu.upsells,
    );
    expect(res.discount).toBe(300 + 2 * 150);
  });
});

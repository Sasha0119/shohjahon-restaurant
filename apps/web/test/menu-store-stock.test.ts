import type { MenuDTO } from "@app/shared/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMenuStore } from "../src/store/menu-store";

const item = (id: string, inStock: boolean, stockVersion: number): MenuDTO["items"][number] => ({
  id,
  slug: id,
  categoryId: "c1",
  name: id,
  description: "",
  translations: {},
  priceCents: 1000,
  imageUrl: "/x.jpg",
  imageAlt: "",
  tags: [],
  allergens: [],
  calories: null,
  inStock,
  stockVersion,
  featured: false,
  modifierGroups: [],
});

const menu = (version: string, items: MenuDTO["items"]): MenuDTO => ({
  version,
  categories: [{ id: "c1", slug: "mains", name: "Mains", description: null, translations: {}, station: "kitchen", sortOrder: 0 }],
  items,
  suggestions: [],
  combos: [],
});

/** fetch() that answers with `body`, optionally only when the test says so. */
function mockFetch(body: MenuDTO) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fetchMock = vi.fn(async () => {
    await gate;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { release, fetchMock };
}

beforeEach(() => useMenuStore.setState({ menu: null, version: null, stockVersions: {}, error: false }));
afterEach(() => vi.unstubAllGlobals());

const shown = (id: string) => useMenuStore.getState().menu!.items.find((i) => i.id === id)!.inStock;

describe("guest menu: live stock changes", () => {
  it("updates only the changed item, without refetching the menu", async () => {
    const { release, fetchMock } = mockFetch(menu("v1", [item("a", true, 1), item("b", true, 1)]));
    release();
    await useMenuStore.getState().load();
    const before = useMenuStore.getState().menu!;

    useMenuStore.getState().applyStock("a", false, 2);
    const after = useMenuStore.getState().menu!;
    expect(shown("a")).toBe(false);
    expect(after.items[1]).toBe(before.items[1]); // untouched item keeps its identity → no re-render
    expect(after.categories).toBe(before.categories);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no reload
  });

  it("ignores late and duplicate events", async () => {
    const { release } = mockFetch(menu("v1", [item("a", true, 5)]));
    release();
    await useMenuStore.getState().load();
    const before = useMenuStore.getState().menu;
    useMenuStore.getState().applyStock("a", false, 4);
    useMenuStore.getState().applyStock("a", true, 5);
    expect(useMenuStore.getState().menu).toBe(before);
    useMenuStore.getState().applyStock("a", false, 6);
    expect(shown("a")).toBe(false);
  });

  it("ignores items this guest can't see (other menus / hidden categories)", async () => {
    const { release } = mockFetch(menu("v1", [item("a", true, 1)]));
    release();
    await useMenuStore.getState().load();
    const before = useMenuStore.getState().menu;
    useMenuStore.getState().applyStock("zzz", false, 9);
    expect(useMenuStore.getState().menu).toBe(before);
  });

  it("a reload that raced a newer event doesn't bring the old state back", async () => {
    const first = mockFetch(menu("v1", [item("a", true, 1)]));
    first.release();
    await useMenuStore.getState().load();

    // A reload starts (server still says "in stock", version 1 → its reply is now stale)…
    const slow = mockFetch(menu("v2", [item("a", true, 1), item("b", true, 1)]));
    const loading = useMenuStore.getState().load();
    // …and the kitchen's "sold out" event (version 2) arrives before the reply.
    useMenuStore.getState().applyStock("a", false, 2);
    slow.release();
    await loading;

    expect(shown("a")).toBe(false);
    expect(useMenuStore.getState().stockVersions.a).toBe(2);
    expect(shown("b")).toBe(true); // the rest of the reload still applies
  });
});

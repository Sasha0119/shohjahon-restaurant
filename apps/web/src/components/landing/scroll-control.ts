/**
 * Lets the menu overlay and scroll cue talk to Lenis without importing it, so
 * they work the same before the animation code has loaded, or without it.
 */
interface ScrollApi {
  lock: (locked: boolean) => void;
  scrollTo: (element: HTMLElement) => void;
}

let api: ScrollApi | null = null;

export function setScrollApi(next: ScrollApi | null) {
  api = next;
}

export function lockScroll(locked: boolean) {
  if (locked) document.documentElement.dataset.sjLock = "";
  else document.documentElement.removeAttribute("data-sj-lock");
  api?.lock(locked);
}

export function scrollToElement(element: HTMLElement) {
  if (api) api.scrollTo(element);
  else element.scrollIntoView();
}

/** A quick side-to-side shake for "that didn't work". Skipped under reduced motion. */
export function shake(element: Element | null, distance = 10) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = (n: number) => ({ transform: `translateX(${n}px)` });
  element.animate([x(0), x(-distance), x(distance), x(-distance * 0.6), x(distance * 0.6), x(0)], { duration: 400 });
}

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { setScrollApi } from "./scroll-control";

/**
 * Smooth scrolling, scroll-driven motion and the desktop extras. Loaded on
 * demand, never on guest or staff pages, and not under reduced motion.
 * Returns a function that undoes everything.
 */
export function startScrollMotion(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger);
  const html = document.documentElement;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const undo: (() => void)[] = [];

  // Touch screens keep their native scrolling.
  const lenis = fine ? new Lenis({ lerp: 0.1 }) : null;
  const tick = (time: number) => lenis?.raf(time * 1000);
  if (lenis) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  }
  setScrollApi({
    lock: (locked) => (locked ? lenis?.stop() : lenis?.start()),
    scrollTo: (element) => (lenis ? lenis.scrollTo(element) : element.scrollIntoView()),
  });

  // From here, elements with data-reveal wait for the scroll to reach them (see landing.css).
  html.dataset.sjMotion = "";

  const context = gsap.context(() => {
    const hero = root.querySelector(".sj-hero");
    const scrub = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
    // The picture falls slower than the page while the headline lifts away.
    gsap.to("[data-parallax='media']", { yPercent: 18, ease: "none", scrollTrigger: scrub });
    gsap.to("[data-parallax='content']", { yPercent: -14, ease: "none", scrollTrigger: scrub });

    // The statement lights up word by word.
    gsap.fromTo(
      "[data-word]",
      // Unlit words stay readable: ivory at 50% and gold at 72% both clear 4.5:1 on near-black.
      { opacity: (_: number, word: Element) => (word.classList.contains("sj-accent") ? 0.72 : 0.5) },
      {
        opacity: 1,
        ease: "none",
        stagger: 0.5,
        scrollTrigger: { trigger: ".sj-statement", start: "top 75%", end: "bottom 55%", scrub: true },
      },
    );

    for (const element of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
      ScrollTrigger.create({
        trigger: element,
        start: "top 88%",
        once: true,
        onEnter: () => element.classList.add("is-in"),
      });
    }

    // Photos in a chapter drift at different speeds. Wider screens only.
    gsap.matchMedia().add("(min-width: 48rem)", () => {
      for (const element of gsap.utils.toArray<HTMLElement>("[data-speed]")) {
        const speed = Number(element.dataset.speed);
        gsap.fromTo(
          element,
          { yPercent: speed },
          {
            yPercent: -speed,
            ease: "none",
            scrollTrigger: { trigger: element, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      }
    });

    if (fine) {
      undo.push(startCursor(root), startMagnetic(root), startGalleryDrag(root));
      // The WebGL effect is its own small download, fetched as the gallery approaches.
      const track = root.querySelector<HTMLElement>("[data-gallery]");
      let stopped = false;
      let stopHeat: (() => void) | null = null;
      undo.push(() => {
        stopped = true;
        stopHeat?.();
      });
      if (track) {
        ScrollTrigger.create({
          trigger: track,
          start: "top 200%",
          once: true,
          onEnter: () => {
            void import("./dish-heat").then(({ startDishHeat }) => {
              if (!stopped) stopHeat = startDishHeat(track);
            });
          },
        });
      }
    }
  }, root);

  // Fonts change text heights, so positions are measured again once they arrive.
  void document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return () => {
    undo.forEach((fn) => fn());
    context.revert();
    html.removeAttribute("data-sj-motion");
    setScrollApi(null);
    if (lenis) {
      gsap.ticker.remove(tick);
      lenis.destroy();
    }
  };
}

/** A dotted ring that follows the pointer, grows over anything clickable, and can carry a label. */
function startCursor(root: HTMLElement): () => void {
  const cursor = document.createElement("div");
  cursor.className = "sj-cursor";
  cursor.setAttribute("aria-hidden", "true");
  const ring = root.querySelector<SVGElement>(".sj-cue svg")?.cloneNode(true) as SVGElement | undefined;
  const scale = document.createElement("div");
  scale.className = "sj-cursor-scale";
  if (ring) {
    ring.setAttribute("class", "sj-cursor-ring");
    scale.append(ring);
  }
  const text = document.createElement("span");
  text.className = "sj-cursor-label";
  cursor.append(scale, text);
  root.append(cursor);
  document.documentElement.classList.add("sj-cursor-on");

  const x = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3" });
  const y = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3" });
  const onMove = (e: PointerEvent) => {
    cursor.dataset.ready = "";
    x(e.clientX);
    y(e.clientY);
    const target = (e.target as Element | null)?.closest?.("a,button,[data-cursor-label]");
    const label = target?.getAttribute("data-cursor-label") ?? "";
    text.textContent = label;
    cursor.dataset.state = label ? "label" : target ? "hover" : "";
  };
  const onLeave = () => cursor.removeAttribute("data-ready");
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    document.documentElement.classList.remove("sj-cursor-on");
    gsap.killTweensOf(cursor);
    cursor.remove();
  };
}

/** Buttons that lean towards the pointer. */
function startMagnetic(root: HTMLElement): () => void {
  const stops = gsap.utils.toArray<HTMLElement>("[data-magnetic]", root).map((element) => {
    const x = gsap.quickTo(element, "x", { duration: 0.5, ease: "power3" });
    const y = gsap.quickTo(element, "y", { duration: 0.5, ease: "power3" });
    const onMove = (e: PointerEvent) => {
      const box = element.getBoundingClientRect();
      x((e.clientX - box.left - box.width / 2) * 0.3);
      y((e.clientY - box.top - box.height / 2) * 0.3);
    };
    const onLeave = () => {
      x(0);
      y(0);
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: "transform" });
    };
  });
  return () => stops.forEach((stop) => stop());
}

/** Drag the dish gallery with a mouse. Touch screens and keyboards use its native scrolling. */
function startGalleryDrag(root: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>("[data-gallery]");
  if (!track) return () => {};
  let startX = 0;
  let startScroll = 0;
  let pressed = false;
  let dragged = false;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pressed = true;
    dragged = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
  };
  const onMove = (e: PointerEvent) => {
    if (!pressed) return;
    const distance = e.clientX - startX;
    if (!dragged && Math.abs(distance) > 6) {
      dragged = true;
      track.dataset.dragging = "";
    }
    if (dragged) track.scrollLeft = startScroll - distance;
  };
  const onUp = () => {
    pressed = false;
    track.removeAttribute("data-dragging");
  };
  // A drag that ends on a dish shouldn't open it.
  const onClick = (e: MouseEvent) => {
    if (dragged) {
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
    }
  };
  const noNativeDrag = (e: DragEvent) => e.preventDefault();

  track.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  track.addEventListener("click", onClick, true);
  track.addEventListener("dragstart", noNativeDrag);
  return () => {
    track.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    track.removeEventListener("click", onClick, true);
    track.removeEventListener("dragstart", noNativeDrag);
  };
}

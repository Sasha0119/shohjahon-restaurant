"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from "react";

const EVENT = "page-curtain:navigate";
const CLOSE_MS = 550;
const OPEN_MS = 650;
/** If a page never arrives (offline), don't leave the visitor behind a closed curtain. */
const GIVE_UP_MS = 6000;
const EASE = "cubic-bezier(0.76, 0, 0.24, 1)";

/** A link that wipes a curtain across the screen on its way to the next page. */
export function CurtainLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const pathname = usePathname();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (href === pathname || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(EVENT, { detail: href }));
  };
  return <Link href={href} prefetch={false} onClick={handle} {...props} />;
}

/** Mounted once in the root layout. It stays invisible until a CurtainLink asks for it. */
export function PageCurtain() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "closed" | "opening">("idle");
  const arrivedFrom = useRef<string | null>(null);

  useEffect(() => {
    let closing: ReturnType<typeof setTimeout>;
    const onNavigate = (e: Event) => {
      arrivedFrom.current = window.location.pathname;
      setState("closed");
      closing = setTimeout(() => router.push((e as CustomEvent<string>).detail), CLOSE_MS);
    };
    window.addEventListener(EVENT, onNavigate);
    return () => {
      window.removeEventListener(EVENT, onNavigate);
      clearTimeout(closing);
    };
  }, [router]);

  // The new page has arrived: open up.
  useEffect(() => {
    if (state === "closed" && arrivedFrom.current !== pathname) setState("opening");
  }, [pathname, state]);

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(
      () => setState(state === "closed" ? "opening" : "idle"),
      state === "closed" ? GIVE_UP_MS : OPEN_MS,
    );
    return () => clearTimeout(timer);
  }, [state]);

  const panel = (edge: "top" | "bottom") => ({
    position: "absolute" as const,
    insetInline: 0,
    [edge]: 0,
    height: "50.5%",
    background: "#0d0c0a",
    transform: state === "closed" ? "none" : `translateY(${edge === "top" ? "-101%" : "101%"})`,
    // Closing starts from fully open, so jump there without animating when idle.
    transition: state === "idle" ? "none" : `transform ${state === "closed" ? CLOSE_MS : OPEN_MS}ms ${EASE}`,
  });

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        overflow: "hidden",
        pointerEvents: state === "closed" ? "auto" : "none",
        visibility: state === "idle" ? "hidden" : "visible",
      }}
    >
      <div style={panel("top")} />
      <div style={panel("bottom")} />
    </div>
  );
}

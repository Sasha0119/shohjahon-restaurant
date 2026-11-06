"use client";

import { brand } from "@app/config";
import { useEffect, useId, useRef, useState } from "react";
import { CurtainLink } from "@/components/ui/page-curtain";
import { useT } from "@/i18n";
import { lockScroll, scrollToElement } from "./scroll-control";

const FOCUSABLE = "a[href],button:not([disabled])";

/** The always-reachable "Menu" button and the full-screen navigation it opens. */
export function MenuOverlay() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    const panel = dialog.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lockScroll(false);
      opener.current?.focus();
    };
  }, [open]);

  const goToSection = (id: string) => {
    setOpen(false);
    // After the overlay's effect has released the scroll lock.
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (target) scrollToElement(target);
    });
  };

  const section = (id: string, label: string) => ({
    label,
    render: (className: string) => (
      <a
        href={`#${id}`}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          goToSection(id);
        }}
      >
        {label}
      </a>
    ),
  });
  const page = (href: string, label: string) => ({
    label,
    render: (className: string) => (
      <CurtainLink href={href} className={className}>
        {label}
      </CurtainLink>
    ),
  });

  const links = [
    section("sj-story", t("landing.storyLabel")),
    page("/menu", t("nav.menu")),
    page("/reserve", t("reserve.cta")),
    section("sj-contact", t("landing.contact")),
  ];

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="sj-menu-button"
        data-magnetic
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden className="sj-menu-lines" />
        {t("nav.menu")}
      </button>

      <div
        ref={dialog}
        className="sj-overlay"
        data-open={open || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!open}
      >
        <div className="sj-overlay-top">
          <span id={titleId} className="sj-label">
            {t("nav.menu")}
          </span>
          <button type="button" className="sj-menu-button sj-menu-button--static" onClick={() => setOpen(false)}>
            {t("common.close")}
          </button>
        </div>

        <ol className="sj-overlay-links">
          {links.map((link, i) => (
            <li key={link.label} style={{ "--i": i } as React.CSSProperties}>
              <span className="sj-label sj-overlay-number" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="sj-overlay-mask">{link.render("sj-overlay-link")}</span>
            </li>
          ))}
        </ol>

        <div className="sj-overlay-foot sj-label">
          {brand.contact.phone && <a href={`tel:${brand.contact.phone.replace(/\s/g, "")}`}>{brand.contact.phone}</a>}
          <span>{brand.contact.address}</span>
          <CurtainLink href="/staff">{t("landing.staff")}</CurtainLink>
        </div>
      </div>
    </>
  );
}

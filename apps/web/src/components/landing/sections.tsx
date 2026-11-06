"use client";

import { brand } from "@app/config";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { CurtainLink } from "@/components/ui/page-curtain";
import { useI18n, useT } from "@/i18n";
import { formatClock, weekdayName } from "@/lib/format";
import { ChekichRing } from "./chekich";
import { SIGNATURE_DISHES } from "./signature-dishes";

const photo = (slug: string) => `/images/menu/${slug}.jpg`;
const HOUR_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Large text whose words light up one by one as you scroll. */
export function Statement() {
  const t = useT();
  const words = (text: string, extra?: string) =>
    text.split(" ").map((word, i) => (
      <span key={i} data-word className={extra}>
        {word}{" "}
      </span>
    ));
  return (
    <section id="sj-statement" className="sj-statement" aria-label={t("landing.storyLabel")}>
      <p>
        {words(t("landing.statement"))}
        {words(t("landing.statementEnd"), "sj-accent")}
      </p>
    </section>
  );
}

/** A strip of dish names running across the page. Decorative: the same names are in the gallery. */
export function Marquee() {
  const { locale } = useI18n();
  const run = SIGNATURE_DISHES.map((dish) => (
    <span key={dish.slug} className="sj-marquee-item">
      {dish.name[locale]}
      <ChekichRing size={36} className="sj-marquee-ring" />
    </span>
  ));
  return (
    <div className="sj-marquee" aria-hidden>
      <div className="sj-marquee-track">
        <div>{run}</div>
        <div>{run}</div>
      </div>
    </div>
  );
}

export function Gallery() {
  const { t, locale } = useI18n();
  return (
    <section className="sj-gallery" aria-labelledby="sj-gallery-title">
      <div className="sj-gallery-head">
        <h2 id="sj-gallery-title" className="sj-label">
          {t("landing.galleryLabel")}
        </h2>
        <span className="sj-label sj-gallery-hint" aria-hidden>
          {t("landing.dragHint")}
        </span>
      </div>
      <ul className="sj-gallery-track no-scrollbar" data-gallery>
        {SIGNATURE_DISHES.map((dish, i) => (
          <li key={dish.slug} className="sj-dish" style={{ "--i": i } as React.CSSProperties}>
            <CurtainLink href="/menu" data-cursor-label={t("landing.view")} draggable={false}>
              <span className="sj-dish-photo" data-dish-photo>
                <Image src={photo(dish.slug)} alt="" fill sizes="(min-width: 48rem) 40vw, 78vw" draggable={false} />
              </span>
              <span className="sj-dish-caption">
                <span className="sj-label" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="sj-dish-name">{dish.name[locale]}</span>
              </span>
            </CurtainLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Unveil({ slug, className, speed, sizes }: { slug: string; className: string; speed: number; sizes: string }) {
  return (
    <div className={className} data-speed={speed}>
      <div className="sj-unveil" data-reveal>
        <div className="sj-unveil-inner">
          <Image src={photo(slug)} alt="" fill sizes={sizes} />
        </div>
      </div>
    </div>
  );
}

function Chapter({
  id,
  number,
  label,
  title,
  body,
  photos,
  inverted,
  children,
}: {
  id: string;
  number: string;
  label: string;
  title: string;
  body: string;
  photos: [string, string];
  inverted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="sj-chapter" data-inverted={inverted || undefined} aria-labelledby={`${id}-title`}>
      {/* Stays pinned while the photos and text on the right pass by. */}
      <div className="sj-chapter-pin">
        <span className="sj-chapter-number" aria-hidden>
          {number}
        </span>
        <p className="sj-label">{label}</p>
        <div className="sj-mask" data-reveal>
          <h2 id={`${id}-title`} className="sj-chapter-title">
            {title}
          </h2>
        </div>
      </div>
      <div className="sj-chapter-flow">
        <Unveil slug={photos[0]} className="sj-chapter-photo" speed={-6} sizes="(min-width: 48rem) 45vw, 100vw" />
        <Unveil slug={photos[1]} className="sj-chapter-photo sj-chapter-photo--small" speed={12} sizes="(min-width: 48rem) 26vw, 60vw" />
        <div className="sj-chapter-text">
          <p className="sj-lead">{body}</p>
          <div className="sj-chapter-actions">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Chapters() {
  const t = useT();
  return (
    <>
      <Chapter
        id="sj-story"
        number="01"
        label={t("landing.storyLabel")}
        title={t("landing.storyTitle")}
        body={t("landing.storyBody")}
        photos={["lamb-manti", "lamb-shurpa"]}
      >
        <CurtainLink href="/menu" className="sj-text-link">
          {t("home.viewMenu")}
          <ArrowUpRight className="size-4" aria-hidden />
        </CurtainLink>
      </Chapter>
      <Chapter
        id="sj-menu"
        number="02"
        label={t("nav.menu")}
        title={t("landing.menuTitle")}
        body={t("landing.menuBody")}
        photos={["lula-kebab", "blooming-herbal-tea"]}
      >
        <CurtainLink href="/menu" className="sj-button" data-magnetic>
          {t("home.viewMenu")}
          <ArrowUpRight className="size-4" aria-hidden />
        </CurtainLink>
      </Chapter>
      <Chapter
        id="sj-reserve"
        number="03"
        label={t("reserve.cta")}
        title={t("landing.reserveTitle")}
        body={t("landing.body")}
        photos={["walnut-halva", "green-tea"]}
        inverted
      >
        <CurtainLink href="/reserve" className="sj-button" data-magnetic>
          {t("reserve.cta")}
          <ArrowUpRight className="size-4" aria-hidden />
        </CurtainLink>
      </Chapter>
    </>
  );
}

export function Footer() {
  const t = useT();
  const { contact, openingHours } = brand;
  return (
    <footer id="sj-contact" className="sj-footer">
      <div className="sj-footer-grid">
        <div className="sj-footer-column">
          <h2 className="sj-label sj-footer-heading">{t("home.hours")}</h2>
          <dl className="sj-hours">
            {HOUR_ORDER.map((day) => (
              <div key={day}>
                <dt suppressHydrationWarning>{weekdayName(day, "long")}</dt>
                <dd suppressHydrationWarning>
                  {openingHours[day].length === 0
                    ? t("home.closed")
                    : openingHours[day].map((s) => `${formatClock(s.open)} – ${formatClock(s.close)}`).join(", ")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <address className="sj-footer-column">
          <h2 className="sj-label sj-footer-heading">{t("landing.contact")}</h2>
          {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a>}
          {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          <a href={contact.mapUrl} target="_blank" rel="noopener noreferrer">
            {contact.address}
          </a>
        </address>
        <div className="sj-footer-column sj-footer-cta">
          <CurtainLink href="/menu" className="sj-button" data-magnetic>
            {t("landing.orderAtTable")}
            <ArrowUpRight className="size-4" aria-hidden />
          </CurtainLink>
        </div>
      </div>
      <p className="sj-footer-word" aria-hidden>
        {brand.name}
      </p>
      <p className="sj-label sj-footer-legal" suppressHydrationWarning>
        © {new Date().getFullYear()} {brand.name}. {t("landing.rights")}
      </p>
    </footer>
  );
}

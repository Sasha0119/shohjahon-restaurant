"use client";

import { brand } from "@app/config";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { CurtainLink } from "@/components/ui/page-curtain";
import { useT } from "@/i18n";
import "@/styles/design-tokens.css";
import { ChekichRing } from "./chekich";
import { landingFontVariables } from "./fonts";
import { INTRO_SEEN_KEY, decideIntro, type IntroMode } from "./intro";
import "./landing.css";
import { MenuOverlay } from "./menu-overlay";
import { scrollToElement } from "./scroll-control";
import { Chapters, Footer, Gallery, Marquee, Statement } from "./sections";

const COUNTER_STRIP = Array.from({ length: 101 }, (_, i) => i).join("\n");

/** How long the loader runs before the curtain opens. Matches the counter in landing.css. */
const LOADER_MS = 1900;
/** Matches --sj-duration-curtain. */
const CURTAIN_MS = 1100;

/**
 * The looping hero video: the full vertical frame on portrait screens, a crop
 * of the fire elsewhere. The hero image shows until it plays, and instead of it
 * under reduced motion. Credits: public/images/CREDITS.md.
 */
const HERO_VIDEO: { src: string; media?: string }[] = [
  { src: "/videos/hero-portrait.mp4", media: "(orientation: portrait)" },
  { src: "/videos/hero-landscape.mp4" },
];

export function Landing() {
  const t = useT();
  const root = useRef<HTMLElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [videoAllowed, setVideoAllowed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const arrivedByLink = !html.dataset.sjIntro;
    const intro = (html.dataset.sjIntro as IntroMode | undefined) ?? decideIntro();
    html.dataset.sjIntro = intro;
    html.dataset.sjHydrated = "";

    // The video is the heaviest thing here, so it waits until everything else has loaded and the
    // curtain is open. Reduced motion, data-saver and very slow connections keep the still image.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;
    const wantsVideo = intro !== "still" && !connection?.saveData && !/(^|-)2g$/.test(connection?.effectiveType ?? "");
    const startVideo = () => {
      if (wantsVideo) setVideoAllowed(true);
    };
    const startVideoAfterLoad = () => {
      if (document.readyState === "complete") startVideo();
      else window.addEventListener("load", startVideo, { once: true });
    };

    let stopScroll: (() => void) | undefined;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // GSAP and Lenis are a separate download that only this page requests.
    const startScroll = () => {
      if (intro === "still" || !root.current) return;
      void import("./scroll-motion").then(({ startScrollMotion }) => {
        if (alive && root.current) stopScroll = startScrollMotion(root.current);
      });
    };
    const finish = () => {
      html.removeAttribute("data-sj-lock");
      try {
        sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      } catch {
        /* private mode: the intro may play again, which is harmless */
      }
      if (loader.current) loader.current.hidden = true;
      startScroll();
      startVideoAfterLoad();
    };

    if (intro === "play") {
      html.dataset.sjLock = "";
      window.scrollTo(0, 0);
      const elapsed = arrivedByLink ? 0 : performance.now();
      timers.push(
        setTimeout(
          () => {
            html.dataset.sjRevealed = "";
            timers.push(setTimeout(finish, CURTAIN_MS));
          },
          Math.max(0, LOADER_MS - elapsed),
        ),
      );
    } else {
      if (intro === "skip") requestAnimationFrame(() => (html.dataset.sjRevealed = ""));
      startScroll();
      startVideoAfterLoad();
    }

    return () => {
      alive = false;
      window.removeEventListener("load", startVideo);
      timers.forEach(clearTimeout);
      stopScroll?.();
      for (const name of ["data-sj-intro", "data-sj-revealed", "data-sj-lock", "data-sj-hydrated"])
        html.removeAttribute(name);
    };
  }, []);

  return (
    <main ref={root} className={`sj ${landingFontVariables}`}>
      <Loader ref={loader} label={t("landing.introLabel")} />

      <header className="sj-header">
        <span className="sj-wordmark-small">{brand.name}</span>
      </header>
      <div className="sj-top-actions">
        <div className="sj-lang">
          <LanguageSwitcher onImage />
        </div>
        <MenuOverlay />
      </div>

      <section className="sj-hero" aria-labelledby="sj-hero-title">
        <div className="sj-hero-parallax" data-parallax="media">
          <div className="sj-hero-media">
            <Image src={brand.heroImage.src} alt="" fill priority sizes="(max-aspect-ratio: 3/2) 183vh, 100vw" />
            {videoAllowed && (
              <video
                ref={video}
                className="sj-hero-video"
                aria-hidden
                data-playing={videoPlaying || undefined}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onPlaying={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              >
                {HERO_VIDEO.map((source) => (
                  <source key={source.src} src={source.src} media={source.media} type="video/mp4" />
                ))}
              </video>
            )}
          </div>
        </div>
        <div className="sj-hero-scrim" aria-hidden />

        <div className="sj-hero-content" data-parallax="content">
          <h1 id="sj-hero-title" className="sj-headline">
            <span className="sj-line">
              <span>{t("landing.heroLine1")}</span>
            </span>{" "}
            <span className="sj-line sj-line--offset">
              <span>{t("landing.heroLine2")}</span>
            </span>{" "}
            <span className="sj-line">
              <span>{t("landing.heroLine3")}</span>
            </span>
          </h1>

          <div className="sj-hero-foot">
            <p className="sj-label sj-rise">{t("landing.heroCaption")}</p>
            <a
              href="#sj-statement"
              className="sj-cue sj-rise"
              aria-label={t("landing.scroll")}
              onClick={(e) => {
                const target = document.getElementById("sj-statement");
                if (!target) return;
                e.preventDefault();
                scrollToElement(target);
              }}
            >
              <ChekichRing />
              <span className="sj-label" aria-hidden>
                {t("landing.scroll")}
              </span>
            </a>
            <div className="sj-hero-actions sj-rise">
              {/* Moving images need a way to stop them. */}
              {videoAllowed && (
                <button
                  type="button"
                  className="sj-video-toggle"
                  aria-label={videoPlaying ? t("landing.pauseVideo") : t("landing.playVideo")}
                  onClick={() => (videoPlaying ? video.current?.pause() : void video.current?.play())}
                >
                  {videoPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                </button>
              )}
              <CurtainLink href="/menu" className="sj-button" data-magnetic>
                {t("nav.menu")}
                <ArrowUpRight className="size-4" aria-hidden />
              </CurtainLink>
            </div>
          </div>
        </div>
      </section>

      <Statement />
      <Marquee />
      <Gallery />
      <Chapters />
      <Marquee />
      <Footer />
    </main>
  );
}

function Loader({ ref, label }: { ref: React.Ref<HTMLDivElement>; label: string }) {
  return (
    <div ref={ref} className="sj-loader" aria-hidden>
      <div className="sj-curtain sj-curtain--top" />
      <div className="sj-curtain sj-curtain--bottom" />
      <div className="sj-loader-content">
        <p className="sj-loader-word">
          <span className="sj-loader-ghost">{brand.name}</span>
          {[...brand.name].map((letter, i) => (
            <span key={i} style={{ "--i": i } as React.CSSProperties}>
              {letter}
            </span>
          ))}
        </p>
        <div className="sj-loader-rule" />
        <div className="sj-loader-meta">
          <span className="sj-label">{label}</span>
          <span className="sj-count">
            <span>{COUNTER_STRIP}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

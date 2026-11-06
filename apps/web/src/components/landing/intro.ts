/*
 * Which opening the landing page gets, stored on <html data-sj-intro>:
 *   play   first visit this session: loader, curtain, then the headline
 *   skip   already seen this session: just the headline
 *   still  the device asks for reduced motion: everything in its final state
 * With no attribute at all (JavaScript off), the page simply shows its content.
 */
export const INTRO_SEEN_KEY = "sj-intro-seen";

export type IntroMode = "play" | "skip" | "still";

export function decideIntro(): IntroMode {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "still";
    return sessionStorage.getItem(INTRO_SEEN_KEY) ? "skip" : "play";
  } catch {
    return "skip";
  }
}

/** The same decision as a script that runs before first paint on a full page load. */
export const INTRO_BOOT = `(function(){var m="play";try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)m="still";else if(sessionStorage.getItem("${INTRO_SEEN_KEY}"))m="skip"}catch(e){m="skip"}document.documentElement.dataset.sjIntro=m})()`;

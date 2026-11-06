# Shohjahon: art direction

Status: approved. Tokens: `apps/web/src/styles/design-tokens.css`.

## The idea: "Qozon ochildi" (the lid comes off)

Everything comes from one moment in a plov kitchen: the lid lifts off the qozon, and light and steam escape. Three materials run through the whole site, and none of them comes from the references:

- **Fire:** gold light in the dark. Words catch like embers as you scroll.
- **Steam:** the WebGL hover is heat haze rising through a dish photo, not the usual RGB split.
- **Non stamp:** the *chekich* dot ring pressed into Uzbek bread becomes the cursor, the scroll cue and the marquee separator.

## What I learned from the references

| | Observed | Take the principle | Leave behind |
| --- | --- | --- | --- |
| **Iventions** | Huge wordmark over rotating wedges. A small card grows into the full-screen showreel on scroll. Coloured panels tilt away as the next slides over, with big 01/02/03. A cursor blob reads "Next". The client list highlights as you scroll. | Video that *grows* into the hero. Numbers as big as headings. Text rising from behind a mask. | Multi-colour palette, sans wordmark, wedge shapes |
| **Unseen** | Letters flicker in, then an "Enter" gate. The hero is a WebGL world that follows the mouse while the page stays still. Film grain. Italic serif beside a grotesk. A slide-in menu with superscript 01–04. A ring cursor that stretches with speed. | Serif drama, film grain, small numbering, a cursor with physics | The gate (visitors should reach food at once), full-page WebGL, arches |
| **Noomo** | All-caps statement with 3D objects passing through the letters. Pinned stages swap one giant word. Pill labels. A long, generous scroll. | Pinning one giant word; depth between text and object | 3D models, pastel gradient, mono headlines. Also its long blank frames between stages: never leave an empty screen |

**Speed, measured once, so indicative only.** First paint on desktop: Iventions 0.9 s, Noomo 2.0 s, Unseen 3.8 s. Phone-emulated transfer: Noomo 1.6 MB, Iventions 2.8 MB, Unseen 7.2 MB, the last just to reach its gate. Unseen also replays its loader on a direct link. Guests on Uzbek mobile networks shouldn't pay that, so our loader runs once per session and sits on top of a hero that is already rendering.

**On phones.** Iventions and Noomo keep their big type and drop to one column, and sideways-swiping rows replace the pinned layouts. We do the same.

## Palette

Already the app's palette, so the existing contrast tests keep protecting it.

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| Ink | `#0D0C0A` | Page | |
| Ivory | `#F4EEE2` | Headlines, text; one inverted section | 16.9:1 on ink |
| Smoke | `#ADA393` | Secondary text, unlit words | 7.9:1 on ink |
| Gold | `#C9A45C` | The one accent: labels, lit word, primary button, cursor | 8.3:1 on ink |
| Deep gold | `#8A6424` | Gold on ivory only (plain gold fails there at 2.0:1) | 4.6:1 on ivory |

Gold stays under about 5% of any screen. No gradients except photo scrims.

## Type

Tested by reading each font file's glyph table, then rendering the survivors.

| Font | Uzbek Latin ʻ ʼ | Russian | Uzbek Cyrillic | Verdict |
| --- | --- | --- | --- | --- |
| **Piazzolla** | yes | yes | yes | **Chosen, display.** Angular and carved, with a lively italic and lining numerals |
| Cormorant | yes | yes | yes | Rejected: the stock "luxury" look, thin over video, old-style numerals |
| Playfair | yes | yes | yes | Rejected: too close to what the app has now |
| Playfair Display (current) | yes | yes | no Ҳҳ | Replaced |
| Oranienbaum, Gloock | **no** | Gloock **no** | **no** | Would break oʻ and gʻ |
| Bona Nova, Literata | yes | yes | partial | Rejected |
| **IBM Plex Mono** | yes | yes | yes | **Chosen, labels.** The only mono that passed |
| JetBrains, Martian, Geist Mono | **no ʻ** | yes | varies | Would break oʻ and gʻ |
| **Onest** | yes | yes | yes | **Chosen, dense app text** (KDS, tables, admin), replacing Inter |

Scale runs from hero `min(17vw, 26svh)`, through section numbers and statement text, down to 12px mono labels. Headlines are tight at -0.02em; mono labels are uppercase and tracked. Line lengths at 360px get measured in all three languages in step 2, because Russian runs longest.

Draft headline, built from short words so it can be huge: **Olov. Guruch. Sabr.** / **Fire. Rice. Patience.** / **Огонь. Рис. Терпение.**

## Grid

12 columns, with margins of 16–48px and gutters of 12–24px. Thin 1px lines mark the structure and draw themselves in. Text never sits centred by default: headlines hang from the left edge, captions sit in far columns, images overlap headlines by one or two columns and move at a different speed. Above 2560px the content is capped, while the type and full-bleed media keep scaling.

## Motion rules

1. **One verb per element.** Type rises from a mask, images unveil, lines draw. Nothing fades and slides at once.
2. **Two curves only:** `expo-out` for arrivals, `curtain` for wipes.
3. **Transform and opacity only,** so the frame rate holds and nothing shifts layout.
4. **Duration follows size:** 200 ms hover, 600 ms label, 900 ms headline, 1100 ms curtain. Loader under 2.2 s.
5. **Scroll drives progress, never surprises.** Pinned sections get a clear exit and no empty frames.
6. **Reduced motion:** no loader, Lenis, pinning, cursor, marquee movement or WebGL. Content simply appears in its final state, and the hero shows the still image.
7. **Touch:** no cursor, magnetism or WebGL. Native scrolling, swipe gallery and CSS image hover replacements.
8. **Accessible by default:** real headings and links, a visible focus ring, focus trapped in the menu overlay and Esc to close. Split text keeps a readable label for screen readers.
9. **App screens get the language, not the show:** same type, lines and curves, liquid glass only on bars and sheets, no WebGL.

## Checked against the existing app

- The security policy already allows same-origin video and WebGL, so assets must be self-hosted. No external fonts or scripts.
- The global `scroll-behavior: smooth` would fight Lenis, so it has to be off on the landing route.
- Framer Motion is already used across the app, so landing-only loading can apply to GSAP, Lenis and Three.js, not to Framer.

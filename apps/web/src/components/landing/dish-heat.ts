import { Mesh, Program, Renderer, Texture, Triangle, type OGLRenderingContext } from "ogl";

/*
 * The one WebGL moment: heat haze rising through a dish photo under the pointer.
 * One canvas moves to whichever photo is hovered, so there is only ever one
 * WebGL context, and nothing draws unless a photo is being hovered. Mouse only;
 * everywhere else the photos keep their CSS hover (see landing.css).
 */

const VERTEX = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D tMap;
uniform float uTime;
uniform float uStrength;
uniform vec2 uPointer;
uniform vec2 uCover;
uniform float uAspect;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  // Stronger near the pointer and above it, because heat rises.
  vec2 fromPointer = (vUv - uPointer) * vec2(uAspect, 1.0);
  float near = smoothstep(0.75, 0.0, length(fromPointer));
  float above = smoothstep(-0.25, 0.5, vUv.y - uPointer.y);
  float amount = uStrength * (0.2 + 0.8 * near * above);

  // Two layers of noise drifting upward at slightly different speeds.
  vec2 scale = vec2(11.0 * uAspect, 6.0);
  vec2 wave = vec2(
    noise(vUv * scale - vec2(0.0, uTime * 1.5)),
    noise(vUv * scale * 1.3 + vec2(7.3, -uTime * 1.15))
  ) - 0.5;

  // The same centred crop as the photo's object-fit: cover, so the canvas lines up with it.
  vec2 coverUv = (vUv + wave * 0.09 * amount - 0.5) * uCover + 0.5;
  gl_FragColor = texture2D(tMap, coverUv);
}`;

const FADE_IN = 0.07;
const FADE_OUT = 0.05;

export function startDishHeat(track: HTMLElement): (() => void) | null {
  let renderer: Renderer;
  try {
    renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 1.5),
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
  } catch {
    return null; // No WebGL: the CSS hover stays.
  }
  const gl: OGLRenderingContext = renderer.gl;
  if (!gl) return null;

  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.className = "sj-dish-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const textures = new Map<HTMLImageElement, Texture>();
  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: FRAGMENT,
    uniforms: {
      tMap: { value: null },
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uPointer: { value: [0.5, 0.5] },
      uCover: { value: [1, 1] },
      uAspect: { value: 1 },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  let photo: HTMLElement | null = null;
  let hovering = false;
  let frame = 0;
  let strength = 0;
  const target = [0.5, 0.5];
  const pointer = [0.5, 0.5];

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.remove();
    photo = null;
    strength = 0;
  };

  const draw = (time: number) => {
    if (!photo) return;
    strength += ((hovering ? 1 : 0) - strength) * (hovering ? FADE_IN : FADE_OUT);
    // Faded out, or scrolled away while the pointer sat still: stop drawing.
    const box = photo.getBoundingClientRect();
    if ((!hovering && strength < 0.01) || box.bottom < 0 || box.top > window.innerHeight) return stop();
    pointer[0]! += (target[0]! - pointer[0]!) * 0.08;
    pointer[1]! += (target[1]! - pointer[1]!) * 0.08;
    program.uniforms.uTime.value = time / 1000;
    program.uniforms.uStrength.value = strength;
    renderer.render({ scene: mesh });
    frame = requestAnimationFrame(draw);
  };

  const showOn = (next: HTMLElement) => {
    const image = next.querySelector("img");
    if (!image?.complete || !image.naturalWidth) return;
    let texture = textures.get(image);
    if (!texture) {
      texture = new Texture(gl, {
        image,
        generateMipmaps: false,
        minFilter: gl.LINEAR,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
      });
      textures.set(image, texture);
    }
    const { width, height } = next.getBoundingClientRect();
    const box = width / height;
    const source = image.naturalWidth / image.naturalHeight;
    program.uniforms.tMap.value = texture;
    program.uniforms.uAspect.value = box;
    program.uniforms.uCover.value = box > source ? [1, source / box] : [box / source, 1];
    renderer.setSize(width, height);
    next.append(canvas);
    photo = next;
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const photoAt = (e: PointerEvent) => (e.target as Element | null)?.closest<HTMLElement>("[data-dish-photo]") ?? null;

  const onMove = (e: PointerEvent) => {
    const over = photoAt(e);
    if (!over) {
      hovering = false;
      return;
    }
    if (over !== photo) {
      if (photo) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      strength = 0;
      showOn(over);
    }
    hovering = over === photo;
    const box = over.getBoundingClientRect();
    target[0] = (e.clientX - box.left) / box.width;
    target[1] = 1 - (e.clientY - box.top) / box.height;
  };
  const onLeave = () => {
    hovering = false;
  };

  track.addEventListener("pointermove", onMove, { passive: true });
  track.addEventListener("pointerleave", onLeave);
  // Tells landing.css to swap the zoom hover for this effect.
  track.dataset.heat = "";

  return () => {
    track.removeEventListener("pointermove", onMove);
    track.removeEventListener("pointerleave", onLeave);
    track.removeAttribute("data-heat");
    stop();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

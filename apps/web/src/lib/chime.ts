"use client";

/**
 * Alert sound for staff screens, synthesised with the Web Audio API (no audio
 * files). Browsers only allow sound after the user has interacted with the
 * page, so screens call `unlockAudio()` on the first tap.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

export function audioUnlocked(): boolean {
  return ctx?.state === "running";
}

export async function unlockAudio(): Promise<boolean> {
  const a = audio();
  if (!a) return false;
  if (a.state !== "running") await a.resume().catch(() => {});
  return a.state === "running";
}

/** A bright two-note chime; `urgent` plays it twice. */
export function chime(urgent = false): void {
  const a = audio();
  if (!a || a.state !== "running") return;
  const notes = urgent ? [880, 1175, 880, 1175] : [880, 1318];
  notes.forEach((freq, i) => {
    const start = a.currentTime + i * 0.16;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.connect(gain).connect(a.destination);
    osc.start(start);
    osc.stop(start + 0.5);
  });
}

const MUTE_KEY = "staff-sound-muted";
export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode */
  }
}

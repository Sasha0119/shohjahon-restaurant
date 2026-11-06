import { cn } from "@/lib/cn";

/** Muted, theme-friendly tones; each guest gets the same one every time (hash of the name). */
const TONES = [
  "bg-[#C9A45C] text-[#15110A]", // gold
  "bg-[#8FA98A] text-[#0F1A0E]", // sage
  "bg-[#C98B7A] text-[#1E0E09]", // terracotta
  "bg-[#8E9BBF] text-[#0D1120]", // dusk blue
  "bg-[#B79BC2] text-[#1A0F1F]", // plum
  "bg-[#D9C08F] text-[#1E1608]", // champagne
];

function toneFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TONES[h % TONES.length]!;
}

/**
 * The initial of whoever added a cart line, in a small coloured disc with a
 * gold ring for "you". Decorative: the text next to it ("Added by Aziz")
 * carries the meaning for screen readers.
 */
export function GuestAvatar({
  name,
  me,
  size = 24,
  className,
}: {
  name: string;
  me?: boolean;
  size?: number;
  className?: string;
}) {
  const letter = (name.trim().charAt(0) || "•").toUpperCase();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none",
        toneFor(name),
        me && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
        className,
      )}
    >
      {letter}
    </span>
  );
}

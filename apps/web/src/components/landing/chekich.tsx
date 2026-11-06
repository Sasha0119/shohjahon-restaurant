const dots = (radius: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return (
      <circle
        key={`${radius}-${i}`}
        cx={(32 + radius * Math.cos(angle)).toFixed(3)}
        cy={(32 + radius * Math.sin(angle)).toFixed(3)}
        r={1.4}
      />
    );
  });

/** The dotted ring a chekich stamps into Uzbek non bread. */
export function ChekichRing({ size = 44, className = "sj-ring" }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" width={size} height={size} fill="currentColor" aria-hidden>
      {dots(28, 20)}
      {dots(19, 12)}
      {dots(10, 6)}
      <circle cx="32" cy="32" r="1.4" />
    </svg>
  );
}

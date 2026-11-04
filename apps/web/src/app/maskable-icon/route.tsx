import { renderMonogramIcon } from "@/lib/monogram-icon";

/** PWA "maskable" icon: the mark kept inside the safe zone that Android crops to a circle. */
export const dynamic = "force-static";

export function GET() {
  return renderMonogramIcon(512, { maskable: true });
}

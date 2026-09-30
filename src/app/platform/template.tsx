import type { ReactNode } from "react";

/** Re-monté à chaque navigation : entrée douce de la page (coupée si « réduire les animations »). */
export default function SpaceTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Relit la page à intervalle régulier tant qu'elle est visible : l'avancement
 * des appels (professeurs, accueil) s'affiche en temps réel.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);
  return null;
}

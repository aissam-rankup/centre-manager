"use client";

import { useEffect } from "react";

import { ROUTES } from "@/lib/auth/routes";

/**
 * Lien de récupération ou d'invitation du courriel Supabase par défaut : il
 * pointe vers l'adresse du site (« Site URL ») et arrive ici avec les jetons
 * dans le fragment (#access_token=…&type=recovery). Le fragment n'atteint
 * jamais le serveur : il est transmis tel quel à la page qui ouvre la
 * session et fait choisir le mot de passe.
 */
export function AuthLinkRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));
    if (params.has("access_token") || params.has("error_code")) {
      window.location.replace(`${ROUTES.welcome}${hash}`);
    }
  }, []);
  return null;
}

// Configuration en JavaScript pur : sur les hébergements à glibc ancienne (Hostinger mutualisé),
// le compilateur natif SWC ne se charge pas et un next.config.ts ne peut pas être transpilé.

// Domaine public de production (ex. Hostinger derrière un proxy) : autorisé pour les Server Actions.
const appHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null;
  } catch {
    return null;
  }
})();

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Moteur PDF (fiches d'assiduité) : chargé tel quel par Node, sans passer par le bundler.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Ressource pédagogique (8 Mo max : PDF ou image) + marge multipart, sous la limite de
      // 10 Mo des requêtes qui traversent le proxy ; photo élève : 2 Mo.
      bodySizeLimit: "9mb",
      ...(appHost ? { allowedOrigins: [appHost] } : {}),
    },
  },
};

export default nextConfig;

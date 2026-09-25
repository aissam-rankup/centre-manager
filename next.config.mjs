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
  experimental: {
    serverActions: {
      // Photo élève (2 Mo max côté serveur, ~150 Ko en pratique après compression) + marge multipart.
      bodySizeLimit: "3mb",
      ...(appHost ? { allowedOrigins: [appHost] } : {}),
    },
  },
};

export default nextConfig;

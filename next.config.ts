import type { NextConfig } from "next";

// Domaine public de production (ex. Hostinger derrière un proxy) : autorisé pour les Server Actions.
const appHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photo élève (2 Mo max côté serveur, ~150 Ko en pratique après compression) + marge multipart.
      bodySizeLimit: "3mb",
      ...(appHost ? { allowedOrigins: [appHost] } : {}),
    },
  },
};

export default nextConfig;

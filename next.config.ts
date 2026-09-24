import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photo élève (2 Mo max côté serveur, ~150 Ko en pratique après compression) + marge multipart.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;

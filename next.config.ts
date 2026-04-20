import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Zera o cache do router para páginas dinâmicas — sem isso, Next.js
    // pode servir HTML cacheado ao navegar entre meses
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
};

export default nextConfig;

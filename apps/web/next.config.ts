import type { NextConfig } from "next";

// Proxy /api → backend NestJS en Vercel (BL-006): el navegador solo habla con este
// dominio y la cookie httpOnly de sesión es de primera parte.
const API_ORIGIN = process.env.API_ORIGIN ?? "https://auto-master-erp-api.vercel.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;

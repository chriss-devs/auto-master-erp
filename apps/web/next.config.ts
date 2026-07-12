import type { NextConfig } from "next";

// Proxy /api → backend NestJS en Vercel (BL-006): el navegador solo habla con este
// dominio y la cookie httpOnly de sesión es de primera parte.
const API_ORIGIN = process.env.API_ORIGIN ?? "https://auto-master-erp-api.vercel.app";

// Headers de seguridad para las páginas del ERP (no aplican al proxy /api, que los pone el backend).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

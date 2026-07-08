import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Master Colón — ERP",
  description: "ERP de ferretería y autopartes — Colón, Panamá",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PA" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}

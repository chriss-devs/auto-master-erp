import type { Metadata } from "next";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";

config.autoAddCss = false; // el CSS se importa arriba; evita que la librería lo inyecte por JS (mismatch de hidratación)

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

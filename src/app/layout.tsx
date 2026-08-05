import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yuno Plan Manager",
  description: "Planificación segura de campañas de cuotas",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}


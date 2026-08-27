import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "FarmaGest",
  description: "Sistema de gestion para farmacia",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

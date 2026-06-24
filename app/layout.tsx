import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal do Colaborador — Tesserato",
  description: "Portal interno da Tesserato Contabilidade.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

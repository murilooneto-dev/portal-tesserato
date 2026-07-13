import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal do Colaborador — Tesserato",
  description: "Portal interno da Tesserato Contabilidade.",
  icons: { icon: '/logo.ico' },
};

const TEMA_SCRIPT = `
  try {
    if (localStorage.getItem('tesserato-theme') === 'light') {
      document.documentElement.classList.add('light');
    }
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

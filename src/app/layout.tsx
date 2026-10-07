import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
const sans = localFont({
  src: "../assets/fonts/GeistSans.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});
const mono = localFont({
  src: "../assets/fonts/GeistMono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MORPH",
  description:
    "A spatial intelligence environment built around your objective.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

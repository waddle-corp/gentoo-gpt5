import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopbarActions from "@/components/TopbarActions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gentoo",
  description: "Oracle of Delphi for Shopify Stores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground h-screen flex flex-col`}
      >
        <header className="h-14 border-b border-[#1f1f1f] px-4 md:px-6 flex items-center justify-between" style={{ backgroundColor: "var(--topbar)" }}>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">Gentoo</div>
            <div className="h-4 w-px bg-border" />
            <div className="font-semibold">Oracle of Delphi for Shopify Stores</div>
          </div>
          <TopbarActions />
        </header>
        <div className="flex-1 min-h-0">{children}</div>
      </body>
    </html>
  );
}

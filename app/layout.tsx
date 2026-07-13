import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "営業メールAI",
  description: "AIが企業を分析し、営業メールを自動作成",
};

const NAV_LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/services", label: "サービス管理" },
  { href: "/personas", label: "人格管理" },
  { href: "/history", label: "履歴" },
] as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="bg-[#1e293b] text-white">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <span className="font-semibold text-lg tracking-tight">
              営業メールAI
            </span>
            <nav className="flex items-center gap-6 text-sm">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-200 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="max-w-5xl mx-auto py-8 px-4">{children}</div>
      </body>
    </html>
  );
}

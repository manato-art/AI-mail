import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavHeader } from "./nav-header";
import { ThemeProvider } from "@/lib/theme-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SalesMail",
  description: "AIが企業HPを分析し、パーソナライズされた営業メールを自動作成",
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);var r=document.documentElement;r.setAttribute('data-theme',d?'dark':'light');if(d)r.classList.add('dark');var a=localStorage.getItem('accent');if(a){var c={blue:['#2563eb','#1d4ed8','#eff6ff','#1e3a5f'],indigo:['#6366f1','#4f46e5','#eef2ff','#312e81'],violet:['#7c3aed','#6d28d9','#f5f3ff','#3b1f6e'],rose:['#e11d48','#be123c','#fff1f2','#4c0519'],orange:['#ea580c','#c2410c','#fff7ed','#431407'],emerald:['#059669','#047857','#ecfdf5','#14332a'],teal:['#0d9488','#0f766e','#f0fdfa','#134e4a'],slate:['#475569','#334155','#f1f5f9','#1e293b']}[a];if(c){r.style.setProperty('--primary',c[0]);r.style.setProperty('--primary-hover',c[1]);r.style.setProperty('--primary-light',d?c[3]:c[2])}}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <NavHeader />
          <main className="py-4 pb-20 md:py-6 md:pb-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}

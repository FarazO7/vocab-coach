import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vocab Coach",
  description: "Turn words you half-know into words you actually say.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-2xl px-4 pb-16">
          <header className="flex items-center justify-between py-4">
            <Link href="/" className="text-lg font-semibold text-teal-800">
              Vocab Coach
            </Link>
            <nav className="flex gap-4 text-sm text-stone-700">
              <Link href="/notebook" className="hover:text-teal-800">
                Notebook
              </Link>
              <Link href="/settings" className="hover:text-teal-800">
                Settings
              </Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

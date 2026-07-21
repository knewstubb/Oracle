import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { SmartSearch } from "@/components/SmartSearch";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Oracle",
  description: "Commander deck management and AI-powered analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/mana-font@latest/css/mana.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/keyrune@latest/css/keyrune.min.css"
        />
      </head>
      <body className="flex h-screen overflow-hidden font-sans" suppressHydrationWarning>
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to main content
          </a>
          <Sidebar />
          <main id="main-content" className="flex-1 overflow-y-auto">
            {children}
          </main>
          <SmartSearch />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

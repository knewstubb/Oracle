import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/Sidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { Toaster } from "@/components/ui/sonner";
import { SmartSearch } from "@/components/SmartSearch";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Oracle",
  description: "Commander deck management and AI-powered analysis",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Oracle',
  },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#1d9e75',
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
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
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
          <main id="main-content" className="flex flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <MobileHeader />
            <div className="flex-1">
              {children}
            </div>
            {/* Version badge — mobile only, fixed bottom-left */}
            <div className="pointer-events-none fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-3 z-30 md:hidden">
              <span className="text-[10px] font-mono text-muted-foreground/40">
                v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'}
              </span>
            </div>
          </main>
          <SmartSearch />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

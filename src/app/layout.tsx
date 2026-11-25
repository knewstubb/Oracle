import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { TopNav } from "@/components/TopNav";
import { Toaster } from "@/components/ui/sonner";
import { SmartSearch } from "@/components/SmartSearch";
import { CardLocator } from "@/components/CardLocator";
import { OracleSidebar } from "@/components/OracleSidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { isAiChatEnabled } from "@/lib/ai-chat-switch";
import "./globals.css";

// Marks the page once the icon font has loaded (globals.css hides icons until then). If the font
// is not declared yet when this runs, load() answers with an empty list, so it tries again shortly.
const ICON_FONT_READY_SCRIPT = `(function(){var n=0;function go(){if(!document.fonts){document.documentElement.setAttribute('data-icon-font','ready');return}document.fonts.load('1em "Material Symbols Outlined"','check').then(function(f){if(f.length){document.documentElement.setAttribute('data-icon-font','ready')}else if(n++<200){setTimeout(go,50)}}).catch(function(){})}go()})()`;

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
  themeColor: '#7138CC',
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
          rel="preload"
          href="/fonts/material-symbols-outlined-subset.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Icons stay invisible until the icon font is ready, so an icon name never shows as text. */}
        <script dangerouslySetInnerHTML={{ __html: ICON_FONT_READY_SCRIPT }} />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/mana-font@latest/css/mana.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/keyrune@latest/css/keyrune.min.css"
        />
      </head>
      <body className="flex h-screen flex-col overflow-hidden font-sans" suppressHydrationWarning>
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to main content
          </a>
          <TopNav />
          {/* MainContentWrapper renders PageHeader + content area with sidebar */}
          <MainContentWrapper sidebar={isAiChatEnabled() ? <OracleSidebar /> : null}>
            {children}
          </MainContentWrapper>
          <SmartSearch />
          <CardLocator />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

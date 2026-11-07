import type { Metadata, Viewport } from "next";
import { Lora, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { DEFAULT_UI, UI_BOOT_SCRIPT } from "@/lib/ui-version";
import { ROLE_BOOT_SCRIPT } from "@/lib/role";

// Headings: Lora, a warm old-style serif whose capital J sits on the
// baseline (David disliked Fraunces' descending J in "James").
const display = Lora({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Lesson Studio", template: "%s · Lesson Studio" },
  description: "Lesson organization for private music teachers",
  // Added to an iPad or iPhone home screen, the app opens without Safari's
  // address bar and tabs, so the music stand gets the whole screen.
  appleWebApp: { capable: true, title: "Lesson Studio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1a17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-ui={DEFAULT_UI}
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: UI_BOOT_SCRIPT + ROLE_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

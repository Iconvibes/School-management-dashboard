import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Nonce-based CSP (src/proxy.js) needs a FRESH per-request nonce on every
// page's inline flight scripts — and Next can only apply it when the HTML is
// rendered per request. Static prerendering bakes the HTML once (no nonce),
// which the strict prod CSP would block outright. The pages are client-data
// shells anyway, so the per-request render cost is trivial.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edutrack — All-in-One School Management Platform",
  description:
    "Run your entire school from one cloud platform. Automated report cards, multi-class arms engine, teacher payroll tracking and secure role-based portals for super admins, teachers and students.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Edutrack",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#1e293b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

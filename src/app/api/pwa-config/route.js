import { NextResponse } from "next/server";
import { store } from "@/lib/store";

/**
 * GET /api/pwa-config — Serve school-branded PWA configuration.
 *
 * Returns the manifest.json content customized for the school's branding:
 *   - Custom app name (e.g. "Greenfield Schools Portal")
 *   - Custom theme color from school's brand color
 *   - Custom icons (school logo)
 *   - Shortcuts to key pages
 *
 * The service worker and manifest reference this endpoint for dynamic branding.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get("schoolId");

  // For now, return a default config
  // In production, this would query the school's branding settings
  const config = {
    name: "EduTrack School Portal",
    short_name: "EduTrack",
    description: "School management portal for parents, students, and teachers",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/parent/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pay Fees", url: "/parent/dashboard#fees", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    categories: ["education", "productivity"],
  };

  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

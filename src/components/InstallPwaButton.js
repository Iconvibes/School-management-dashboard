"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Monitor, Check } from "lucide-react";

/**
 * "Install Edutrack" button. Shows only when the browser supports PWA
 * installation (Android Chrome, Windows Edge/Chrome). On iOS, desktop
 * browsers without install support, or anyone who prefers the web,
 * the button stays hidden and the website works exactly the same.
 */
export default function InstallPwaButton({ variant = "solid", className = "" }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 ${className}`}
      >
        <Check className="h-4 w-4" /> Installed
      </span>
    );
  }

  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition";

  if (variant === "ghost") {
    return (
      <button
        onClick={handleInstall}
        className={`${base} border border-white/15 bg-white/5 text-white backdrop-blur hover:bg-white/10 ${className}`}
      >
        <Download className="h-4 w-4" /> Install the app
      </button>
    );
  }

  return (
    <button
      onClick={handleInstall}
      className={`${base} bg-navy-800 text-white shadow-lg shadow-navy-900/20 hover:bg-navy-700 ${className}`}
    >
      <span className="flex items-center gap-1">
        <Smartphone className="h-4 w-4" />
        <Monitor className="h-4 w-4" />
      </span>
      Install the app
    </button>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (client-side). Renders only when a site key is
 * provided — the login/register pages pass NEXT_PUBLIC_TURNSTILE_SITE_KEY, so
 * deployments without Turnstile configured see nothing and post no token.
 *
 * Loads the challenges.cloudflare.com script lazily (shared across pages via
 * the script element's id), renders the widget, and reports the token through
 * onTokenChange("") on expiry/error so the submit path always has a fresh
 * value to send.
 */
export default function Turnstile({ siteKey, onTokenChange }) {
  const ref = useRef(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!siteKey) return;

    const node = ref.current;
    const attach = () => {
      if (rendered.current || !node || !window.turnstile) return;
      rendered.current = true;
      window.turnstile.render(node, {
        sitekey: siteKey,
        callback: (token) => onTokenChange(token),
        "expired-callback": () => onTokenChange(""),
        "error-callback": () => onTokenChange(""),
        theme: "light",
      });
    };

    let script = document.getElementById("cf-turnstile-script");
    if (!script) {
      script = document.createElement("script");
      script.id = "cf-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = attach;
      document.head.appendChild(script);
    } else if (window.turnstile) {
      attach();
    } else {
      script.addEventListener("load", attach);
    }

    return () => {
      if (rendered.current && node && window.turnstile) {
        try {
          window.turnstile.reset(node);
        } catch {}
      }
    };
  }, [siteKey, onTokenChange]);

  if (!siteKey) return null;
  return <div ref={ref} className="mt-1" />;
}

"use client";

import { useState } from "react";
import { Send, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

/**
 * Client component for the blog newsletter signup. Submits to /api/newsletter,
 * which stores the subscription. Shows loading / error / success states.
 */
export default function NewsletterForm() {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    const data = new FormData(e.currentTarget);
    const payload = {
      email: String(data.get("email") || "").trim(),
      website: String(data.get("website") || ""), // honeypot
    };
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(json?.error || "Something went wrong. Please try again.");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setError("Network error — please check your connection and try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3.5 text-sm text-emerald-300">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        You&apos;re on the list — see you next month!
      </div>
    );
  }

  return (
    <form
      className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
      onSubmit={handleSubmit}
    >
      {/* Honeypot: hidden from humans, tempting to bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input
        type="email"
        name="email"
        required
        placeholder="you@yourschool.edu.ng"
        className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur transition placeholder:text-navy-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Subscribing…
          </>
        ) : (
          <>
            Subscribe <Send className="h-4 w-4" />
          </>
        )}
      </button>
      {status === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </form>
  );
}

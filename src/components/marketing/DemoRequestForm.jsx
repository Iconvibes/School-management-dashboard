"use client";

import { useState } from "react";
import { Send, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

/**
 * Client component for the marketing site's demo-request form. Submits to
 * /api/leads, which stores the lead. Shows loading / error / success states.
 */
export default function DemoRequestForm() {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      school: String(data.get("school") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      size: String(data.get("size") || "").trim(),
      interest: String(data.get("interest") || "").trim(),
      message: String(data.get("message") || "").trim(),
      company: String(data.get("company") || ""), // honeypot — always empty for humans
    };
    try {
      const res = await fetch("/api/leads", {
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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h3 className="mt-3 text-lg font-bold text-emerald-800">
          Request received!
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-emerald-700">
          Thanks for reaching out. We&apos;ll reply within one school day to
          schedule your demo.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-navy-200 bg-navy-50/50 px-4 py-3 text-sm text-navy-800 outline-none transition placeholder:text-navy-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      {/* Honeypot: hidden from humans, tempting to bots */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
            Your name
          </span>
          <input type="text" name="name" required placeholder="Mrs. Okafor" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
            School name
          </span>
          <input type="text" name="school" required placeholder="Sunrise International College" className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
          Work email
        </span>
        <input type="email" name="email" required placeholder="you@yourschool.edu.ng" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
          Phone / WhatsApp
        </span>
        <input type="tel" name="phone" placeholder="+234 812 345 6789" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
          How many students does your school have?
        </span>
        <select name="size" defaultValue="Under 150" className={inputCls}>
          <option>Under 150</option>
          <option>150 – 500</option>
          <option>500 – 1,000</option>
          <option>1,000+</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
          What are you most interested in?
        </span>
        <select name="interest" defaultValue="Everything — full tour" className={inputCls}>
          <option>Everything — full tour</option>
          <option>Report cards & grading</option>
          <option>Attendance</option>
          <option>Fee management & payments</option>
          <option>Parent portal</option>
          <option>Migrating from another system</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-500">
          Anything else?
        </span>
        <textarea
          name="message"
          rows={3}
          placeholder="Tell us about your term calendar, class arms, or anything else…"
          className={`${inputCls} resize-none`}
        />
      </label>

      {status === "error" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            Send demo request
            <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </>
        )}
      </button>
    </form>
  );
}

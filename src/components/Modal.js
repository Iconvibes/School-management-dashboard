"use client";

import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} animate-fade-up rounded-2xl bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-navy-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

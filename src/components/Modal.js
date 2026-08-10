"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, wide = false }) {
  // The portal only exists client-side. A `typeof document` guard would return
  // different trees for the same render pass (null vs portal) and trip a
  // hydration mismatch if a modal were ever open at initial render;
  // useSyncExternalStore with a server snapshot is the canonical pattern.
  // (subscribe is a no-op — the snapshot never changes after hydration.)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!open || !mounted) return null;

  // Rendered through a portal so the overlay covers the WHOLE viewport. A
  // modal mounted inside a transformed ancestor (e.g. the sidebar's
  // lg:translate-x-0) would otherwise have that ancestor as the fixed
  // containing block and render clipped to it — the notifications bell hit
  // exactly this, drawing a 224px modal inside the 256px sidebar.
  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col ${wide ? "max-w-2xl" : "max-w-md"} animate-fade-up rounded-2xl bg-white shadow-2xl`}
      >
        {/* shrink-0: the header stays pinned while a long body scrolls — without
            a max-height, a tall modal (the notifications inbox/digest) would
            overflow the fixed overlay with the top/bottom unreachable. */}
        <div className="flex shrink-0 items-center justify-between border-b border-navy-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-navy-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

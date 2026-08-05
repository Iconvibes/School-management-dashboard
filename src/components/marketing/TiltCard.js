"use client";

import { useRef } from "react";

/**
 * A card that tilts in 3D following the mouse and shows a moving glare.
 * Pure CSS perspective + transform — no animation library.
 *
 * Props:
 *  - children
 *  - maxTilt (deg, default 8)
 *  - glare (boolean, default true)
 *  - className
 */
export default function TiltCard({
  children,
  maxTilt = 8,
  glare = true,
  className = "",
}) {
  const ref = useRef(null);

  function onMouseMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * maxTilt;
    const ry = (px - 0.5) * maxTilt;
    el.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
    if (glare) {
      const glareEl = el.querySelector("[data-tilt-glare]");
      if (glareEl) {
        glareEl.style.opacity = "1";
        glareEl.style.background = `radial-gradient(circle at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 55%)`;
      }
    }
  }

  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0)";
    if (glare) {
      const glareEl = el.querySelector("[data-tilt-glare]");
      if (glareEl) glareEl.style.opacity = "0";
    }
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`relative transition-transform duration-200 will-change-transform ${className}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
      {glare && (
        <div
          data-tilt-glare
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{ opacity: 0 }}
        />
      )}
    </div>
  );
}

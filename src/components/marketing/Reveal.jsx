"use client";

import { useEffect, useRef } from "react";

/**
 * Reveals its children with a fade/slide/scale transition when scrolled
 * into view. Pure CSS + IntersectionObserver — no animation library.
 *
 * Props:
 *  - variant: "up" (default) | "left" | "right" | "scale"
 *  - delay:   transition delay in ms (for staggering)
 *  - className
 */
export default function Reveal({ children, variant = "up", delay = 0, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const variantClass =
    variant === "left"
      ? "reveal reveal-left"
      : variant === "right"
      ? "reveal reveal-right"
      : variant === "scale"
      ? "reveal reveal-scale"
      : "reveal";

  return (
    <div
      ref={ref}
      className={`${variantClass} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

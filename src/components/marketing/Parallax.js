"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-driven parallax: the child translates on the Y axis at a different
 * speed than the page (like layers moving in depth). Pure rAF — cheap.
 *
 * Props:
 *  - speed: 0.5 = half speed, 1 = same speed, 0.2 = subtle, 1.5 = fast
 *  - className
 */
export default function Parallax({ children, speed = 0.3, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elCenter = rect.top + rect.height / 2;
      const offset = (elCenter - viewportCenter) * speed;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}

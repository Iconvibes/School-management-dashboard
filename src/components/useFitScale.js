"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scale a fixed-natural-width sheet (A4 previews render at 794px) to fit the
 * modal container on ANY screen size, so a phone never has to slide sideways
 * to see the whole card. Returns [containerRef, scale]:
 *
 *   const [sheetRef, scale] = useFitScale(794, open);
 *   <div ref={sheetRef} ...>            ← the measured container
 *     <div style={{ transform: `scale(${scale})` }} className="origin-top">
 *       <ReportCard ... />              ← the 794px-wide sheet
 *     </div>
 *   </div>
 *
 * `active` mirrors the modal's `open` — the sheet is only mounted while the
 * modal is open, so the effect (and ResizeObserver) must (re)start with it.
 * Defaults to 0.62 (the old mobile breakpoint) until first measured so there
 * is never an unscaled flash.
 */
export default function useFitScale(naturalWidth = 794, active = true) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.62);

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const measure = () => {
      const avail = el.getBoundingClientRect().width;
      setScale(Math.min(1, avail / naturalWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidth, active]);

  return [ref, scale];
}

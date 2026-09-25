"use client";

import { useRef, useCallback } from "react";

/**
 * Returns touch event handlers that close a panel when the user swipes left
 * past a threshold. Designed for mobile sidebars and drawers.
 *
 * @param {Function} onClose - called when swipe-left exceeds threshold
 * @param {Object} [opts]
 * @param {number} [opts.threshold=50] - minimum horizontal distance (px) to trigger close
 * @param {number} [opts.maxVertical=80] - max vertical movement allowed before gesture is cancelled (scroll detection)
 * @returns {{ onTouchStart, onTouchMove, onTouchEnd }}
 */
export default function useSwipeToClose(onClose, { threshold = 50, maxVertical = 80 } = {}) {
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });

  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: true };
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!touchRef.current.swiping) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchRef.current.startX;
    const deltaY = Math.abs(touch.clientY - touchRef.current.startY);

    // If vertical movement exceeds threshold, this is a scroll — abort gesture
    if (deltaY > maxVertical) {
      touchRef.current.swiping = false;
      return;
    }

    // Prevent pull-to-refresh and rubber-banding while swiping left
    if (deltaX < 0) {
      e.preventDefault();
    }
  }, [maxVertical]);

  const onTouchEnd = useCallback((e) => {
    if (!touchRef.current.swiping) return;
    touchRef.current.swiping = false;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchRef.current.startX;
    const deltaY = Math.abs(touch.clientY - touchRef.current.startY);

    // Only trigger on horizontal swipe-left past threshold
    if (deltaX < -threshold && deltaY < maxVertical) {
      onClose();
    }
  }, [onClose, threshold, maxVertical]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  findSlotsToAlert,
  isoDay,
  minutesToLabel,
  nextUpClass,
  pruneExpiredAlerts,
} from "@/lib/class-alerts";
import { DEFAULT_PERIOD_TIMES, getPeriodTimes, schoolDayOf } from "@/lib/timetable";

/** The lead times offered in the dashboard ("ring X minutes before"). */
export const ALERT_LEAD_OPTIONS = Object.freeze([0, 5, 10, 15, 30]);

/** Tick cadence — loose enough to be free, tight enough to ring on time. */
const TICK_MS = 15000;
const BANNER_MS = 20000;

/** A gentle three-note bell arpeggio via Web Audio (no audio asset needed). */
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [659.25, 783.99, 987.77]; // E5 → G5 → B5
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.42);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {}
}

/** Desktop notification — rings even when the tab is in the background. */
function fireNotification(slot, key) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(`Class starting — ${slot.subject}`, {
      body: `${slot.subject} · ${slot.classArm} at ${minutesToLabel(slot.startMinutes)} — get to class!`,
      tag: key, // one notification per slot occurrence
    });
  } catch {}
}

/**
 * Live class-alert scheduler. Loads the teacher's alert prefs, their weekly
 * timetable and the school's bell schedule, then rings when a class period
 * is about to start (see src/lib/class-alerts.js for the exact window):
 *
 *  - an in-app alarm banner (auto-dismisses),
 *  - a web Notification when the browser granted permission,
 *  - a Web Audio chime when sound is on (works after any user gesture).
 *
 * Also computes the "next class" ticker shown in the timetable view.
 *
 * @param {number} [scopeVersion]  bump when the teacher's assigned scope
 *   changes (e.g. the dashboard bounced a revoked arm). The data reloads, so
 *   the scheduler stops ringing for classes the teacher no longer teaches.
 */
export function useClassAlerts(scopeVersion = 0) {
  const [prefs, setPrefs] = useState({ enabled: false, leadMinutes: 5, soundOn: true });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [entries, setEntries] = useState([]);
  const [periodTimes, setPeriodTimes] = useState(DEFAULT_PERIOD_TIMES);
  const schoolRef = useRef(null); // the school doc — for per-day bell resolution
  const [next, setNext] = useState(null);
  const [alert, setAlert] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );
  const flagged = useRef(new Set()); // `${YYYY-MM-DD}|${period}` — one ring per occurrence
  const showingKey = useRef(null); // the alert currently on screen
  const dismissTimer = useRef(null); // the banner auto-dismiss timer

  // Load prefs + my timetable + the school's bell schedule once (and again
  // whenever scopeVersion bumps — a revoked arm must stop ringing at once).
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/timetable/alerts").then((r) => r.json()),
      // mine=1: the scheduler must only ever ring for the CALLER's own
      // classes — a teacher's arms contain colleagues' slots too.
      fetch("/api/timetable?mine=1").then((r) => r.json()),
      fetch("/api/school").then((r) => r.json()),
    ])
      .then(([alertsRes, ttRes, schoolRes]) => {
        if (!alive) return;
        if (alertsRes.prefs) setPrefs(alertsRes.prefs);
        setEntries(ttRes.entries || []);
        schoolRef.current = schoolRes.school || null;
        // School-wide bell (kept for exposure); the tick resolves the CURRENT
        // day's schedule so a short Friday never rings its dropped periods.
        setPeriodTimes(getPeriodTimes(schoolRes.school));
        setPrefsLoaded(true);
      })
      .catch(() => {
        if (alive) setPrefsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [scopeVersion]);

  const tick = useCallback(() => {
    const now = new Date();
    // Resolve TODAY's bell schedule — a weekday with its own override (e.g. a
    // Friday that ends at period 6) rings only its own periods.
    const dayTimes = getPeriodTimes(schoolRef.current, schoolDayOf(now));
    pruneExpiredAlerts({ periodTimes: dayTimes, now, alreadyAlerted: flagged.current });
    setNext(nextUpClass({ entries, periodTimes: dayTimes, now }));
    if (!prefs.enabled) return;
    const slots = findSlotsToAlert({
      entries,
      periodTimes: dayTimes,
      now,
      leadMinutes: prefs.leadMinutes,
      alreadyAlerted: flagged.current,
    });
    if (!slots.length) return;
    const slot = slots[0];
    const key = `${isoDay(now)}|${slot.period}`;
    flagged.current.add(key);
    if (showingKey.current === key) return; // already ringing for this slot
    showingKey.current = key;
    setAlert(slot);
    if (prefs.soundOn) playChime();
    fireNotification(slot, key);
    clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      setAlert((a) => (a && a.period === slot.period ? null : a));
      showingKey.current = null;
      dismissTimer.current = null;
    }, BANNER_MS);
    // The tick resolves the CURRENT day's bell from schoolRef (a ref — never
    // re-creates the callback), so `periodTimes` (exposed school-wide) is not
    // a dependency here.
  }, [prefs.enabled, prefs.leadMinutes, prefs.soundOn, entries]);

  useEffect(() => {
    if (!prefsLoaded) return;
    const id = setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Defer the first tick out of the synchronous effect body (the interval
    // and visibility handler keep it fresh afterwards); calling setState
    // synchronously inside an effect trips the react-hooks lint rule.
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
      clearTimeout(dismissTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick, prefsLoaded]);

  /** PUT a pref change; requests Notification permission when alerts turn on. */
  async function updatePref(patch) {
    const res = await fetch("/api/timetable/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && data.prefs) {
      setPrefs(data.prefs);
      if (data.prefs.enabled && notifPermission === "default" && "Notification" in window) {
        Notification.requestPermission().then((p) => setNotifPermission(p));
      }
    }
    return { ok: res.ok, error: data.error };
  }

  function dismissAlert() {
    setAlert(null);
    showingKey.current = null;
    clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }

  return {
    prefs,
    prefsLoaded,
    updatePref,
    notifPermission,
    next,
    alert,
    dismissAlert,
    periodTimes,
    entries,
    leadOptions: ALERT_LEAD_OPTIONS,
    minutesToLabel,
  };
}

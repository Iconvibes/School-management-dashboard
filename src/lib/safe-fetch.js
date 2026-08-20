/**
 * safeFetch — a thin wrapper around fetch that parses JSON and surfaces
 * errors instead of swallowing them silently. Returns { data, error } so
 * callers never need try/catch for simple GETs.
 *
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<{ data: any, error: string | null }>}
 */
export async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: text || `Request failed (${res.status})` };
    }
    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err?.message || "Network error" };
  }
}

/**
 * safeFetchJson — same as safeFetch but returns the parsed JSON body
 * directly (backward-compatible with the old .then(r => r.json()) pattern).
 * If the response is not OK, returns null and logs the error.
 *
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {string} [label] — human-readable name for error messages
 * @returns {Promise<any>}
 */
export async function safeFetchJson(url, opts, label) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[${label || url}] HTTP ${res.status}:`, text);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[${label || url}] fetch failed:`, err?.message);
    return null;
  }
}

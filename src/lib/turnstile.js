/**
 * Cloudflare Turnstile — server-side verification (login + register).
 *
 * Graceful degradation: when TURNSTILE_SECRET_KEY is NOT set (demo, dev,
 * pre-launch) the check is disabled and every request passes — the widget
 * isn't even rendered client-side. When it IS set, the token must verify:
 *   - missing/invalid token            -> fail (bot protection is ON);
 *   - siteverify answers success:false -> fail;
 *   - siteverify unreachable (network) -> PASS (fail-open): at the 08:00
 *     rush, login availability matters more than a bot that the rate
 *     limiter + account lockout already blunt; the operator chose Turnstile,
 *     so an explicit rejection is honored, but a CF outage must not lock
 *     every school out. This tradeoff is documented in docs/scaling.md.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

/**
 * @param {string|undefined} token  the widget's cf-turnstile-response
 * @returns {Promise<{enabled: boolean, ok: boolean}>}
 *   enabled: whether Turnstile is configured for this deployment.
 *   ok:      whether the request passes the check (always true when disabled).
 */
export async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { enabled: false, ok: true };

  if (typeof token !== "string" || token.length === 0) {
    return { enabled: true, ok: false };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json();
    return { enabled: true, ok: data?.success === true };
  } catch {
    // Network failure / timeout / bad response → fail open (see header note).
    return { enabled: true, ok: true };
  }
}

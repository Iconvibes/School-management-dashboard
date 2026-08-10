/**
 * Controllable `next/headers` mock — lets integration tests drive REAL route
 * handlers (which read the session cookie via getSession()) without an HTTP
 * server. tests/policy-integration.test.js maps the `next/headers.js`
 * specifier here with a node:module resolve hook, then sets the session token
 * per request:
 *
 *   __setSessionToken(signToken({ userId, role, schoolId })); // "" = logged out
 *
 * Only the session cookie is modeled — routes never read anything else, and
 * `set` is a no-op because the guarded paths return before setting cookies.
 */
import { COOKIE_NAME } from "../../src/lib/token.js";

let sessionToken = "";

/** Set the value of the edutrack_token cookie the next request will see. */
export function __setSessionToken(token) {
  sessionToken = token || "";
}

/** next/headers API surface the app uses: async cookies() → cookie store. */
export async function cookies() {
  return {
    get: (name) => (name === COOKIE_NAME && sessionToken ? { value: sessionToken } : undefined),
    set: () => {},
  };
}

/**
 * Mongo store — re-export hub.
 *
 * The original 2,700-line implementation was split by model/entity into
 * src/lib/mongo/*.js (see scripts/split-mongo-store.py for the mapping).
 * Every function signature is unchanged; importers keep using @/lib/mongo-store.
 * The dual-store contract test (tests/dual-store-contract.test.js) pins these
 * signatures against the demo store.
 */
export * from "./mongo/schools.js";
export * from "./mongo/users.js";
export * from "./mongo/scores.js";
export * from "./mongo/fees.js";
export * from "./mongo/attendance.js";
export * from "./mongo/timetable.js";
export * from "./mongo/leads.js";
export * from "./mongo/billing.js";
export * from "./mongo/platform.js";
export * from "./mongo/notifications.js";
export * from "./mongo/teaching.js";
export * from "./mongo/alumni.js";
export * from "./mongo/push.js";
export * from "./mongo/analytics.js";
export * from "./mongo/messages.js";
export * from "./mongo/compliance.js";
export * from "./mongo/auth-tokens.js";

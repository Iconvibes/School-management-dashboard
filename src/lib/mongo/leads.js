/**
 * Mongo store — leads domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  Lead,
  blindEmailIndex,
  encryptField,
  ready,
  safe,
} from "./shared.js";

// ---- Marketing leads ---------------------------------------------------------

/** Create a lead (demo request or newsletter subscription). Returns null when
 *  the email already exists for that kind (the unique index enforces it). */
export async function createLead({ kind, name = "", school = "", email, phone = "", size = "", interest = "", message = "", ip = "", userAgent = "" }) {
  await ready();
  try {
    const lead = await Lead.create({
      kind,
      name,
      school,
      email: encryptField(email),
      emailIdx: blindEmailIndex(email),
      phone: encryptField(phone),
      size,
      interest,
      message,
      ip,
      userAgent,
    });
    return safe(lead);
  } catch (err) {
    // E11000 duplicate key → already subscribed / already requested
    if (err?.code === 11000) return null;
    throw err;
  }
}

/** Most recent leads first, optionally filtered by kind. */
export async function listLeads(kind) {
  await ready();
  const query = kind ? { kind } : {};
  return (await Lead.find(query).sort({ createdAt: -1 })).map(safe);
}

/**
 * Mongo store — push domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  ready,
  safe,
} from "./shared.js";

// ── Push Subscriptions ──────────────────────────────────────────────
import PushSubscription from "@/models/PushSubscription";

export async function savePushSubscription({ schoolId, userId, endpoint, keys, userAgent }) {
  await ready();
  const existing = await PushSubscription.findOne({ endpoint });
  if (existing) {
    existing.keys = keys;
    existing.userAgent = userAgent || existing.userAgent;
    existing.active = true;
    existing.lastUsedAt = new Date();
    await existing.save();
    return safe(existing);
  }
  const doc = await PushSubscription.create({ schoolId, userId, endpoint, keys, userAgent: userAgent || "", active: true, lastUsedAt: new Date() });
  return safe(doc);
}

export async function listPushSubscriptions(schoolId, userIds) {
  await ready();
  const q = { schoolId, active: true };
  if (userIds && userIds.length) q.userId = { $in: userIds };
  return (await PushSubscription.find(q)).map(safe);
}

export async function removePushSubscriptions(ids) {
  await ready();
  await PushSubscription.updateMany({ _id: { $in: ids } }, { active: false });
}

export async function deletePushSubscription(endpoint) {
  await ready();
  await PushSubscription.deleteOne({ endpoint });
  return true;
}

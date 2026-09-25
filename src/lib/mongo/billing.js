/**
 * Mongo store — billing domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  School,
  ready,
  safe,
} from "./shared.js";

// ── SaaS Subscription Management ─────────────────────────────────────────

export async function updateSchoolSubscription(schoolId, updates) {
  await ready();
  const allowed = [
    "billingPlan", "billingCycle", "paystackCustomerCode",
    "paystackSubscriptionCode", "paystackPlanCode",
    "subscriptionStatus", "currentPeriodEnd", "trialStart", "trialEnd",
    "lastPaymentFailure", "lastPaymentFailureReason", "pausedAt",
  ];
  const patch = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }
  patch.updatedAt = new Date();
  return safe(await School.findByIdAndUpdate(schoolId, patch, { new: true }));
}

export async function listSchoolSubscriptions() {
  await ready();
  const docs = await School.find({ status: { $ne: "deleted" } }).select(
    "name brandColor billingPlan billingCycle subscriptionStatus currentPeriodEnd trialStart trialEnd paystackCustomerCode paystackSubscriptionCode"
  );
  return docs.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    brandColor: d.brandColor || "#2563EB",
    billingPlan: d.billingPlan || "trial",
    billingCycle: d.billingCycle || "monthly",
    subscriptionStatus: d.subscriptionStatus || "trial",
    currentPeriodEnd: d.currentPeriodEnd || null,
    trialStart: d.trialStart || null,
    trialEnd: d.trialEnd || null,
    paystackCustomerCode: d.paystackCustomerCode || "",
    paystackSubscriptionCode: d.paystackSubscriptionCode || "",
    isPlatformSchool: !!d.isPlatformSchool,
  }));
}

export async function startSchoolTrial(schoolId) {
  await ready();
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);
  return safe(await School.findByIdAndUpdate(schoolId, {
    billingPlan: "trial",
    subscriptionStatus: "trial",
    trialStart: now,
    trialEnd,
    updatedAt: now,
  }, { new: true }));
}

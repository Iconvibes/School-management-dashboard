import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { verifyWebhookSignature } from "@/lib/paystack";
import { broadcastToSchool } from "@/lib/sse-manager";
import * as log from "@/lib/log";

// Lazy-load platform alert creator to avoid circular imports
async function createAlert(opts) {
  try {
    const { createPlatformAlert } = await import("@/modules/platform/store");
    return await createPlatformAlert(opts);
  } catch {}
}

/**
 * POST /api/webhooks/paystack — Handle Paystack payment webhooks.
 *
 * When a parent completes payment, Paystack sends a webhook here.
 * The system:
 *   1. Verifies the webhook signature
 *   2. Matches the payment to the student (via reference metadata)
 *   3. Updates the fee ledger
 *   4. Sends confirmation notification (WhatsApp/SMS/in-app)
 *   5. Broadcasts real-time update to the parent's dashboard
 */
export async function POST(req) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  // Verify webhook signature in production
  if (process.env.PAYSTACK_WEBHOOK_SECRET) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event;

  // ── Subscription payment events ─────────────────────────────────
  // Paystack sends these for recurring subscription billing:
  //   invoice.payment_failed — subscription invoice charge failed
  //   charge.failed          — a charge attempt failed (card declined, etc.)
  //   subscription.disable   — Paystack auto-pauses after repeated failures
  //   subscription.enable    — Paystack re-enables after successful retry

  if (eventType === "invoice.payment_failed" || eventType === "charge.failed") {
    return handleFailedPayment(event, log, createAlert, store);
  }

  if (eventType === "subscription.disable") {
    return handleSubscriptionPaused(event, log, createAlert, store);
  }

  if (eventType === "subscription.enable") {
    return handleSubscriptionResumed(event, log, createAlert, store);
  }

  // ── Successful charge (parent fee payments) ──────────────────────
  if (eventType !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data } = event;
  const reference = data.reference;
  const metadata = data.metadata || {};
  const amount = data.amount / 100; // kobo to naira

  // Extract payment details from metadata
  const schoolId = metadata.school_id;
  const studentId = metadata.student_id;
  const parentId = metadata.parent_id;

  if (!schoolId || !studentId) {
    log.warn("paystack-webhook", "Missing school_id or student_id in metadata:", reference);
    return NextResponse.json({ ok: true, warning: "Missing metadata" });
  }

  try {
    // Check for duplicate processing
    const existingPayments = await store.listFeePayments?.(schoolId, { studentId }) || [];
    const alreadyProcessed = existingPayments.some((p) => p.paystackReference === reference || p.receiptNo === reference);
    if (alreadyProcessed) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Record the payment
    const payment = await store.createFeePayment({
      schoolId,
      studentId,
      amount,
      method: data.channel === "card" ? "CARD" :
              data.channel === "bank" ? "TRANSFER" :
              data.channel === "ussd" ? "USSD" : "CARD",
      receiptNo: reference,
      status: "CONFIRMED", // auto-confirm webhooks payments
      note: `Paystack payment (${data.channel}) — auto-confirmed via webhook`,
      session: metadata.session || "",
      term: metadata.term || "",
      paystackReference: reference,
      webhookVerified: true,
    });

    // Send confirmation notification
    try {
      const { sendReportCardReady } = await import("@/lib/message-queue");
      // Use the message queue to send payment confirmation
      const notificationBody = [
        `Payment confirmed!`,
        "",
        `  Amount: ₦${amount.toLocaleString()}`,
        `  Reference: ${reference}`,
        `  Method: ${data.channel}`,
        "",
        "This payment has been automatically confirmed and applied to the student's balance.",
      ].join("\n");

      const { createNotification } = await import("@/lib/store");
      await createNotification({
        schoolId,
        kind: "fee_payment",
        to: [],
        subject: `Payment confirmed · ${reference}`,
        preview: `₦${amount.toLocaleString()} payment confirmed via ${data.channel}`,
        body: notificationBody,
        amount,
      });
    } catch {
      // Notification failure is non-fatal
    }

    // Broadcast real-time update to parent dashboard
    broadcastToSchool(schoolId, {
      type: "payment_confirmed",
      data: {
        studentId,
        amount,
        reference,
        method: data.channel,
      },
    }, parentId);

    return NextResponse.json({ ok: true, paymentId: payment?.id });
  } catch (err) {
    log.error("paystack-webhook", "Processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// ── Subscription Event Handlers ───────────────────────────────────────

/**
 * Handle failed subscription payment (invoice.payment_failed / charge.failed).
 * Marks the school's subscription as "past_due" and sends a platform alert.
 * The school's non-admin logins are blocked by the billing enforcement in
 * login-queue.js once the grace period expires.
 */
async function handleFailedPayment(event, log, createAlert, store) {
  const { data } = event;
  const metadata = data.metadata || {};
  const subscriptionCode = data.subscription?.subscription_code || metadata.subscription_code || "";
  const customerCode = data.customer?.customer_code || metadata.customer_code || "";
  const reference = data.reference || "";
  const amount = (data.amount || 0) / 100; // kobo to naira
  const attempt = data.retry || 1;

  // Find the school by subscription code or customer code
  let schoolId = metadata.school_id;
  let school = schoolId ? await store.getSchoolById(schoolId) : null;

  if (!school && subscriptionCode) {
    // Search all schools for matching subscription code
    const allIds = await store.listSchoolIds();
    for (const id of allIds) {
      const s = await store.getSchoolById(id);
      if (s && (s.paystackSubscriptionCode === subscriptionCode || s.paystackCustomerCode === customerCode)) {
        schoolId = id;
        school = s;
        break;
      }
    }
  }

  if (!school) {
    log.warn("paystack-webhook", "Failed payment — could not find school:", { subscriptionCode, customerCode, reference });
    return NextResponse.json({ ok: true, warning: "School not found" });
  }

  log.warn("paystack-webhook", "Subscription payment failed:", {
    schoolId,
    schoolName: school.name,
    reference,
    amount,
    attempt,
  });

  // Mark subscription as past_due (not fully expired — still has retry window)
  await store.updateSchoolSubscription(schoolId, {
    subscriptionStatus: "past_due",
    lastPaymentFailure: new Date().toISOString(),
    lastPaymentFailureReason: data.gateway_response || "Payment failed",
  });

  // Send platform alert
  await createAlert({
    schoolId,
    schoolName: school.name,
    type: "subscription_past_due",
    severity: attempt >= 3 ? "critical" : "warning",
    title: `Payment failed for ${school.name}`,
    message: `₦${amount.toLocaleString()} payment failed (attempt ${attempt}). ${data.gateway_response || "Card declined or insufficient funds."} Subscription will be paused if retries exhaust.`,
    meta: { reference, amount, attempt, subscriptionCode, gatewayResponse: data.gateway_response },
  });

  // Notify school admin
  try {
    const schoolAdmin = (await store.listUsers?.({ schoolId }))?.find((u) => u.role === "SUPER_ADMIN");
    if (schoolAdmin) {
      const { createNotification } = await import("@/lib/store");
      await createNotification({
        schoolId,
        kind: "billing",
        to: [schoolAdmin.id],
        subject: "Payment failed — action required",
        preview: `Your subscription payment of ₦${amount.toLocaleString()} failed. Please update your payment method.`,
        body: [
          `Your recurring subscription payment of ₦${amount.toLocaleString()} was not successful.`,
          "",
          `Reason: ${data.gateway_response || "Payment declined"}`,
          `Attempt: ${attempt}`,
          "",
          "Please update your payment method in the Billing tab to avoid service interruption.",
        ].join("\n"),
      });
    }
  } catch {}

  return NextResponse.json({ ok: true, handled: "payment_failed" });
}

/**
 * Handle Paystack pausing a subscription (subscription.disable).
 * This fires after all retry attempts are exhausted.
 * Sets subscriptionStatus to "paused" and blocks non-admin logins.
 */
async function handleSubscriptionPaused(event, log, createAlert, store) {
  const { data } = event;
  const subscriptionCode = data.subscription_code || data.id || "";
  const customerCode = data.customer?.customer_code || "";
  const metadata = data.metadata || {};

  // Find school
  let schoolId = metadata.school_id;
  let school = schoolId ? await store.getSchoolById(schoolId) : null;

  if (!school && subscriptionCode) {
    const allIds = await store.listSchoolIds();
    for (const id of allIds) {
      const s = await store.getSchoolById(id);
      if (s && (s.paystackSubscriptionCode === subscriptionCode || s.paystackCustomerCode === customerCode)) {
        schoolId = id;
        school = s;
        break;
      }
    }
  }

  if (!school) {
    log.warn("paystack-webhook", "Subscription paused — school not found:", { subscriptionCode });
    return NextResponse.json({ ok: true, warning: "School not found" });
  }

  log.warn("paystack-webhook", "Subscription paused:", { schoolId, schoolName: school.name, subscriptionCode });

  // Set subscription to paused — this blocks non-admin logins via billing enforcement
  await store.updateSchoolSubscription(schoolId, {
    subscriptionStatus: "paused",
    pausedAt: new Date().toISOString(),
  });

  // Platform alert
  await createAlert({
    schoolId,
    schoolName: school.name,
    type: "subscription_past_due",
    severity: "critical",
    title: `Subscription paused — ${school.name}`,
    message: `Payment retries exhausted. The subscription for ${school.name} has been paused. Staff and student logins are blocked until payment resumes.`,
    meta: { subscriptionCode, action: "paused" },
  });

  // Notify school admin
  try {
    const schoolAdmin = (await store.listUsers?.({ schoolId }))?.find((u) => u.role === "SUPER_ADMIN");
    if (schoolAdmin) {
      const { createNotification } = await import("@/lib/store");
      await createNotification({
        schoolId,
        kind: "billing",
        to: [schoolAdmin.id],
        subject: "Subscription paused",
        preview: "Your subscription has been paused due to failed payments. Update your payment method to restore access.",
        body: [
          "Your EduTrack subscription has been paused due to repeated failed payments.",
          "",
          "Teachers, students, and parents can no longer log in until the subscription is renewed.",
          "School administrators can still access the dashboard to manage billing.",
          "",
          "Please update your payment method in the Billing tab immediately.",
        ].join("\n"),
      });
    }
  } catch {}

  return NextResponse.json({ ok: true, handled: "subscription_paused" });
}

/**
 * Handle Paystack re-enabling a subscription (subscription.enable).
 * Fires when a retry succeeds after the subscription was paused.
 * Restores the subscription to "active" and resumes access.
 */
async function handleSubscriptionResumed(event, log, createAlert, store) {
  const { data } = event;
  const subscriptionCode = data.subscription_code || data.id || "";
  const customerCode = data.customer?.customer_code || "";
  const metadata = data.metadata || {};

  // Find school
  let schoolId = metadata.school_id;
  let school = schoolId ? await store.getSchoolById(schoolId) : null;

  if (!school && subscriptionCode) {
    const allIds = await store.listSchoolIds();
    for (const id of allIds) {
      const s = await store.getSchoolById(id);
      if (s && (s.paystackSubscriptionCode === subscriptionCode || s.paystackCustomerCode === customerCode)) {
        schoolId = id;
        school = s;
        break;
      }
    }
  }

  if (!school) {
    log.warn("paystack-webhook", "Subscription resumed — school not found:", { subscriptionCode });
    return NextResponse.json({ ok: true, warning: "School not found" });
  }

  log.info("paystack-webhook", "Subscription resumed:", { schoolId, schoolName: school.name, subscriptionCode });

  // Restore to active with new period end
  const newPeriodEnd = new Date();
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

  await store.updateSchoolSubscription(schoolId, {
    subscriptionStatus: "active",
    currentPeriodEnd: newPeriodEnd.toISOString(),
    pausedAt: null,
  });

  // Platform alert
  await createAlert({
    schoolId,
    schoolName: school.name,
    type: "subscription_activated",
    severity: "info",
    title: `Subscription resumed — ${school.name}`,
    message: `Payment retry succeeded. The subscription for ${school.name} is active again. All users can log in.`,
    meta: { subscriptionCode, action: "resumed" },
  });

  // Notify school admin
  try {
    const schoolAdmin = (await store.listUsers?.({ schoolId }))?.find((u) => u.role === "SUPER_ADMIN");
    if (schoolAdmin) {
      const { createNotification } = await import("@/lib/store");
      await createNotification({
        schoolId,
        kind: "billing",
        to: [schoolAdmin.id],
        subject: "Subscription restored",
        preview: "Your subscription is active again. All staff and students can log in.",
        body: [
          "Great news! Your subscription payment was successful.",
          "",
          "Your EduTrack subscription is now active. All staff, students, and parents can log in again.",
          "",
          `Next billing date: ${newPeriodEnd.toLocaleDateString()}`,
        ].join("\n"),
      });
    }
  } catch {}

  return NextResponse.json({ ok: true, handled: "subscription_resumed" });
}

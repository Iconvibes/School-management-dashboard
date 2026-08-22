import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { verifyWebhookSignature } from "@/lib/paystack";
import { broadcastToSchool } from "@/lib/sse-manager";
import * as log from "@/lib/log";

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

  // Only process successful charges
  if (event.event !== "charge.success") {
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

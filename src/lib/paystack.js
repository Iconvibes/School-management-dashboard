/**
 * Paystack payment gateway integration.
 *
 * Handles payment initialization, verification, and webhook processing.
 * When a parent pays via bank transfer, the system auto-matches the payment
 * to the student using the reference number.
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY — Paystack secret API key
 *   NEXT_PUBLIC_PAYSTACK_KEY — Paystack public key (client-side)
 *   PAYSTACK_WEBHOOK_SECRET — webhook signature verification secret
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function getHeaders() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return null;
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Initialize a Paystack transaction.
 *
 * @param {Object} opts
 * @param {number} opts.amount — amount in kobo (Naira × 100)
 * @param {string} opts.email — customer email
 * @param {string} opts.reference — unique transaction reference
 * @param {string} [opts.callbackUrl] — URL to redirect after payment
 * @param {Object} [opts.metadata] — additional data to attach to the transaction
 * @returns {Promise<{ success: boolean, authorizationUrl?: string, accessCode?: string, error?: string }>}
 */
export async function initializeTransaction({ amount, email, reference, callbackUrl, metadata }) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100), // convert to kobo
        email,
        reference,
        callback_url: callbackUrl,
        metadata: metadata || {},
      }),
    });

    const data = await res.json();
    if (data.status) {
      return {
        success: true,
        authorizationUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        reference: data.data.reference,
      };
    }
    return { success: false, error: data.message || "Initialization failed" };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Verify a Paystack transaction.
 *
 * @param {string} reference — transaction reference
 * @returns {Promise<{ success: boolean, amount?: number, status?: string, metadata?: Object, error?: string }>}
 */
export async function verifyTransaction(reference) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, { headers });
    const data = await res.json();

    if (data.status && data.data?.status === "success") {
      return {
        success: true,
        amount: data.data.amount / 100, // convert from kobo to naira
        status: data.data.status,
        reference: data.data.reference,
        metadata: data.data.metadata || {},
        paidAt: data.data.paid_at,
        channel: data.data.channel,
      };
    }
    return { success: false, status: data.data?.status, error: data.message };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Verify Paystack webhook signature.
 *
 * @param {string} body — raw request body
 * @param {string} signature — x-paystack-signature header
 * @returns {boolean}
 */
export function verifyWebhookSignature(body, signature) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) return false;

  const crypto = require("crypto");
  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
  return hash === signature;
}

/**
 * Check if Paystack is configured.
 */
export function isPaystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

/**
 * Generate a unique payment reference.
 */
export function generateReference(prefix = "EDU") {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

// ── SaaS Subscription API ────────────────────────────────────────────

/**
 * Create or retrieve a Paystack customer for a school.
 * Paystack customers are keyed by email; we use the school admin's email.
 *
 * @param {Object} opts
 * @param {string} opts.email — school admin email
 * @param {string} opts.name — school name
 * @param {string} [opts.code] — existing customer code to skip creation
 * @returns {Promise<{ success: boolean, customerCode?: string, error?: string }>}
 */
export async function createCustomer({ email, name, code }) {
  if (code) return { success: true, customerCode: code };
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/customer`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, first_name: name }),
    });
    const data = await res.json();
    if (data.status) {
      return { success: true, customerCode: data.data.customer_code };
    }
    return { success: false, error: data.message || "Customer creation failed" };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Create a Paystack plan for SaaS subscription billing.
 * Plans define the price and billing interval.
 *
 * @param {Object} opts
 * @param {string} opts.name — plan name (e.g. "EduTrack Starter Monthly")
 * @param {number} opts.amount — amount in Naira per billing cycle
 * @param {string} opts.interval — "monthly" or "annual"
 * @returns {Promise<{ success: boolean, planCode?: string, error?: string }>}
 */
export async function createPlan({ name, amount, interval }) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        amount: Math.round(amount * 100), // kobo
        interval: interval === "annual" ? "annually" : "monthly",
        currency: "NGN",
      }),
    });
    const data = await res.json();
    if (data.status) {
      return { success: true, planCode: data.data.plan_code };
    }
    return { success: false, error: data.message || "Plan creation failed" };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Subscribe a customer to a Paystack plan (creates a subscription).
 *
 * @param {Object} opts
 * @param {string} opts.customer — Paystack customer code
 * @param {string} opts.plan — Paystack plan code
 * @param {Object} [opts.metadata] — additional metadata
 * @returns {Promise<{ success: boolean, subscriptionCode?: string, authorizationUrl?: string, error?: string }>}
 */
export async function createSubscription({ customer, plan, metadata }) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/subscription`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer,
        plan,
        metadata: metadata || {},
      }),
    });
    const data = await res.json();
    if (data.status) {
      return {
        success: true,
        subscriptionCode: data.data.subscription_code,
        authorizationUrl: data.data.authorization_url,
      };
    }
    return { success: false, error: data.message || "Subscription creation failed" };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Cancel a Paystack subscription.
 *
 * @param {string} code — subscription code
 * @param {boolean} [enableNotification=true] — send cancellation email
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function cancelSubscription(code, enableNotification = true) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/subscription/${code}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ enable_token: enableNotification }),
    });
    const data = await res.json();
    if (data.status) {
      return { success: true };
    }
    return { success: false, error: data.message || "Cancellation failed" };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Fetch subscription details from Paystack.
 *
 * @param {string} code — subscription code
 * @returns {Promise<{ success: boolean, subscription?: Object, error?: string }>}
 */
export async function fetchSubscription(code) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/subscription/${code}`, { headers });
    const data = await res.json();
    if (data.status) {
      return { success: true, subscription: data.data };
    }
    return { success: false, error: data.message };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * EduTrack SaaS plan definitions.
 * Prices in Naira; Paystack handles kobo conversion.
 */
export const SAAS_PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For small schools getting digital",
    monthlyPrice: 150,
    annualPrice: 1000,
    maxStudents: 200,
    features: [
      "Up to 200 students",
      "Grading matrix & report cards",
      "Attendance register",
      "Fee tracking & receipts",
      "Teacher & student portals",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    tagline: "For growing private schools",
    monthlyPrice: 350,
    annualPrice: 2500,
    maxStudents: 500,
    features: [
      "Up to 500 students",
      "Everything in Starter",
      "Multiple class arms & sessions",
      "Fee structures + defaulter tracking",
      "Report card PDF export",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For academies & school groups",
    monthlyPrice: 0,
    annualPrice: 0,
    maxStudents: Infinity,
    features: [
      "Unlimited students",
      "Everything in Standard",
      "Multiple branches / campuses",
      "Bulk CSV import & migration help",
      "Dedicated onboarding & training",
      "Custom branding & SLA support",
    ],
  },
];

/**
 * Calculate the SaaS price for a school based on plan and student count.
 * Per-student pricing multiplied by enrollment.
 *
 * @param {string} planId — "starter" | "standard" | "enterprise"
 * @param {string} cycle — "monthly" | "annual"
 * @param {number} studentCount — current student count
 * @returns {number} price in Naira
 */
export function calculateSaaSPrice(planId, cycle, studentCount) {
  const plan = SAAS_PLANS.find((p) => p.id === planId);
  if (!plan || planId === "enterprise") return 0; // enterprise is custom
  const perStudent = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
  // Monthly price is per-student/month; annual is per-student/year
  return perStudent * studentCount;
}

/**
 * Check if a school can add more students given their current plan.
 * Returns { allowed, current, limit, plan, remaining, overBy, message }.
 *
 * Trial schools get Starter limits. Enterprise is always allowed.
 * Past_due/paused/expired schools are blocked from adding students.
 *
 * @param {string} planId — current billing plan
 * @param {string} status — subscription status
 * @param {number} currentStudents — current student count
 * @param {number} adding — number of students being added (default 1)
 * @returns {Object}
 */
export function checkStudentLimit(planId, status, currentStudents, adding = 1) {
  const effectivePlan = planId === "trial" ? "starter" : (planId || "starter");
  const plan = SAAS_PLANS.find((p) => p.id === effectivePlan);
  const limit = plan?.maxStudents ?? 200;
  const newTotal = currentStudents + adding;
  const overBy = Math.max(0, newTotal - limit);
  const remaining = Math.max(0, limit - currentStudents);
  const blocked = ["expired", "paused", "cancelled"].includes(status);

  if (blocked) {
    return {
      allowed: false,
      current: currentStudents,
      limit,
      plan: effectivePlan,
      remaining: 0,
      overBy: 0,
      adding,
      message: "Your subscription is inactive. Please renew before adding students.",
    };
  }

  if (effectivePlan === "enterprise") {
    return {
      allowed: true,
      current: currentStudents,
      limit: Infinity,
      plan: "enterprise",
      remaining: Infinity,
      overBy: 0,
      adding,
      message: null,
    };
  }

  if (overBy > 0) {
    return {
      allowed: false,
      current: currentStudents,
      limit,
      plan: effectivePlan,
      remaining,
      overBy,
      adding,
      message: `Your ${plan?.name || effectivePlan} plan allows up to ${limit} students. You currently have ${currentStudents}. Upgrade to add more students.`,
    };
  }

  // Warn when within 10% of limit
  const nearLimit = remaining <= Math.ceil(limit * 0.1) && remaining > 0;

  return {
    allowed: true,
    current: currentStudents,
    limit,
    plan: effectivePlan,
    remaining,
    overBy: 0,
    adding,
    nearLimit,
    message: nearLimit ? `You have ${remaining} student slots remaining on your ${plan?.name || effectivePlan} plan.` : null,
  };
}

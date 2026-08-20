/**
 * Parent engagement scoring — tracks portal activity, payment timeliness,
 * notification read rate, and message responsiveness.
 *
 * Schools can identify disengaged parents early and proactively reach out.
 *
 * Scoring weights:
 *   - Portal login frequency: 30%
 *   - Fee payment timeliness: 30%
 *   - Notification read rate: 20%
 *   - Message responsiveness: 20%
 *
 * Each metric is scored 0–100, then weighted for a final score 0–100.
 */

import { store } from "@/lib/store";

/**
 * Calculate engagement score for a parent.
 *
 * @param {string} schoolId
 * @param {string} parentId
 * @returns {Promise<{ score: number, breakdown: Object, tier: string }>}
 */
export async function calculateEngagementScore(schoolId, parentId) {
  const [loginScore, paymentScore, notificationScore, messageScore] =
    await Promise.all([
      getLoginScore(schoolId, parentId),
      getPaymentScore(schoolId, parentId),
      getNotificationScore(schoolId, parentId),
      getMessageScore(schoolId, parentId),
    ]);

  const breakdown = {
    login: loginScore,
    payment: paymentScore,
    notification: notificationScore,
    message: messageScore,
  };

  const score = Math.round(
    loginScore * 0.3 +
    paymentScore * 0.3 +
    notificationScore * 0.2 +
    messageScore * 0.2
  );

  const tier =
    score >= 80 ? "highly_engaged" :
    score >= 50 ? "moderately_engaged" :
    score >= 20 ? "low_engagement" :
    "disengaged";

  return { score, breakdown, tier };
}

/**
 * Login frequency score (0–100).
 * Based on how often the parent logged in over the last 30 days.
 */
async function getLoginScore(schoolId, parentId) {
  // In production, this would query a login audit log
  // For now, we estimate from notification read activity
  const notifications = await store.listNotifications?.(schoolId, parentId) || [];
  const recentNotifs = notifications.filter(
    (n) => Date.now() - new Date(n.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000
  );
  if (recentNotifs.length === 0) return 30; // baseline if no notifications yet

  const readCount = recentNotifs.filter((n) => n.read).length;
  const readRate = readCount / recentNotifs.length;
  return Math.min(100, Math.round(readRate * 100 + 20));
}

/**
 * Payment timeliness score (0–100).
 * Based on how early the parent pays relative to due dates.
 */
async function getPaymentScore(schoolId, parentId) {
  try {
    const children = await store.listUsers?.({ schoolId, parentId }) || [];
    if (children.length === 0) return 50;

    let totalScore = 0;
    for (const child of children) {
      const payments = await store.listFeePayments?.(schoolId, { studentId: child.id }) || [];
      if (payments.length === 0) {
        totalScore += 50; // neutral if no payments yet
        continue;
      }

      const confirmedPayments = payments.filter((p) => p.status === "CONFIRMED");
      if (confirmedPayments.length === 0) {
        totalScore += 20; // low if nothing confirmed
        continue;
      }

      // Score based on payment ratio (confirmed vs total expected)
      const structures = await store.listFeeStructures?.(schoolId, { classArm: child.assignedClass }) || [];
      const totalExpected = structures.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const totalPaid = confirmedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      if (totalExpected === 0) {
        totalScore += 70;
      } else {
        const ratio = Math.min(1, totalPaid / totalExpected);
        totalScore += Math.round(ratio * 100);
      }
    }

    return Math.round(totalScore / Math.max(1, children.length));
  } catch {
    return 50;
  }
}

/**
 * Notification read rate score (0–100).
 */
async function getNotificationScore(schoolId, parentId) {
  try {
    const notifications = await store.listNotifications?.(schoolId, parentId) || [];
    if (notifications.length === 0) return 50;

    const recent = notifications.filter(
      (n) => Date.now() - new Date(n.createdAt).getTime() < 14 * 24 * 60 * 60 * 1000
    );
    if (recent.length === 0) return 50;

    const readCount = recent.filter((n) => n.read).length;
    return Math.round((readCount / recent.length) * 100);
  } catch {
    return 50;
  }
}

/**
 * Message responsiveness score (0–100).
 * How often the parent replies to messages from the school.
 */
async function getMessageScore(schoolId, parentId) {
  try {
    const conversations = await store.listConversations?.(schoolId, parentId) || [];
    if (conversations.length === 0) return 50;

    // If parent has active conversations, they're engaged
    const recentConversations = conversations.filter(
      (c) => Date.now() - new Date(c.lastDate).getTime() < 30 * 24 * 60 * 60 * 1000
    );

    if (recentConversations.length === 0) return 30;
    if (recentConversations.length >= 3) return 90;
    return 50 + recentConversations.length * 15;
  } catch {
    return 50;
  }
}

/**
 * Calculate engagement scores for all parents in a school.
 *
 * @param {string} schoolId
 * @returns {Promise<Array<{ parentId, parentName, score, tier }>>}
 */
export async function calculateAllEngagementScores(schoolId) {
  const parents = await store.listUsers?.({ schoolId, role: "PARENT" }) || [];
  const scores = [];

  for (const parent of parents) {
    const { score, tier } = await calculateEngagementScore(schoolId, parent.id);
    scores.push({
      parentId: parent.id,
      parentName: parent.name,
      score,
      tier,
    });
  }

  // Sort by score ascending (most disengaged first)
  scores.sort((a, b) => a.score - b.score);

  return scores;
}

/**
 * Get engagement summary for the school.
 */
export async function getEngagementSummary(schoolId) {
  const scores = await calculateAllEngagementScores(schoolId);

  const highlyEngaged = scores.filter((s) => s.tier === "highly_engaged").length;
  const moderatelyEngaged = scores.filter((s) => s.tier === "moderately_engaged").length;
  const lowEngagement = scores.filter((s) => s.tier === "low_engagement").length;
  const disengaged = scores.filter((s) => s.tier === "disengaged").length;
  const total = scores.length;
  const avgScore = total ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / total) : 0;

  return {
    total,
    averageScore: avgScore,
    byTier: { highlyEngaged, moderatelyEngaged, lowEngagement, disengaged },
    disengagedParents: scores.filter((s) => s.tier === "disengaged"),
  };
}

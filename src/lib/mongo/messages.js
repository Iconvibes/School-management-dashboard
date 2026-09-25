/**
 * Mongo store — messages domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  User,
  ready,
  safe,
} from "./shared.js";

// ── Messages ───────────────────────────────────────────────────────
import Message from "@/models/Message";

export async function sendMessage({ schoolId, from, to, studentId, subject, body, type, replyTo, attachments }) {
  await ready();
  const doc = await Message.create({
    schoolId, from, to,
    studentId: studentId || null,
    subject: subject || "",
    body,
    type: type || "direct",
    replyTo: replyTo || null,
    attachments: attachments || [],
  });
  return safe(doc);
}

export async function getConversation(schoolId, userId1, userId2, { limit = 50, before } = {}) {
  await ready();
  const q = {
    schoolId,
    $or: [
      { from: userId1, to: userId2 },
      { from: userId2, to: userId1 },
    ],
  };
  if (before) q.createdAt = { $lt: new Date(before) };
  return (await Message.find(q).sort({ createdAt: -1 }).limit(limit)).map(safe).reverse();
}

export async function listConversations(schoolId, userId) {
  await ready();
  // Get the most recent message from each conversation partner
  const pipeline = [
    { $match: { schoolId, $or: [{ from: userId }, { to: userId }] } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          $cond: [{ $eq: ["$from", userId] }, "$to", "$from"],
        },
        lastMessage: { $first: "$body" },
        lastDate: { $first: "$createdAt" },
        unread: { $sum: { $cond: [{ $and: [{ $eq: ["$to", userId] }, { $eq: ["$read", false] }] }, 1, 0] } },
      },
    },
    { $sort: { lastDate: -1 } },
  ];
  const results = await Message.aggregate(pipeline);
  // Populate user names
  const conversations = [];
  for (const r of results) {
    const user = await User.findById(r._id).select("name role assignedClass").lean();
    if (user) {
      conversations.push({
        partnerId: r._id.toString(),
        partnerName: user.name,
        partnerRole: user.role,
        partnerClass: user.assignedClass,
        lastMessage: r.lastMessage,
        lastDate: r.lastDate,
        unread: r.unread,
      });
    }
  }
  return conversations;
}

export async function markMessageRead(messageId) {
  await ready();
  await Message.findByIdAndUpdate(messageId, { read: true, readAt: new Date() });
}

export async function markConversationRead(schoolId, userId, partnerId) {
  await ready();
  await Message.updateMany(
    { schoolId, from: partnerId, to: userId, read: false },
    { read: true, readAt: new Date() }
  );
}

export async function getUnreadMessageCount(schoolId, userId) {
  await ready();
  return Message.countDocuments({ schoolId, to: userId, read: false });
}

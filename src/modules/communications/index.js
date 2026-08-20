/**
 * Communications Module — Manages notifications, messaging, push subscriptions,
 * digests, reminder batches, and notification preferences.
 *
 * Store functions: createNotification, listNotifications, markNotificationsRead,
 *   deleteNotifications, markNotificationsReconciled, getReminderBatchByKey,
 *   saveReminderBatch, sendMessage, getConversation, listConversations,
 *   markMessageRead, markConversationRead, getUnreadMessageCount,
 *   getNotificationPreferences, updateNotificationPreferences,
 *   getEnabledChannels, savePushSubscription, listPushSubscriptions,
 *   removePushSubscriptions, deletePushSubscription,
 *   getDigestPref, setDigestPref, sendDigest, listDigests
 * API routes: /api/notifications/*, /api/messages, /api/push/*
 * Components: MessagingPanel, NotificationPreferences
 * Models: Notification, Message, PushSubscription
 */
export * from "./store";

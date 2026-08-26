/**
 * Platform Webhooks — Manage webhook configurations and dispatch
 * notifications to Slack, Discord, or generic HTTP endpoints.
 *
 * Supported formats:
 *   - "slack"   → Slack Incoming Webhook payload (blocks)
 *   - "discord" → Discord Webhook payload (embeds)
 *   - "generic" → Plain JSON POST with event details
 */
import { nid, nowIso, clone, persist } from "@/modules/shared/store-state";

/** In-memory webhook configs (persisted via demo store snapshot). */
let webhookConfigs = [];

/** Delivery log (last 50 deliveries). */
let webhookDeliveries = [];

// ── CRUD ──

/**
 * List all webhook configs.
 * @returns {Array} cloned webhook configs
 */
export async function listWebhooks() {
  return webhookConfigs.map(clone);
}

/**
 * Get a webhook config by ID.
 * @param {string} id
 * @returns {Object|null}
 */
export async function getWebhook(id) {
  const wh = webhookConfigs.find((w) => w.id === id);
  return wh ? clone(wh) : null;
}

/**
 * Create a new webhook config.
 * @param {Object} opts
 * @param {string} opts.name       - Human-readable name (e.g. "Slack #ops")
 * @param {string} opts.url        - Webhook URL
 * @param {string} opts.format     - "slack" | "discord" | "generic"
 * @param {string[]} opts.events   - Event types to notify on (empty = all)
 * @param {string} [opts.secret]   - Optional signing secret for verification
 * @param {boolean} [opts.enabled] - Whether the webhook is active (default true)
 * @returns {Object} created webhook
 */
export async function createWebhook({ name, url, format = "generic", events = [], secret, enabled = true }) {
  if (!name || !url) throw new Error("name and url are required");
  if (!["slack", "discord", "generic"].includes(format)) {
    throw new Error("format must be slack, discord, or generic");
  }

  const webhook = {
    id: nid("wh"),
    name,
    url,
    format,
    events, // empty array = receive all events
    secret: secret || null,
    enabled,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastTriggeredAt: null,
    deliveryCount: 0,
    failureCount: 0,
  };

  webhookConfigs.push(webhook);
  persist();
  return clone(webhook);
}

/**
 * Update a webhook config.
 * @param {string} id
 * @param {Object} updates - Fields to update
 * @returns {Object|null} updated webhook
 */
export async function updateWebhook(id, updates) {
  const wh = webhookConfigs.find((w) => w.id === id);
  if (!wh) return null;

  const allowed = ["name", "url", "format", "events", "secret", "enabled"];
  for (const key of allowed) {
    if (updates[key] !== undefined) wh[key] = updates[key];
  }
  wh.updatedAt = nowIso();
  persist();
  return clone(wh);
}

/**
 * Delete a webhook config.
 * @param {string} id
 * @returns {boolean}
 */
export async function deleteWebhook(id) {
  const idx = webhookConfigs.findIndex((w) => w.id === id);
  if (idx === -1) return false;
  webhookConfigs.splice(idx, 1);
  persist();
  return true;
}

// ── Dispatch ──

/**
 * Build a Slack-compatible payload from an event.
 */
function buildSlackPayload(event) {
  const severityColors = {
    critical: "#dc2626",
    warning: "#f59e0b",
    info: "#06b6d4",
  };
  const color = severityColors[event.severity] || "#6b7280";
  const icon =
    event.severity === "critical"
      ? "🚨"
      : event.severity === "warning"
      ? "⚠️"
      : "ℹ️";

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${icon} EduTrack Platform Alert`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${event.title || event.type}*\n${event.message || ""}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🏫 ${event.schoolName || "Platform"} · ${event.severity || "info"} · ${new Date(event.createdAt || Date.now()).toLocaleString()}`,
          },
        ],
      },
    ],
    attachments: [{ color, fields: [] }],
  };
}

/**
 * Build a Discord-compatible payload from an event.
 */
function buildDiscordPayload(event) {
  const severityColors = {
    critical: 0xdc2626,
    warning: 0xf59e0b,
    info: 0x06b6d4,
  };

  return {
    embeds: [
      {
        title: event.title || event.type,
        description: event.message || "",
        color: severityColors[event.severity] || 0x6b7280,
        fields: [
          { name: "School", value: event.schoolName || "Platform", inline: true },
          { name: "Severity", value: event.severity || "info", inline: true },
        ],
        timestamp: event.createdAt || new Date().toISOString(),
        footer: { text: "EduTrack Platform" },
      },
    ],
  };
}

/**
 * Build a generic JSON payload from an event.
 */
function buildGenericPayload(event) {
  return {
    event: event.type,
    title: event.title,
    message: event.message,
    severity: event.severity,
    schoolId: event.schoolId,
    schoolName: event.schoolName,
    meta: event.meta,
    timestamp: event.createdAt || new Date().toISOString(),
  };
}

/**
 * Dispatch an event to all matching webhooks.
 * @param {Object} event - { type, severity, title, message, schoolId, schoolName, meta, createdAt }
 * @returns {Promise<Array>} delivery results
 */
export async function dispatchWebhook(event) {
  const activeHooks = webhookConfigs.filter((wh) => {
    if (!wh.enabled) return false;
    // If events array is empty, receive all events
    if (wh.events && wh.events.length > 0) {
      return wh.events.includes(event.type);
    }
    return true;
  });

  if (activeHooks.length === 0) return [];

  const results = [];

  for (const wh of activeHooks) {
    let payload;
    switch (wh.format) {
      case "slack":
        payload = buildSlackPayload(event);
        break;
      case "discord":
        payload = buildDiscordPayload(event);
        break;
      default:
        payload = buildGenericPayload(event);
    }

    const delivery = {
      id: nid("wdel"),
      webhookId: wh.id,
      webhookName: wh.name,
      eventType: event.type,
      success: false,
      statusCode: null,
      error: null,
      sentAt: nowIso(),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(wh.format === "slack" ? { "Content-Type": "application/json" } : {}),
          ...(wh.secret ? { "X-Webhook-Secret": wh.secret } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      delivery.statusCode = res.status;
      delivery.success = res.ok;

      // Update webhook stats
      wh.lastTriggeredAt = nowIso();
      wh.deliveryCount = (wh.deliveryCount || 0) + 1;
      if (!res.ok) wh.failureCount = (wh.failureCount || 0) + 1;
    } catch (err) {
      delivery.error = err?.message || "Network error";
      wh.failureCount = (wh.failureCount || 0) + 1;
      wh.lastTriggeredAt = nowIso();
    }

    webhookDeliveries.unshift(delivery);
    if (webhookDeliveries.length > 50) webhookDeliveries.length = 50;

    results.push(delivery);
  }

  persist();
  return results;
}

// ── Delivery Log ──

/**
 * List recent webhook deliveries.
 * @param {number} limit
 * @returns {Array}
 */
export async function listDeliveries(limit = 20) {
  return webhookDeliveries.slice(0, limit).map(clone);
}

// ── Restore from snapshot ──

/**
 * Replace in-memory state from a snapshot.
 * @param {Object} data
 */
export function restoreWebhookState(data) {
  if (data.webhookConfigs) {
    webhookConfigs.length = 0;
    webhookConfigs.push(...data.webhookConfigs);
  }
  if (data.webhookDeliveries) {
    webhookDeliveries.length = 0;
    webhookDeliveries.push(...data.webhookDeliveries);
  }
}

/**
 * Get current state for snapshot.
 */
export function getWebhookSnapshot() {
  return {
    webhookConfigs: webhookConfigs.map(clone),
    webhookDeliveries: webhookDeliveries.map(clone),
  };
}

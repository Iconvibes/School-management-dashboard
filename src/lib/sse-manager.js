/**
 * Server-Sent Events (SSE) infrastructure for real-time push to dashboards.
 *
 * Replaces the 30-second notification polling with persistent connections.
 * Each connected client gets an SSE stream; the server pushes events when
 * new data arrives (grades, notifications, attendance, etc.).
 *
 * Architecture:
 *   - /api/sse/notifications — real-time notification feed (replaces poll)
 *   - /api/sse/grades — real-time grade updates for a specific student
 *   - /api/sse/attendance — real-time attendance updates for a class
 *
 * Usage on the server:
 *   import { registerClient, broadcastToSchool } from "@/lib/sse-manager";
 *   // In a route handler:
 *   const controller = registerClient(schoolId, userId, res);
 *   req.on("close", () => controller.close());
 *
 *   // When new data arrives:
 *   broadcastToSchool(schoolId, { type: "notification", data: notification });
 */

// Active connections keyed by schoolId → Map<userId, Set<{ res, controller }>>
const connections = new Map();

/**
 * Register a new SSE client.
 *
 * @param {string} schoolId
 * @param {string} userId
 * @param {Response} res — Next.js Response object (must support .write())
 * @returns {{ close: () => void, send: (data: object) => void }}
 */
export function registerClient(schoolId, userId, res) {
  const key = schoolId;
  if (!connections.has(key)) connections.set(key, new Map());

  const schoolConns = connections.get(key);
  const clientKey = userId || `anon-${Date.now()}`;

  const controller = {
    res,
    send(data) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Client disconnected — clean up
        controller.close();
      }
    },
    close() {
      const userSet = schoolConns.get(clientKey);
      if (userSet) {
        userSet.delete(controller);
        if (userSet.size === 0) schoolConns.delete(clientKey);
      }
      if (schoolConns.size === 0) connections.delete(key);
      try { res.write("event: close\ndata: {}\n\n"); } catch {}
    },
  };

  if (!schoolConns.has(clientKey)) schoolConns.set(clientKey, new Set());
  schoolConns.get(clientKey).add(controller);

  // Send initial keepalive comment to establish the connection
  try {
    res.write(": connected\n\n");
  } catch {}

  return controller;
}

/**
 * Broadcast an event to all connected clients in a school.
 *
 * @param {string} schoolId
 * @param {Object} event — { type: string, data: any }
 * @param {string} [userId] — if provided, send only to this user
 */
export function broadcastToSchool(schoolId, event, userId) {
  const schoolConns = connections.get(schoolId);
  if (!schoolConns) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;

  if (userId) {
    const userSet = schoolConns.get(userId);
    if (userSet) {
      for (const client of userSet) {
        try { client.res.write(payload); } catch { client.close(); }
      }
    }
    return;
  }

  // Broadcast to all users in the school
  for (const [, userSet] of schoolConns) {
    for (const client of userSet) {
      try { client.res.write(payload); } catch { client.close(); }
    }
  }
}

/**
 * Broadcast to a specific user across all their connections.
 */
export function broadcastToUser(schoolId, userId, event) {
  broadcastToSchool(schoolId, event, userId);
}

/**
 * Get connection stats for monitoring.
 */
export function getConnectionStats() {
  let totalConnections = 0;
  let totalSchools = 0;
  for (const [, schoolConns] of connections) {
    totalSchools++;
    for (const [, userSet] of schoolConns) {
      totalConnections += userSet.size;
    }
  }
  return { totalConnections, totalSchools, schools: connections.size };
}

/**
 * Send a keepalive ping to all connections (call every 30s to detect dead clients).
 */
export function sendKeepalive() {
  for (const [, schoolConns] of connections) {
    for (const [, userSet] of schoolConns) {
      for (const client of userSet) {
        try { client.res.write(": keepalive\n\n"); } catch { client.close(); }
      }
    }
  }
}

// Auto-keepalive every 30 seconds
if (typeof setInterval !== "undefined") {
  setInterval(sendKeepalive, 30_000);
}

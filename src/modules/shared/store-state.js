/**
 * Shared demo store state — arrays, helpers, and persistence logic.
 * 
 * This module is imported by per-module store files. It should NOT be
 * imported directly by components or API routes — use the store.js facade.
 */
import bcrypt from "bcrypt";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { blindEmailIndex, blindPhoneIndex, decryptField, encryptField } from "@/lib/field-crypto";

export let seq = 100;
export function setSeq(v) { seq = v; }
export const nid = (prefix) => `${prefix}_${++seq}`;

// ── In-memory data arrays ──────────────────────────────────────────
export const schools = [];
export const users = [];
export const scores = [];
export const feeStructures = [];
export const feePayments = [];
export const attendance = [];
export const leads = [];
export const notifications = [];
export const feeAudit = [];
export const roleAudit = [];
export const digestPrefs = [];
export const digests = [];
export const timetable = [];
export const classAlertPrefs = [];
export const conflictScans = [];
export const termArchives = [];
export const feeCarryovers = [];
export const reminderBatches = [];
export const schemesOfWork = [];
export const classResources = [];
export const alumniRecords = [];
export const pushSubscriptions = [];
export const messages = [];
export const notificationPreferences = [];
export const erasureRequests = [];
export const dataAccessLog = [];

export let receiptSeq = 1000;
export const incrementReceiptSeq = () => ++receiptSeq;

// ── Helpers ────────────────────────────────────────────────────────
export const hash = (pw) => bcrypt.hashSync(pw, 4);
export const nowIso = () => new Date().toISOString();
export const clone = (obj) => (obj ? { ...obj } : obj);

/** Strip password hash, blind indexes, and internal flags — public user shape. */
export function publicUser(user) {
  const { password, emailIdx, phoneIdx, tokenVersion, passwordSet, ...safe } = user;
  safe.subjects = Array.isArray(user.subjects) ? user.subjects : [];
  safe.assignedClasses = Array.isArray(user.assignedClasses) ? user.assignedClasses : [];
  return safe;
}

// ── Persistence (simplified) ───────────────────────────────────────
const STORE_VERSION = 1;
const DEFAULT_STORE_FILE = path.join(process.cwd(), ".demo-data", "store.json");
const isTestRun = () => !!process.env.NODE_TEST_CONTEXT;
export let storeFile = process.env.DEMO_STORE_FILE || (isTestRun() ? path.join(os.tmpdir(), `edutrack-demo-${process.pid}.json`) : DEFAULT_STORE_FILE);

let persistTimer = null;
let persistDirty = false;

export function setStoreFile(file) { storeFile = file; }

// Re-export persist as a mutable function reference
let _persistFn = () => {};
export function setPersistFn(fn) { _persistFn = fn; }
export function persist() { _persistFn(); }

// All arrays for bulk operations (dump/restore/seed/clear)
export const ALL_ARRAYS = [
  schools, users, scores, feeStructures, feePayments, attendance,
  leads, notifications, feeAudit, roleAudit, digestPrefs, digests,
  timetable, classAlertPrefs, conflictScans, termArchives, feeCarryovers,
  reminderBatches, schemesOfWork, classResources, alumniRecords,
  pushSubscriptions, messages, notificationPreferences,
  erasureRequests, dataAccessLog,
];

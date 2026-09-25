/**
 * Shared plumbing for the Mongo store domain modules.
 *
 * This is the head of the old 2,700-line mongo-store.js: the connection
 * ready() gate, the lean `safe` serializer, and every model/util the domain
 * modules share — re-exported so each domain file needs a single import.
 * Splitting mongo-store.js by domain keeps this file the ONLY place that
 * imports models, so the tenant-scope plugin (installed by db.js) still
 * applies before any schema compiles.
 */
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { bypassTenantScope } from "@/lib/tenant-scope";
import { computeGrade } from "@/lib/grading";
import { nameSlug } from "@/lib/passwords";
import { STAFF_ROLES } from "@/lib/permissions";
import {
  blindEmailIndex,
  blindPhoneIndex,
  decryptField,
  encryptField,
} from "@/lib/field-crypto";

import School from "@/models/School";
import User from "@/models/User";
import Score from "@/models/Score";
import FeeStructure from "@/models/FeeStructure";
import FeePayment from "@/models/FeePayment";
import FeeCarryover from "@/models/FeeCarryover";
import ReminderBatch from "@/models/ReminderBatch";
import Attendance from "@/models/Attendance";
import TimetableEntry from "@/models/TimetableEntry";
import TermArchive from "@/models/TermArchive";
import ClassAlertPref from "@/models/ClassAlertPref";
import ConflictScan from "@/models/ConflictScan";
import Lead from "@/models/Lead";
import Notification from "@/models/Notification";
import FeeAudit from "@/models/FeeAudit";
import RoleAudit from "@/models/RoleAudit";
import DigestPref from "@/models/DigestPref";
import Digest from "@/models/Digest";

export {
  bcrypt,
  mongoose,
  School,
  User,
  Score,
  FeeStructure,
  FeePayment,
  FeeCarryover,
  ReminderBatch,
  Attendance,
  TimetableEntry,
  TermArchive,
  ClassAlertPref,
  ConflictScan,
  Lead,
  Notification,
  FeeAudit,
  RoleAudit,
  DigestPref,
  Digest,
  bypassTenantScope,
  computeGrade,
  nameSlug,
  STAFF_ROLES,
  blindEmailIndex,
  blindPhoneIndex,
  decryptField,
  encryptField,
};

export async function ready() {
  await connectDB();
}

const safe = (doc) => (doc ? doc.toJSON() : null);
export { safe };

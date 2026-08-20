#!/usr/bin/env node
/**
 * Explicit index build for production deploys.
 *
 * `src/lib/db.js` disables Mongoose's runtime autoIndex when
 * NODE_ENV=production (auto-building indexes on first connect can lock a
 * large collection and stall the app). This script is the deploy-time step
 * that creates any schema indexes that don't exist yet. It is
 * NON-DESTRUCTIVE: Model.init() only CREATES missing indexes, it never drops
 * or rebuilds existing ones.
 *
 * Usage (from the repo root, after MONGODB_URI is set):
 *
 *   npm run ensure-indexes
 *
 * Run it once per deploy (or as part of the release job) BEFORE the new
 * code starts accepting traffic.
 */

// The imports exist to REGISTER the models with mongoose — the iteration
// below derives the list from mongoose.modelNames(), so a future model added
// to these imports is automatically included. There is no separate
// hand-maintained list to drift.
import "../src/models/School.js";
import "../src/models/User.js";
import "../src/models/Score.js";
import "../src/models/FeeStructure.js";
import "../src/models/FeePayment.js";
import "../src/models/FeeCarryover.js";
import "../src/models/ReminderBatch.js";
import "../src/models/Attendance.js";
import "../src/models/TimetableEntry.js";
import "../src/models/ClassAlertPref.js";
import "../src/models/Lead.js";
import "../src/models/Notification.js";
import "../src/models/FeeAudit.js";
import "../src/models/RoleAudit.js";
import "../src/models/DigestPref.js";
import "../src/models/Digest.js";
import "../src/models/SchemeOfWork.js";
import "../src/models/ClassResource.js";
import "../src/models/Alumni.js";
import "../src/models/PushSubscription.js";
import "../src/models/ConflictScan.js";
import "../src/models/Message.js";
import "../src/models/Branch.js";
import "../src/models/NotificationPreference.js";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db.js";

if (!process.env.MONGODB_URI) {
  console.error(
    "MONGODB_URI is required — this script targets a real Mongo deployment, not demo mode."
  );
  process.exit(1);
}

await connectDB();

// Derive the model list from what's registered (the imports above) rather
// than a hand-maintained array, so a future model can never silently miss
// its production indexes.
const models = mongoose.modelNames().map((name) => mongoose.model(name));

for (const model of models) {
  await model.init(); // create missing indexes defined in the schema
  const indexes = await model.collection.indexes();
  const names = indexes.map((i) => i.name).sort();
  console.log(`${model.modelName.padEnd(14)} ${names.join(", ")}`);
}

await mongoose.disconnect();
console.log(`\nIndexes ensured for all ${models.length} collections.`);

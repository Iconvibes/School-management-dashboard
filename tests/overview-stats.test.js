/**
 * Overview chart-data tests — the fields getDashboardStats feeds the admin
 * dashboard's charts: feeBilledAmount, collectionTimeline (last-30-day
 * confirmed collections) and attendanceTrend (last 7 school days). Pins the
 * demo adapter; the mongo adapter must satisfy the same contract.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as demoStore from "../src/lib/demo-store.js";

let schoolId;

beforeEach(async () => {
  demoStore.__resetDemoStore();
  const [school] = await demoStore.searchSchools("Greenfield");
  schoolId = school.id;
});

describe("getDashboardStats — overview chart data", () => {
  it("exposes billed/collected/outstanding amounts for the current term", async () => {
    const stats = await demoStore.getDashboardStats(schoolId);
    assert.ok(stats.feeBilledAmount > 0, "seeded structures bill a real amount");
    assert.ok(stats.feeCollectedAmount > 0, "seeded part payments count as collected");
    assert.ok(stats.feeOutstandingAmount > 0, "defaulters keep an outstanding balance");
    assert.equal(
      stats.feeBilledAmount,
      stats.feeCollectedAmount + stats.feeOutstandingAmount,
      "billed = collected + outstanding"
    );
  });

  it("collectionTimeline is an ascending daily series matching total collected", async () => {
    const stats = await demoStore.getDashboardStats(schoolId);
    assert.ok(Array.isArray(stats.collectionTimeline));
    assert.ok(stats.collectionTimeline.length >= 1, "seed payments land in the timeline");

    // Ascending dates + one entry per day.
    const dates = stats.collectionTimeline.map((t) => t.date);
    assert.deepEqual(dates, [...dates].sort(), "timeline is ascending by date");

    // The sum of the timeline equals the term's total collected.
    const sum = stats.collectionTimeline.reduce((a, t) => a + t.amount, 0);
    assert.equal(sum, stats.feeCollectedAmount, "timeline sums to collected this term");
  });

  it("attendanceTrend holds the last 7 school days, one point per day", async () => {
    const stats = await demoStore.getDashboardStats(schoolId);
    assert.equal(stats.attendanceTrend.length, 7, "seed has 20 school days → last 7 kept");
    const dates = stats.attendanceTrend.map((d) => d.date);
    assert.deepEqual(dates, [...dates].sort(), "trend is ascending by date");
    // Multiple arms marked on the same day collapse into ONE point — the chart
    // must never render duplicate dates (that would also break React keys).
    assert.equal(new Set(dates).size, dates.length, "one point per school day");
    for (const day of stats.attendanceTrend) {
      assert.ok(day.present + day.absent > 0, "each school day has attendance");
      assert.ok(day.present >= 0 && day.absent >= 0);
    }
    // The whole-school count equals the sum across the seed's per-arm registers
    // for those 7 days (16 students × 7 days = 112 marks, absent included).
    const sum = stats.attendanceTrend.reduce((a, d) => a + d.present + d.absent, 0);
    assert.equal(sum, 16 * 7, "every mark in the window is counted exactly once");
  });

  it("a fresh school returns empty timelines and zero billed", async () => {
    const { school } = await demoStore.createSchoolAndAdmin({
      schoolName: "Chartless Academy",
      adminName: "Chartless Admin",
      email: "chartless@academy.app",
      password: "admin123",
    });
    const stats = await demoStore.getDashboardStats(school.id);
    assert.equal(stats.feeBilledAmount, 0);
    assert.deepEqual(stats.collectionTimeline, []);
    assert.deepEqual(stats.attendanceTrend, []);
  });

  it("a confirmed payment lands in today's timeline point", async () => {
    const statsBefore = await demoStore.getDashboardStats(schoolId);
    const ledger = await demoStore.getFeeLedger(schoolId);
    const student = ledger.find((l) => l.balance > 0);
    await demoStore.recordFeePayment({
      schoolId,
      studentId: student.studentId,
      amount: 25000,
      method: "CASH",
    });

    const stats = await demoStore.getDashboardStats(schoolId);
    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = stats.collectionTimeline.find((t) => t.date === today);
    assert.ok(todayPoint, "today has a timeline point after the payment");
    assert.equal(
      todayPoint.amount,
      (statsBefore.collectionTimeline.find((t) => t.date === today)?.amount || 0) + 25000
    );
  });
});

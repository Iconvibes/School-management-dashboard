/**
 * Fees Module — Manages fee structures, payments, ledger, audit trail, and reconciliation.
 *
 * Store functions: getFeeStructures, saveFeeStructure, getFeeLedger,
 *   recordFeePayment, confirmFeePayment, logFeeAudit, listFeeAudit
 * API routes: /api/fees/*, /api/webhooks/paystack
 * Components: FeesTab, PaymentHistory, FeeLedger, ReportPaymentModal
 * Models: FeeStructure, FeePayment, FeeCarryover, FeeAudit
 */
export * from "./store";

"use client";

import { createContext, useContext, useReducer } from "react";

/**
 * Fee management state — extracted from the admin dashboard to isolate fee
 * updates so they don't re-render all 19 tabs.
 *
 * Provided by page.js via <FeeProvider>, consumed by fee-related tabs and
 * modals via useFeeContext().
 */

// ── Action types ──────────────────────────────────────────────────────
const FEE_ACTIONS = {
  SET_STRUCTURES: "SET_STRUCTURES",
  SET_LEDGER: "SET_LEDGER",
  SET_TOTALS: "SET_TOTALS",
  SET_PENDING_PAYMENTS: "SET_PENDING_PAYMENTS",
  SET_CLASS: "SET_CLASS",
  SET_DEFAULTERS_ONLY: "SET_DEFAULTERS_ONLY",
  SET_DRAFT: "SET_DRAFT",
  SET_SAVING: "SET_SAVING",
  SET_CONFIRMING_ID: "SET_CONFIRMING_ID",
  SET_PAY_MODAL: "SET_PAY_MODAL",
  SET_PAY_FORM: "SET_PAY_FORM",
  SET_REMINDER_MODAL: "SET_REMINDER_MODAL",
  SET_REMINDER_SENDING: "SET_REMINDER_SENDING",
  SET_REMINDER_RESULT: "SET_REMINDER_RESULT",
  SET_REMINDER_MESSAGE: "SET_REMINDER_MESSAGE",
  SET_REMINDER_STUDENT_MESSAGE: "SET_REMINDER_STUDENT_MESSAGE",
  SET_RECONCILE_MODAL: "SET_RECONCILE_MODAL",
  SET_RECONCILE_SENDING: "SET_RECONCILE_SENDING",
  SET_RECONCILE_RESULT: "SET_RECONCILE_RESULT",
  SET_PENDING_RECONCILES: "SET_PENDING_RECONCILES",
  SET_AUDIT: "SET_AUDIT",
  // Batch update from useTabFetch onData callbacks
  BATCH_SET: "BATCH_SET",
  // Replace the entire fee state (e.g. from refreshFeeData)
  REPLACE: "REPLACE",
};

// ── Initial state ─────────────────────────────────────────────────────
const initialState = {
  // Data
  feeStructures: [],
  feeLedger: [],
  feeTotals: null,
  pendingPayments: [],
  audit: [],
  pendingReconciles: [],
  // Filters
  feeClass: "",
  feeDefaultersOnly: false,
  // Draft / form
  feeDraft: {},
  payModal: null,
  payForm: { amount: "", method: "CASH", note: "" },
  // Loading flags
  feeSaving: false,
  confirmingId: null,
  reminderModal: null,
  reminderSending: false,
  reminderResult: null,
  reminderMessage: "",
  reminderStudentMessage: "",
  reconcileModal: false,
  reconcileSending: false,
  reconcileResult: null,
};

// ── Reducer ───────────────────────────────────────────────────────────
function feeReducer(state, action) {
  switch (action.type) {
    case FEE_ACTIONS.SET_STRUCTURES:
      return { ...state, feeStructures: action.value };
    case FEE_ACTIONS.SET_LEDGER:
      return { ...state, feeLedger: action.value };
    case FEE_ACTIONS.SET_TOTALS:
      return { ...state, feeTotals: action.value };
    case FEE_ACTIONS.SET_PENDING_PAYMENTS:
      return { ...state, pendingPayments: action.value };
    case FEE_ACTIONS.SET_CLASS:
      return { ...state, feeClass: action.value };
    case FEE_ACTIONS.SET_DEFAULTERS_ONLY:
      return { ...state, feeDefaultersOnly: action.value };
    case FEE_ACTIONS.SET_DRAFT:
      return { ...state, feeDraft: action.value };
    case FEE_ACTIONS.SET_SAVING:
      return { ...state, feeSaving: action.value };
    case FEE_ACTIONS.SET_CONFIRMING_ID:
      return { ...state, confirmingId: action.value };
    case FEE_ACTIONS.SET_PAY_MODAL:
      return { ...state, payModal: action.value };
    case FEE_ACTIONS.SET_PAY_FORM:
      return { ...state, payForm: action.value };
    case FEE_ACTIONS.SET_REMINDER_MODAL:
      return { ...state, reminderModal: action.value };
    case FEE_ACTIONS.SET_REMINDER_SENDING:
      return { ...state, reminderSending: action.value };
    case FEE_ACTIONS.SET_REMINDER_RESULT:
      return { ...state, reminderResult: action.value };
    case FEE_ACTIONS.SET_REMINDER_MESSAGE:
      return { ...state, reminderMessage: action.value };
    case FEE_ACTIONS.SET_REMINDER_STUDENT_MESSAGE:
      return { ...state, reminderStudentMessage: action.value };
    case FEE_ACTIONS.SET_RECONCILE_MODAL:
      return { ...state, reconcileModal: action.value };
    case FEE_ACTIONS.SET_RECONCILE_SENDING:
      return { ...state, reconcileSending: action.value };
    case FEE_ACTIONS.SET_RECONCILE_RESULT:
      return { ...state, reconcileResult: action.value };
    case FEE_ACTIONS.SET_PENDING_RECONCILES:
      return { ...state, pendingReconciles: action.value };
    case FEE_ACTIONS.SET_AUDIT:
      return { ...state, audit: action.value };
    case FEE_ACTIONS.BATCH_SET:
      return { ...state, ...action.values };
    case FEE_ACTIONS.REPLACE:
      return { ...state, ...action.values };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────
const FeeContext = createContext(null);

/**
 * Provides fee state + dispatch to child components.
 * Used in admin dashboard page.js to wrap all admin UI.
 */
export function FeeProvider({ initialState: initOverrides, children }) {
  const [state, dispatch] = useReducer(
    feeReducer,
    initOverrides
      ? { ...initialState, ...initOverrides }
      : initialState
  );
  return (
    <FeeContext.Provider value={{ state, dispatch }}>
      {children}
    </FeeContext.Provider>
  );
}

/**
 * Consume the fee context. Must be used inside <FeeProvider>.
 *
 * Returns { state, dispatch } — destructure `state` for read access and
 * use dispatch to update fee values.
 */
export function useFeeContext() {
  const ctx = useContext(FeeContext);
  if (!ctx) throw new Error("useFeeContext must be used inside <FeeProvider>");
  return ctx;
}

// ── Helper: dispatch wrapper that returns setter-compatible functions ──
// This lets useAdminActions call dispatch({ type: ..., value: ... }) the
// same way it previously called setState, keeping the migration minimal.
export const FEE_ACTION_TYPES = FEE_ACTIONS;

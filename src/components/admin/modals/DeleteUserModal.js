"use client";

import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Remove-user confirmation — student left / teacher departed.
 */
export default function DeleteUserModal() {
  const {
    deleteTarget,
    setDeleteTarget,
    deletingUser,
    confirmDeleteUser,
  } = useAdminShell();

  return (
    <Modal
      open={deleteTarget !== null}
      onClose={() => !deletingUser && setDeleteTarget(null)}
      title="Remove account"
    >
      {deleteTarget && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="text-sm text-rose-700">
              <p className="font-bold text-rose-800">This can&apos;t be undone.</p>
              <p className="mt-1">
                {deleteTarget.role === "STUDENT"
                  ? "Removing this student deletes their account, scores, attendance and fee records."
                  : "Removing this teacher deletes their account and frees their timetable slots."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
              {deleteTarget.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-navy-800">
                {deleteTarget.name}
              </p>
              <p className="truncate text-xs text-navy-400">
                {deleteTarget.email} ·{" "}
                {ROLE_LABELS[deleteTarget.role] || deleteTarget.role}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deletingUser}
              className="flex-1 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteUser}
              disabled={deletingUser}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {deletingUser ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove{" "}
              {deleteTarget.role === "STUDENT" ? "student" : "teacher"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

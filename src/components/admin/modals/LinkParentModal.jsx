"use client";

import {
  Loader2,
  CheckCircle2,
  HeartHandshake,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Link parent / guardian modal — connect a student to their parent account.
 * Supports both selecting an existing parent and creating a new one.
 */
export default function LinkParentModal() {
  const {
    linkModal,
    setLinkModal,
    linkResult,
    linkForm,
    setLinkForm,
    linkSaving,
    linkParent,
    filteredStudents,
    parents,
    findParentByName,
    findParentByPhone,
  } = useAdminShell();

  return (
    <Modal
      open={linkModal !== null}
      onClose={() => {
        setLinkModal(null);
      }}
      title="Link parent / guardian"
      wide
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-sm">
          {filteredStudents.find((s) => s.id === linkModal)?.name && (
            <p className="font-bold text-navy-800">
              {filteredStudents.find((s) => s.id === linkModal)?.name}
            </p>
          )}
          <p className="text-xs text-navy-400">
            The parent gets portal access to this student&apos;s report cards,
            attendance and fee balance.
          </p>
        </div>

        {linkResult ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-sm font-bold text-navy-800">
              Parent linked
            </p>
            <p className="mt-1 text-xs text-navy-500">
              {linkResult.parentName} can now sign into{" "}
              {filteredStudents.find((s) => s.id === linkModal)?.name ||
                "this student"}
              &apos;s portal.
            </p>
            <div className="mt-4 rounded-lg bg-white px-4 py-3 text-left shadow-sm ring-1 ring-navy-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-400">
                Parent name
              </p>
              <p className="mt-0.5 text-sm font-bold text-navy-800">
                {linkResult.parentName}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-navy-400">
                Password
              </p>
              <p className="mt-0.5 text-sm font-bold text-emerald-700">
                {linkResult.password}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-navy-500">
                The password is the student&apos;s full name — case and spacing
                don&apos;t matter. Tell the parent to sign in with their name
                above and this password.
              </p>
            </div>
            <button
              onClick={() => {
                setLinkModal(null);
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
            >
              <CheckCircle2 className="h-5 w-5" /> Done
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-1">
              <button
                onClick={() => setLinkForm((f) => ({ ...f, mode: "select" }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  linkForm.mode === "select"
                    ? "bg-white text-navy-800 shadow-sm"
                    : "text-navy-500"
                }`}
              >
                <HeartHandshake className="mr-1.5 inline h-4 w-4" />
                Existing parent
              </button>
              <button
                onClick={() => setLinkForm((f) => ({ ...f, mode: "create" }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  linkForm.mode === "create"
                    ? "bg-white text-navy-800 shadow-sm"
                    : "text-navy-500"
                }`}
              >
                <UserPlus className="mr-1.5 inline h-4 w-4" />
                New parent
              </button>
            </div>

            {linkForm.mode === "select" ? (
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {parents.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setLinkForm((f) => ({ ...f, parentId: p.id }))
                    }
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                      linkForm.parentId === p.id
                        ? "border-brand-300 bg-brand-50/60"
                        : "border-navy-100 bg-white hover:border-brand-200"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                      {p.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-navy-800">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-navy-400">
                        {p.email || "Signs in with name + child's name"}
                      </span>
                    </span>
                    {linkForm.parentId === p.id && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
                    )}
                  </button>
                ))}
                {parents.length === 0 && (
                  <p className="rounded-xl border border-dashed border-navy-200 p-6 text-center text-sm text-navy-400">
                    No parent accounts yet. Switch to &ldquo;New parent&rdquo;
                    to create one.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">
                    Parent full name
                  </span>
                  <input
                    value={linkForm.name}
                    onChange={(e) =>
                      setLinkForm({ ...linkForm, name: e.target.value })
                    }
                    placeholder="e.g. Mrs. Folake Adebayo"
                    className={inputCls}
                  />
                  {findParentByName(linkForm.name) && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      This name already exists — link them instead of creating
                      a duplicate.
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-navy-400">
                    No email or password needed — once linked, the parent signs
                    in with this name and the student&apos;s full name as the
                    password.
                  </p>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">
                    Phone (optional)
                  </span>
                  <input
                    value={linkForm.phone}
                    onChange={(e) =>
                      setLinkForm({ ...linkForm, phone: e.target.value })
                    }
                    placeholder="e.g. 0803 123 4567"
                    className={inputCls}
                  />
                  {findParentByPhone(linkForm.phone) && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      This phone belongs to{" "}
                      {findParentByPhone(linkForm.phone).name} — link them
                      instead of creating a duplicate.
                    </p>
                  )}
                </label>
              </div>
            )}

            <button
              onClick={() =>
                linkParent(
                  filteredStudents.find((s) => s.id === linkModal)?.id
                )
              }
              disabled={
                linkSaving ||
                (linkForm.mode === "select" && !linkForm.parentId) ||
                (linkForm.mode === "create" &&
                  !String(linkForm.name || "").trim())
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
            >
              {linkSaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <HeartHandshake className="h-5 w-5" />
              )}
              {linkForm.mode === "create"
                ? "Create parent & link"
                : "Link parent"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

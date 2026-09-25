"use client";

import {
  Loader2,
  Plus,
  Save,
  CheckCircle2,
  BookOpen,
  ClipboardList,
  KeyRound,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Add/Edit user modal — teacher | student | staff (bursar/registrar).
 * Also shows the auto-generated student password after creation.
 */
export default function AddUserModal() {
  const {
    modal,
    setModal,
    form,
    setForm,
    saving,
    editingUser,
    createdUserDisplay,
    closeCreatedUserDisplay,
    closeAddModal,
    createUser,
    session,
    subjects,
  } = useAdminShell();

  return (
    <Modal
      open={modal !== null}
      onClose={() => {
        if (createdUserDisplay) closeCreatedUserDisplay();
        else closeAddModal();
      }}
      title={
        createdUserDisplay
          ? "Student login details"
          : editingUser
            ? modal === "teacher"
              ? "Edit teacher"
              : modal === "staff"
                ? "Edit staff account"
                : "Edit student"
            : modal === "teacher"
              ? "Add teacher"
              : modal === "staff"
                ? "Add staff account"
                : "Add student"
      }
    >
      {createdUserDisplay ? (
        <div className="animate-fade-up space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Student added
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              The auto-generated password is shown below. Hand it to the
              student — they can change it after logging in.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
              {createdUserDisplay.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-navy-800">
                {createdUserDisplay.name}
              </p>
              <p className="truncate text-xs text-navy-400">
                {createdUserDisplay.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-navy-900 px-4 py-3">
            <KeyRound className="h-5 w-5 shrink-0 text-brand-300" />
            <code className="min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wide text-white">
              {createdUserDisplay.password}
            </code>
          </div>

          <button
            onClick={closeCreatedUserDisplay}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">
              Full name
            </span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              className={inputCls}
            />
          </label>
          {editingUser && modal === "teacher" ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Name-only account
              </span>
              <p className="text-xs text-navy-500">
                Teachers have no email or password — they sign in with their
                name and the school name as the password.
              </p>
            </div>
          ) : editingUser ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Email
              </span>
              <p className="text-sm text-navy-500">{form.email || "—"}</p>
              <p className="mt-1.5 text-[11px] text-navy-400">
                Email is the login identity and can&apos;t be changed here. To
                replace this account (new email, new password), remove it and
                add the replacement.
              </p>
            </div>
          ) : modal === "teacher" ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                No email, no password
              </span>
              <p className="text-xs text-navy-500">
                Teachers sign in with their full name and{" "}
                <strong className="text-navy-700">the school name</strong> as
                the password —{" "}
                {session.school?.name || "your school's name"} — so the admin
                only types the name here.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">
                Email
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@school.edu"
                className={inputCls}
              />
            </label>
          )}
          {editingUser && modal === "teacher" ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Teacher login
              </span>
              <p className="text-xs text-navy-500">
                The teacher signs in with their name and the school name as the
                password.
              </p>
            </div>
          ) : editingUser ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Password
              </span>
              <p className="text-xs text-navy-500">
                Managed via <strong className="text-navy-700">Reset password</strong> on the row —
                editing details never touches the login.
              </p>
            </div>
          ) : modal === "student" ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Auto-generated password
              </span>
              <p className="text-xs text-navy-500">
                The password is{" "}
                <strong className="text-navy-700">name + class arm</strong>,
                all lowercase and unspaced — e.g.{" "}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-navy-700">
                  {form.name || "adamtope"}
                  {form.assignedClass || "jss1"}
                </code>
              </p>
            </div>
          ) : modal === "teacher" ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Teacher login
              </span>
              <p className="text-xs text-navy-500">
                The teacher signs in with their name and the school name as the
                password — nothing to hand out.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">
                Temporary password
              </span>
              <input
                type="text"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                placeholder="At least 6 characters"
                className={inputCls}
              />
            </label>
          )}
          {modal === "staff" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">
                Role
              </span>
              <select
                value={form.staffRole}
                onChange={(e) =>
                  setForm({ ...form, staffRole: e.target.value })
                }
                className={inputCls}
              >
                <option value="BURSAR">
                  Bursar — fees, payments & reminders
                </option>
                <option value="REGISTRAR">
                  Registrar — roster, imports & report cards
                </option>
              </select>
            </label>
          ) : modal === "teacher" ? (
            <>
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
                <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                  <BookOpen className="h-4 w-4 text-violet-600" /> Subjects
                  they teach
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s) => {
                    const on = form.subjects.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            subjects: on
                              ? f.subjects.filter((x) => x !== s)
                              : [...f.subjects, s],
                          }))
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          on
                            ? "bg-violet-600 text-white shadow-sm"
                            : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-violet-300"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
                <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                  <ClipboardList className="h-4 w-4 text-brand-600" /> Class
                  arms they teach
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(session.school?.activeArms || []).map((arm) => {
                    const on = form.assignedClasses.includes(arm);
                    return (
                      <button
                        key={arm}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            assignedClasses: on
                              ? f.assignedClasses.filter((x) => x !== arm)
                              : [...f.assignedClasses, arm],
                            assignedClass:
                              on && f.assignedClass === arm
                                ? ""
                                : f.assignedClass || arm,
                          }))
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          on
                            ? "bg-brand-600 text-white shadow-sm"
                            : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-brand-300"
                        }`}
                      >
                        {arm}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-navy-400">
                  A teacher can cover every arm of a subject — e.g. one
                  Mathematics teacher for all twelve classes.
                </p>
              </div>
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">
                Class arm
              </span>
              <select
                value={form.assignedClass}
                onChange={(e) =>
                  setForm({ ...form, assignedClass: e.target.value })
                }
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {(session.school?.activeArms || []).map((arm) => (
                  <option key={arm}>{arm}</option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => createUser(modal)}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : editingUser ? (
              <Save className="h-5 w-5" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            {editingUser
              ? "Save changes"
              : `Add ${modal === "teacher" ? "teacher" : modal === "staff" ? "staff account" : "student"}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

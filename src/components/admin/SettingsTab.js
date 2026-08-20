"use client";

import {
  ArrowLeft, BadgeCheck, CheckCircle2, ImagePlus, Loader2, Save, School, Upload, X,
} from "lucide-react";

const BRAND_COLORS = ["#2563EB", "#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#1E293B"];

export default function SettingsTab({
  settingsDraft, setSettingsDraft, settingsSaving, settingsError, settingsSaved,
  logoError, sealError, logoInputRef, sealInputRef, settingsColorWell, session,
  setTab, saveSettings, handleImageFile,
}) {
  return (
            <>
              <button
                onClick={() => {
                  setTab("overview");
                  history.replaceState(null, "", "/admin/dashboard");
                }}
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-navy-500 transition hover:text-brand-600"
              >
                <ArrowLeft className="h-4 w-4" /> Back to dashboard
              </button>
              <div className="mt-3 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-6 py-4">
                <h2 className="text-lg font-bold text-navy-800">School settings</h2>
                <p className="text-sm text-navy-400">
                  Branding (logo, seal and brand color) appears on report cards and across every
                  portal. Notification preferences keep the admin inbox lean.
                </p>
              </div>
              <div className="grid gap-8 p-6 lg:grid-cols-2">
                <div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Brand color</span>
                    <div className="flex flex-wrap items-center gap-3">
                      {BRAND_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setSettingsDraft((d) => ({ ...d, brandColor: c }))}
                          className={`h-10 w-10 rounded-xl ring-2 transition ${
                            settingsDraft.brandColor === c
                              ? "ring-navy-800 ring-offset-2"
                              : "ring-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Brand color ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={settingsColorWell}
                        onChange={(e) => setSettingsDraft((d) => ({ ...d, brandColor: e.target.value }))}
                        className="h-10 w-14 cursor-pointer rounded-xl border border-navy-200 bg-white"
                        aria-label="Custom brand color"
                      />
                      {/* Exact hex entry — every school has its own brand color,
                          so the swatches are just a starting point. */}
                      <div className="flex items-center gap-1 rounded-lg border border-navy-200 px-2.5 py-1.5">
                        <span className="text-xs font-bold text-navy-400">#</span>
                        <input
                          value={
                            settingsDraft.brandColor.startsWith("#")
                              ? settingsDraft.brandColor.slice(1)
                              : settingsDraft.brandColor
                          }
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                            setSettingsDraft((d) => ({ ...d, brandColor: v ? `#${v}` : "" }));
                          }}
                          onBlur={() => {
                            // Normalize to a valid 6-digit hex, else fall back.
                            if (!/^#[0-9a-fA-F]{6}$/.test(settingsDraft.brandColor)) {
                              setSettingsDraft((d) => ({ ...d, brandColor: "#2563EB" }));
                            }
                          }}
                          placeholder="2563EB"
                          aria-label="Custom brand color (hex)"
                          className="w-20 bg-transparent font-mono text-sm font-semibold text-navy-800 outline-none placeholder:font-sans placeholder:text-xs placeholder:font-medium placeholder:text-navy-300"
                        />
                      </div>
                    </div>
                  </label>

                  <div className="mt-5">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">School logo</span>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={(e) => {
                        handleImageFile(e.target.files?.[0], "logoUrl", setLogoError);
                        e.target.value = ""; // allow re-picking the same file
                      }}
                      className="hidden"
                    />
                    {settingsDraft.logoUrl ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 p-3">
                        <img
                          src={settingsDraft.logoUrl}
                          alt="School logo preview"
                          className="h-14 w-14 rounded-lg border border-navy-100 bg-white object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-navy-800">Logo uploaded</p>
                          <p className="text-xs text-navy-400">Shown on report cards and in your portal.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Upload className="h-3.5 w-3.5" /> Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettingsDraft((d) => ({ ...d, logoUrl: "" }))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                          >
                            <X className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
                      >
                        <ImagePlus className="h-6 w-6 text-navy-300" />
                        <span className="text-sm font-semibold text-navy-700">Upload your school&apos;s logo</span>
                        <span className="text-xs text-navy-400">
                          PNG, JPG, SVG or WebP · under 1 MB — no hosted URL needed.
                        </span>
                      </button>
                    )}
                    {logoError && <p className="mt-2 text-xs font-medium text-rose-600">{logoError}</p>}
                  </div>

                  <div className="mt-5">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">School seal / signature</span>
                    <input
                      ref={sealInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={(e) => {
                        handleImageFile(e.target.files?.[0], "sealUrl", setSealError);
                        e.target.value = ""; // allow re-picking the same file
                      }}
                      className="hidden"
                    />
                    {settingsDraft.sealUrl ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 p-3">
                        <img
                          src={settingsDraft.sealUrl}
                          alt="School seal preview"
                          className="h-14 w-14 rounded-full border border-navy-100 bg-white object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-navy-800">Seal uploaded</p>
                          <p className="text-xs text-navy-400">Printed on report cards next to the logo.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => sealInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Upload className="h-3.5 w-3.5" /> Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettingsDraft((d) => ({ ...d, sealUrl: "" }))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                          >
                            <X className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sealInputRef.current?.click()}
                        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
                      >
                        <BadgeCheck className="h-6 w-6 text-navy-300" />
                        <span className="text-sm font-semibold text-navy-700">Upload your school seal or signature</span>
                        <span className="text-xs text-navy-400">
                          PNG, JPG, SVG or WebP · under 1 MB — printed on report cards.
                        </span>
                      </button>
                    )}
                    {sealError && <p className="mt-2 text-xs font-medium text-rose-600">{sealError}</p>}
                  </div>

                  <div className="mt-6">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Notification history</span>
                    <p className="mb-2 text-xs text-navy-400">
                      Auto-archive notifications older than this many days — the inbox stays lean,
                      and the history stays viewable from the bell&apos;s Archived tab. Parent and
                      student reminders are never affected.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={settingsDraft.notificationRetentionDays}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            notificationRetentionDays: Number(e.target.value) || 1,
                          }))
                        }
                        aria-label="Notification retention in days"
                        className="w-24 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-semibold text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      />
                      <span className="text-sm text-navy-500">days</span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={settingsDraft.reconcileDeletedReminders}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            reconcileDeletedReminders: e.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-navy-300 accent-brand-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-navy-700">
                          Keep deleted reminders in Reconcile &amp; forward
                        </span>
                        <span className="mt-0.5 block text-xs text-navy-400">
                          When off, a reminder you delete from the inbox is also removed from the
                          Reconcile &amp; forward list. Turn it on to keep deleted reminders eligible
                          for forwarding if the student&apos;s parent is linked later.
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* Bank Account Details */}
                  <div className="mt-6 border-t border-navy-100 pt-6">
                    <h4 className="text-sm font-bold text-navy-800">School Account Details</h4>
                    <p className="mb-3 text-xs text-navy-400">
                      Shown to parents on the payment page so they can make bank transfers.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-navy-600">Bank Name</span>
                        <input
                          value={settingsDraft.bankDetails?.bankName || ""}
                          onChange={(e) =>
                            setSettingsDraft((d) => ({
                              ...d,
                              bankDetails: { ...d.bankDetails, bankName: e.target.value },
                            }))
                          }
                          placeholder="e.g. Guaranty Trust Bank"
                          className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-navy-600">Account Name</span>
                        <input
                          value={settingsDraft.bankDetails?.accountName || ""}
                          onChange={(e) =>
                            setSettingsDraft((d) => ({
                              ...d,
                              bankDetails: { ...d.bankDetails, accountName: e.target.value },
                            }))
                          }
                          placeholder="e.g. Greenfield Schools Ltd"
                          className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-navy-600">Account Number</span>
                        <input
                          value={settingsDraft.bankDetails?.accountNumber || ""}
                          onChange={(e) =>
                            setSettingsDraft((d) => ({
                              ...d,
                              bankDetails: { ...d.bankDetails, accountNumber: e.target.value },
                            }))
                          }
                          placeholder="e.g. 0123456789"
                          className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-navy-600">Sort Code</span>
                        <input
                          value={settingsDraft.bankDetails?.sortCode || ""}
                          onChange={(e) =>
                            setSettingsDraft((d) => ({
                              ...d,
                              bankDetails: { ...d.bankDetails, sortCode: e.target.value },
                            }))
                          }
                          placeholder="e.g. 058"
                          className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-medium text-navy-600">Other Instructions</span>
                      <textarea
                        value={settingsDraft.bankDetails?.otherInstructions || ""}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            bankDetails: { ...d.bankDetails, otherInstructions: e.target.value },
                          }))
                        }
                        placeholder="e.g. Please include your child's name as reference"
                        rows={2}
                        className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                      />
                    </label>
                  </div>

                  {settingsError && (
                    <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      {settingsError}
                    </p>
                  )}

                  <button
                    onClick={saveSettings}
                    disabled={settingsSaving}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                  >
                    {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save settings
                  </button>
                  {settingsSaved && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Saved — applied across every portal now.
                    </p>
                  )}
                </div>

                {/* Live preview */}
                <div className="h-fit overflow-hidden rounded-xl border border-navy-200">
                  <div className="bg-navy-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-400">
                    Live preview
                  </div>
                  <div className="p-5" style={{ backgroundColor: settingsDraft.brandColor }}>
                    <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg text-white"
                          style={{ backgroundColor: settingsDraft.brandColor }}
                        >
                          {settingsDraft.logoUrl ? (
                            <img
                              src={settingsDraft.logoUrl}
                              alt=""
                              className="h-full w-full bg-white object-contain"
                            />
                          ) : (
                            <School className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy-800">{session.school?.name}</p>
                          <p className="text-xs text-navy-400">
                            {session.school?.currentSession} · {session.school?.currentTerm}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {settingsDraft.sealUrl ? (
                          <img
                            src={settingsDraft.sealUrl}
                            alt="School seal preview"
                            className="h-10 w-10 rounded-full border-2 border-white bg-white object-contain shadow-sm"
                          />
                        ) : null}
                        <span
                          className="rounded-md px-2 py-1 text-xs font-bold text-white"
                          style={{ backgroundColor: settingsDraft.brandColor }}
                        >
                          REPORT CARD
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </>
  );
}

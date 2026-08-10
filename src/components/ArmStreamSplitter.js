"use client";

import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { ARM_SUFFIX_SETS, buildArmVariants } from "@/lib/arms";

/**
 * "Split a class into streams" helper — the fast way to model the real
 * Nigerian pattern where one JSS class has multiple streams ("JSS1 A" /
 * "JSS1 B") or colour-named arms ("JSS1 Blue" / "JSS1 Gold").
 *
 * Self-contained: owns its base + suffix inputs and only reports the FULL
 * generated arm names up via `onAdd(names)`. The parent decides how to merge
 * them (dedupe against existing arms, toast, save).
 *
 * @param {Object} props
 * @param {string} [props.base]       initial base class (e.g. "JSS1")
 * @param {(names: string[]) => void} props.onAdd
 * @param {boolean} [props.compact]   smaller paddings for tight spots
 */
const PRESETS = [
  { label: "A / B", suffixes: ARM_SUFFIX_SETS.letters.slice(0, 2) },
  { label: "A / B / C", suffixes: ARM_SUFFIX_SETS.letters.slice(0, 3) },
  { label: "Blue / Gold", suffixes: ARM_SUFFIX_SETS.colours.slice(0, 2) },
  { label: "Blue / Gold / Green", suffixes: ARM_SUFFIX_SETS.colours.slice(0, 3) },
];

export default function ArmStreamSplitter({ base = "", onAdd, compact = false }) {
  const [cls, setCls] = useState(base);
  const [custom, setCustom] = useState("");

  function addPreset(suffixes) {
    const names = buildArmVariants(cls, suffixes);
    if (names.length) onAdd(names);
  }

  function addCustom() {
    const parts = String(custom || "")
      .split(/[,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const b = cls.trim();
    const names = parts.map((p) =>
      b && p.toLowerCase().startsWith(b.toLowerCase()) ? p : `${b} ${p}`
    );
    if (names.length) {
      onAdd(names);
      setCustom("");
    }
  }

  return (
    <div className={`rounded-xl border border-dashed border-navy-200 bg-navy-50/40 ${compact ? "p-3" : "p-4"}`}>
      <p className={`flex items-center gap-1.5 font-medium text-navy-700 ${compact ? "text-xs" : "text-sm"}`}>
        <Layers className="h-4 w-4 text-brand-600" /> Split a class into streams
      </p>
      <p className={`text-navy-400 ${compact ? "mt-0.5 text-[11px]" : "mt-1 text-xs"}`}>
        One JSS class with several arms? Generate them from a base like{" "}
        <span className="font-semibold text-navy-600">JSS1</span> in one click —
        each gets its own students, teachers, timetable and fees.
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={cls}
          onChange={(e) => setCls(e.target.value)}
          placeholder="Base class, e.g. JSS1"
          className="w-44 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => addPreset(p.suffixes)}
              disabled={!cls.trim()}
              className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-600 transition hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Custom suffixes, e.g. Red, Green"
          className="flex-1 min-w-40 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim() || !cls.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add streams
        </button>
      </div>
    </div>
  );
}

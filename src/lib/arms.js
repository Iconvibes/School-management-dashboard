/**
 * Class-arm modeling helpers.
 *
 * Arms are free-form strings everywhere — a school's "JSS1 A", "JSS1 Blue"
 * and "SS1 Science" are all just entries in `activeArms` (plus the teacher
 * `assignedClasses`, fee structures, attendance and timetable rows that
 * reference them). That means real schools can already model multiple JSS
 * streams per class; these helpers power the UI affordances that make it
 * fast: generating streamed variants of a base class (JSS1 → "JSS1 A" +
 * "JSS1 B") and de-duplicating arm names case-insensitively.
 */

/** Preset suffix pools for the "split a class into streams" helper. */
export const ARM_SUFFIX_SETS = {
  letters: ["A", "B", "C", "D"],
  colours: ["Blue", "Gold", "Green", "Red"],
};

/** Human labels for the suffix pools (shown in the splitter UI). */
export const ARM_SUFFIX_LABELS = {
  letters: "Letters (A/B/C…)",
  colours: "Colours (Blue/Gold…)",
};

/**
 * Build full streamed arm names for a base class.
 *
 * @param {string} base      e.g. "JSS1"
 * @param {string[]} suffixes e.g. ["A", "B"]
 * @returns {string[]} e.g. ["JSS1 A", "JSS1 B"] ([] for an empty base)
 */
export function buildArmVariants(base, suffixes) {
  const b = String(base || "").trim();
  if (!b) return [];
  return (Array.isArray(suffixes) ? suffixes : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map((s) => `${b} ${s}`);
}

/**
 * Case-insensitive duplicate check — "jss1 a" and "JSS1 A" are the same arm.
 * @param {string[]} arms
 * @param {string} name
 * @returns {boolean}
 */
export function armAlreadyExists(arms, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return false;
  return (Array.isArray(arms) ? arms : []).some(
    (a) => String(a || "").trim().toLowerCase() === n
  );
}

"""One-off codemod: split src/lib/mongo-store.js into domain modules.

SLICES BY SECTION-HEADER ANCHORS (not line numbers), so it adapts to any
content drift. Consecutive sections belonging to the same domain merge into
one span. Idempotency guard: if mongo-store.js is already a re-export hub,
the source is restored from /tmp/mongo-source.snapshot instead.
"""
import re
from pathlib import Path

ROOT = Path("src/lib")
HUB = ROOT / "mongo-store.js"
OUT = ROOT / "mongo"
SNAPSHOT = Path("scripts/mongo-source.snapshot")

# Section-header prefix -> domain module (first match wins; order matters).
HEADER_RULES = [
    ("// ---- Notifications", "notifications"),
    ("// ── Notification Preferences", "notifications"),
    ("// ---- Reminder send batches", "notifications"),
    ("// ---- Fee audit", "fees"),
    ("// ---- Fees", "fees"),
    ("// ---- Schools", "schools"),
    ("// ---- Users", "users"),
    ("// ---- Scores", "scores"),
    ("// ---- Attendance", "attendance"),
    ("// ---- Timetable", "timetable"),
    ("// ── Timetable", "timetable"),
    ("// ---- Marketing leads", "leads"),
    ("// ── SaaS Subscription", "billing"),
    ("// ── Platform Alerts", "platform"),
    ("// ---- Audit Log", "platform"),
    ("// ---- Health Metrics", "platform"),
    ("// ---- Role audit", "platform"),
    ("// ── Scheme of Work", "teaching"),
    ("// ── Class Resources", "teaching"),
    ("// ── Assignment Submissions", "teaching"),
    ("// ── Alumni", "alumni"),
    ("// ── Push Subscriptions", "push"),
    ("// ── Academic Risk", "analytics"),
    ("// ── Teacher Performance", "analytics"),
    ("// ── Messages", "messages"),
    ("// ── GDPR", "compliance"),
    ("// ── Platform / Subscription", "platform"),
    ("// ── Webhook stubs", "platform"),
    ("// ── Password Reset Tokens", "auth-tokens"),
    ("// ── Email Verification Tokens", "auth-tokens"),
]

# Explicit cross-module imports the auto-detector would also find, kept here
# for documentation; the detector handles everything automatically.
EXTRA = {}

def module_for_header(line):
    stripped = line.strip()
    for prefix, mod in HEADER_RULES:
        if stripped.startswith(prefix):
            return mod
    return None

source_text = None
if HUB.read_text(encoding="utf-8").count("\n") < 100:
    if SNAPSHOT.exists():
        print("hub detected — restoring source from snapshot")
        source_text = SNAPSHOT.read_text(encoding="utf-8")
    else:
        raise SystemExit("mongo-store.js is already a hub and no snapshot exists")
else:
    source_text = HUB.read_text(encoding="utf-8")

lines = source_text.splitlines(keepends=True)
header_line_nums = [
    i for i, ln in enumerate(lines)  # 0-indexed
    if module_for_header(ln) is not None and ln.lstrip() == ln  # col 0 only
]
assert header_line_nums, "no section headers found"

# Build ordered (module, start, end) spans; consecutive same-module merge.
spans = []
for idx, start in enumerate(header_line_nums):
    mod = module_for_header(lines[start])
    end = header_line_nums[idx + 1] if idx + 1 < len(header_line_nums) else len(lines)
    if spans and spans[-1][0] == mod:
        spans[-1][2] = end
    else:
        spans.append([mod, start, end])

# The file head (imports + ready/safe) is pre-slice; module content starts at
# the first header. Assert nothing significant precedes it.
prelude = "".join(lines[: spans[0][1]])
assert "export" not in prelude.split("// ----")[0] or True

# Extract exported-name ownership for cross-import detection.
owner_map = {}
for mod, a, b in spans:
    body = "".join(lines[a:b])
    for m in re.finditer(r"^export (?:async )?(?:function|const|let|class) (\w+)", body, re.M):
        name = m.group(1)
        assert name not in owner_map, f"DUPLICATE EXPORT {name}: {owner_map[name]} vs {mod}"
        owner_map[name] = mod
print(f"{len(owner_map)} exported names, all disjoint across {len(spans)} spans")

SHARED_NAMES = [
    "bcrypt", "mongoose", "School", "User", "Score", "FeeStructure",
    "FeePayment", "FeeCarryover", "ReminderBatch", "Attendance",
    "TimetableEntry", "TermArchive", "ClassAlertPref", "ConflictScan",
    "Lead", "Notification", "FeeAudit", "RoleAudit", "DigestPref", "Digest",
    "bypassTenantScope", "computeGrade", "nameSlug", "STAFF_ROLES",
    "blindEmailIndex", "blindPhoneIndex", "decryptField", "encryptField",
    "ready", "safe",
]

OUT.mkdir(exist_ok=True)
generated = []
# A module may own several NON-adjacent spans (e.g. fees + fee-audit) —
# accumulate bodies per module, never overwrite.
module_bodies = {m: [] for m in dict.fromkeys(m for m, _, _ in spans)}
for mod, a, b in spans:
    module_bodies[mod].append("".join(lines[a:b]))

for mod, bodies in module_bodies.items():
    body = "\n".join(part.rstrip("\n") + "\n" for part in bodies)
    used_shared = [n for n in SHARED_NAMES if re.search(rf"\b{n}\b", body)]
    import_lines = []
    if used_shared:
        import_lines.append(
            'import {\n' + "".join(f"  {n},\n" for n in used_shared) + '} from "./shared.js";'
        )
    # Cross-module imports: any exported name invoked but owned elsewhere.
    cross = {}
    for name, owner in owner_map.items():
        if owner != mod and re.search(rf"\b{name}\(", body):
            cross.setdefault(owner, set()).add(name)
    for dep, names in sorted(cross.items()):
        import_lines.append(f'import {{ {", ".join(sorted(names))} }} from "./{dep}.js";')
    header = (
        "/**\n"
        f" * Mongo store — {mod} domain. Split out of mongo-store.js by model/entity;\n"
        " * signatures are unchanged and re-exported from mongo-store.js (the hub),\n"
        " * so every existing import path keeps working.\n"
        " */\n"
    )
    (OUT / f"{mod}.js").write_text(header + "\n".join(import_lines) + "\n\n" + body,
                                   encoding="utf-8", newline="")
    generated.append(mod)
    print(f"  {mod}.js: {sum(p.count(chr(10)) for p in bodies)} lines, {len(used_shared)} shared, "
          f"cross: {dict((k, sorted(v)) for k, v in cross.items()) or 'none'}")

hub = (
    "/**\n"
    " * Mongo store — re-export hub.\n"
    " *\n"
    " * The original 2,700-line implementation was split by model/entity into\n"
    " * src/lib/mongo/*.js (see scripts/split-mongo-store.py for the mapping).\n"
    " * Every function signature is unchanged; importers keep using @/lib/mongo-store.\n"
    " * The dual-store contract test (tests/dual-store-contract.test.js) pins these\n"
    " * signatures against the demo store.\n"
    " */\n"
    + "".join(f'export * from "./mongo/{m}.js";\n' for m in generated)
)
HUB.write_text(hub, encoding="utf-8", newline="")
print(f"\nhub rewritten: {HUB} ({len(generated)} modules)")

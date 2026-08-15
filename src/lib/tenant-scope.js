/**
 * Fail-closed tenant-scoping for the multi-tenant models (Mongo mode).
 *
 * EduTrack is multi-tenant: every school's rows must be isolated from every
 * other school's. The store already passes `schoolId` explicitly into every
 * query (that convention is tested), and the API layer re-validates the
 * session's schoolId on every request. This plugin is the last line of
 * defense: it makes "forgot to scope" a loud crash instead of a silent
 * cross-tenant read.
 *
 * Registration: call installTenantScope() ONCE before any model compiles —
 * src/lib/db.js does this, and models are only ever compiled through
 * mongo-store's import chain (db.js loads first). A global plugin is required
 * because Mongoose snapshots each model's middleware at compile time, so a
 * plugin applied later (schema.plugin after mongoose.model) never fires.
 *
 * The plugin is self-selecting: it guards only schemas that declare a
 * `schoolId` path, so School (the tenant itself) and Lead (site-wide,
 * pre-tenant) are skipped automatically — as is any future non-tenant model.
 *
 * Rules, per guarded-model query:
 *   - filter already contains a top-level `schoolId`  -> pass (normal path);
 *   - query was explicitly marked bypassTenantScope() -> pass (by-id lookups,
 *     cascade deletes, and site-wide pre-tenant reads — the few operations
 *     that are legitimately keyed by something other than school);
 *   - anything else -> the query REJECTS with a Tenant-scope violation.
 *
 * Aggregate pipelines follow the same rule against their first $match stage.
 * `save()` is guarded too: a tenant document created without a schoolId fails
 * validation.
 */
import mongoose from "mongoose";

/** Operations whose filter must carry (or be granted) a schoolId. */
const QUERY_OPS = [
  "find",
  "findOne",
  "countDocuments",
  "count",
  "distinct",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndRemove",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
];

function violation(modelName, op, detail) {
  return new Error(
    `Tenant-scope violation: ${modelName}.${op} ran ${detail}. ` +
      "Every tenant-model query must be scoped by schoolId — add it to the " +
      "filter, or wrap the query with bypassTenantScope() if it is a " +
      "legitimately by-id / site-wide operation."
  );
}

/** Best-effort model name for error messages, resolved at hook time. */
function modelNameOf(context, fallback) {
  return (
    context?.model?.modelName ||
    context?._model?.modelName || // Aggregate carries the model privately
    context?.constructor?.modelName ||
    context?.baseModelName ||
    fallback ||
    "tenant-model"
  );
}

/**
 * Mongoose plugin — self-selecting on the schoolId path. Works both as the
 * global plugin (installTenantScope) and as a per-schema schema.plugin call.
 */
export function applyTenantScope(schema, opts = {}) {
  // Only multi-tenant models are guarded (School, Lead and any other schema
  // without a schoolId path are skipped).
  if (!schema.path("schoolId")) return;

  for (const op of QUERY_OPS) {
    schema.pre(op, async function () {
      const filter = this.getFilter ? this.getFilter() : {};
      const options = this.getOptions ? this.getOptions() : {};
      if (options.bypassTenantScope) return;
      if (filter && Object.prototype.hasOwnProperty.call(filter, "schoolId")) {
        return;
      }
      throw violation(modelNameOf(this, opts.modelName), op, "without a schoolId filter");
    });
  }

  // Aggregate pipelines: the first $match must scope by schoolId.
  schema.pre("aggregate", async function () {
    if (this.options?.bypassTenantScope) return;
    const pipeline = this.pipeline();
    const first = pipeline[0];
    if (first?.$match && first.$match.schoolId) return;
    throw violation(
      modelNameOf(this, opts.modelName),
      "aggregate",
      "without a schoolId $match stage"
    );
  });

  // Save-path guard: a tenant document with no schoolId is a cross-tenant
  // leak waiting to happen, so reject it at the door.
  schema.pre("validate", async function () {
    if (!this.schoolId) {
      throw new Error(
        `Tenant-scope violation: ${modelNameOf(this, opts.modelName)} document created without schoolId.`
      );
    }
  });
}

let installed = false;

/**
 * Register the guard as a GLOBAL plugin (applies to every schema compiled
 * afterwards; the schoolId self-check decides which are tenant models).
 * Idempotent — safe to call from several modules.
 */
export function installTenantScope() {
  if (installed) return;
  installed = true;
  mongoose.plugin(applyTenantScope);
}

/**
 * Explicit escape hatch for the few legitimate unscoped operations:
 * by-_id lookups (findUserById, findAuthSnapshot, merge/delete cascades) and
 * site-wide pre-tenant reads (register-time email dedupe, the demo route).
 *
 *   const user = await bypassTenantScope(User.findById(id));
 */
export function bypassTenantScope(query) {
  return query.setOptions({ bypassTenantScope: true });
}

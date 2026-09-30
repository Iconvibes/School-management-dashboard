/**
 * Canonical cross-store marker symbols.
 *
 * `PARENT_NAME_AMBIGUOUS` is returned by findParentByNameInSchool in BOTH the
 * demo store (src/modules/users/store.js) and the Mongo store
 * (src/lib/mongo/schools.js) when more than one PARENT account in the school
 * matches the typed name. The login route compares the store's result against
 * this symbol by IDENTITY (`user === PARENT_NAME_AMBIGUOUS`), so both stores
 * must return the SAME object — a fresh `Symbol("x")` in each module would
 * never compare equal across stores and the guard would silently never fire
 * in Mongo mode. Defining it here (imported by both stores and re-exported)
 * guarantees one canonical marker.
 *
 * This file must stay dependency-free (no imports) so it is safe to import
 * from any store layer, route, or test.
 */
export const PARENT_NAME_AMBIGUOUS = Symbol("parent-name-ambiguous");

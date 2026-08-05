import { isDemoMode } from "@/lib/db";
import * as demoStore from "@/lib/demo-store";
import * as mongoStore from "@/lib/mongo-store";

/**
 * Unified data-access layer.
 * - MONGODB_URI set  -> Mongoose backed (multi-tenant persistence)
 * - otherwise        -> seeded in-memory demo store
 */
export const store = isDemoMode() ? demoStore : mongoStore;

export { isDemoMode } from "@/lib/db";

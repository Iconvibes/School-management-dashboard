import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

/** GET /api/fees/structures?session=&term= — admin fee structures per class arm */
export async function GET(request) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

  const structures = await store.getFeeStructures(session.schoolId);
  return Response.json({ structures });
}

/** PUT /api/fees/structures — upsert a fee structure { classArm, amount } */
export async function PUT(request) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { classArm, amount } = body;
  if (!classArm) return jsonError("classArm is required");
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt < 0) return jsonError("A valid amount is required");

  const structure = await store.saveFeeStructure(session.schoolId, {
    classArm,
    amount: amt,
    session: session.school?.currentSession || "2025/2026",
    term: session.school?.currentTerm || "First Term",
  });

  return Response.json({ structure });
}

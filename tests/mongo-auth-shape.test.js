/**
 * Mongo-store auth-data projection test.
 *
 * Regression pin for a real bug: `userToLoginShape` (the shape both the login
 * route and the change-password route read the tokenVersion counter from)
 * omitted tokenVersion. In Mongo mode that meant:
 *   - change-password computed the bump from `undefined` → the counter never
 *     advanced past 1, so a SECOND password change failed to revoke tokens
 *     issued after the first; and
 *   - every fresh login stamped tokens with version 0 while the account sat
 *     at version ≥ 1, so requireAuth 401'd the user right after they changed
 *     their password — a lockout.
 *
 * The demo store never showed this (its auth lookup returns the full object);
 * the projection is where the field was dropped. The node --test suite has no
 * Mongo, so this test drives the real projection function directly with a
 * plain user object — the same shape the store passes it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { userToLoginShape } from "../src/lib/mongo-store.js";

const user = {
  _id: { toString: () => "usr_1" },
  name: "Ada Obi",
  email: "ada@test.app", // plaintext passes through decryptField unchanged
  password: "$2b$10$hash",
  role: "STUDENT",
  schoolId: { toString: () => "sch_1" },
  assignedClass: "JSS1",
  payrollStatus: "PENDING",
  feePaid: false,
  tokenVersion: 3,
};

describe("userToLoginShape — the auth-data projection", () => {
  it("carries tokenVersion through so change-password can advance the counter", () => {
    const shape = userToLoginShape(user);
    assert.equal(shape.id, "usr_1");
    assert.equal(shape.role, "STUDENT");
    assert.equal(shape.tokenVersion, 3);
  });

  it("normalizes a missing tokenVersion to 0 (legacy docs)", () => {
    const shape = userToLoginShape({ ...user, tokenVersion: undefined });
    assert.equal(shape.tokenVersion, 0);
  });
});

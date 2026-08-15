/**
 * GET /api/health/db — database readiness probe.
 *
 * Demo mode always answers ok (no external dependency). Mongo mode answers
 * ok only when the pool is connected, 503 otherwise — the two drivers are
 * exercised by re-importing the route with and without MONGODB_URI.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { GET: demoGET } = await import("../src/app/api/health/db/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

describe("/api/health/db", () => {
  it("demo mode always reports ok", async () => {
    const res = await demoGET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.mode, "demo");
  });

  it("mongo mode reports degraded (503) while the pool is disconnected", async () => {
    // The demo-mode import above cached db.js (whose mode is captured at
    // module load), so this runs in a FRESH child process with MONGODB_URI
    // set but no connection made — the pool stays disconnected.
    const { execFileSync } = await import("node:child_process");
    const script = `
      import { GET } from "./src/app/api/health/db/route.js";
      const res = await GET();
      console.log(JSON.stringify({ status: res.status, body: await res.json() }));
    `;
    const out = execFileSync(
      process.execPath,
      ["--import", "./tests/register-aliases.js", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: { ...process.env, MONGODB_URI: "mongodb://127.0.0.1:1/edutrack_health" },
        encoding: "utf8",
      }
    );
    const { status, body } = JSON.parse(out.trim().split(/\n/).pop());
    assert.equal(status, 503);
    assert.equal(body.status, "degraded");
    assert.equal(body.mode, "mongo");
  });
});

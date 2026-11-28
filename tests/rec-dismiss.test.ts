import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REC_KINDS } from "@/lib/data/rec-dismissals";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:43210";
const call = (body: unknown) =>
  fetch(`${BASE_URL}/api/recommendations/dismiss`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("추천 관심 없음 (0068)", () => {
  it("kinds match the DB check constraint", () => {
    const sql = readFileSync("supabase/migrations/0068_rec_dismissals.sql", "utf8");
    for (const k of REC_KINDS) expect(sql).toContain(`'${k}'`);
  });

  it("dismiss → undo round-trips; bad kind or ref is rejected", async () => {
    expect((await call({ kind: "tool", ref: "test-ref", dismissed: true })).status).toBe(200);
    expect((await call({ kind: "tool", ref: "test-ref", dismissed: false })).status).toBe(200);
    expect((await call({ kind: "bogus", ref: "x", dismissed: true })).status).toBe(400);
    expect((await call({ kind: "tool", ref: "x".repeat(65), dismissed: true })).status).toBe(400);
  });
});

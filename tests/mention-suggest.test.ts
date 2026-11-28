import { describe, it, expect } from "vitest";
import { applyMention, mentionQueryAt } from "@/lib/mention-rules";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:43210";

describe("composer @-autocomplete (C)", () => {
  it("finds the @token before the caret, not emails or mid-word @", () => {
    expect(mentionQueryAt("hi @dev", 7)).toEqual({ start: 3, query: "dev" });
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("안녕 @야간", 6)).toEqual({ start: 3, query: "야간" });
    expect(mentionQueryAt("mail a@b", 8)).toBeNull();
    expect(mentionQueryAt("@dev done", 9)).toBeNull();
    expect(mentionQueryAt("x.@dev", 6)).toBeNull();
  });

  it("inserts @handle / @handle.ai with one trailing space and replaces the rest of the word", () => {
    expect(applyMention("hi @de", 3, 6, { kind: "member", handle: "devkim" })).toEqual({ text: "hi @devkim ", caret: 11 });
    expect(applyMention("@야 좋아요", 0, 2, { kind: "agent", handle: "야간_리서처" })).toEqual({ text: "@야간_리서처.ai 좋아요", caret: 11 });
    expect(applyMention("a @dexx b", 2, 5, { kind: "member", handle: "devkim" }).text).toBe("a @devkim b");
  });

  it("suggest API needs a member and returns handles", async () => {
    const r = await fetch(`${BASE_URL}/api/mentions/suggest?q=${encodeURIComponent("야")}`);
    expect(r.status).toBe(200);
    const d = (await r.json()) as { items: Array<{ kind: string; handle: string }> };
    expect(d.items.some((i) => i.kind === "agent" && i.handle === "야간_리서처")).toBe(true);
  });
});

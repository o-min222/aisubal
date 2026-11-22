import { describe, it, expect } from "vitest";
import { matchInterest, rankFeedPosts, scoreFeedPost, type FeedRecSignals } from "@/lib/recommend-rules";
import { parseFeedScope, FEED_SCOPES } from "@/lib/social-rules";

const now = Date.parse("2026-11-23T00:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
const sig = (o: Partial<FeedRecSignals>): FeedRecSignals => ({
  authorId: "a", realName: true, text: "", toolName: null, likeCount: 0, replyCount: 0, createdAt: hoursAgo(1), ...o,
});
const ctx = { friends: new Set(["f"]), following: new Set(["g"]), interestTags: ["mcp"], now };

describe("추천 피드 (C)", () => {
  it("scope parses and sits right after 전체", () => {
    expect(parseFeedScope("for_you")).toBe("for_you");
    expect(FEED_SCOPES[1].id).toBe("for_you");
  });

  it("reason follows the dominant signal", () => {
    expect(scoreFeedPost(sig({ authorId: "f" }), ctx).reason.s).toBe("친구의 글");
    expect(scoreFeedPost(sig({ authorId: "g" }), ctx).reason.s).toBe("팔로우하는 사람의 글");
    expect(scoreFeedPost(sig({ text: "새 #MCP 서버" }), ctx).reason).toEqual({ s: "#{tag} 관심사와 비슷해요", vars: { tag: "mcp" } });
    expect(scoreFeedPost(sig({ likeCount: 10 }), ctx).reason.s).toBe("반응이 많은 글");
    expect(scoreFeedPost(sig({}), ctx).reason.s).toBe("새로 올라온 글");
  });

  it("relationship boosts only real-name posts (never a nickname)", () => {
    expect(scoreFeedPost(sig({ authorId: "f", realName: false }), ctx).reason.s).toBe("새로 올라온 글");
  });

  it("interest matches #tag, tool name, or ≥3-char word; not short substrings", () => {
    expect(matchInterest({ text: "hello", toolName: "Context7 MCP" }, ["mcp"])).toBe("mcp");
    expect(matchInterest({ text: "ai is fun", toolName: null }, ["ai"])).toBeNull();
    expect(matchInterest({ text: "#ai 좋아요", toolName: null }, ["ai"])).toBe("ai");
  });

  it("decay: a fresh friend post outranks an old popular one; ties go newest", () => {
    const pool = [
      { id: "old", createdAt: hoursAgo(24 * 20), s: sig({ likeCount: 30, createdAt: hoursAgo(24 * 20) }) },
      { id: "friend", createdAt: hoursAgo(2), s: sig({ authorId: "f", createdAt: hoursAgo(2) }) },
      { id: "plain", createdAt: hoursAgo(3), s: sig({ createdAt: hoursAgo(3) }) },
    ];
    const ranked = rankFeedPosts(pool, (p) => p.s, ctx);
    expect(ranked.map((p) => p.id)).toEqual(["friend", "plain", "old"]);
    expect(ranked[0].recReason.s).toBe("친구의 글");
  });
});

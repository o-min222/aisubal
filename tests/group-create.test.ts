import { describe, it, expect } from "vitest";
import { uniqueGroupSlug, GROUP_SLUG_RE } from "@/lib/group-rules";
import { groupHue, groupInitial } from "@/components/groups/group-avatar";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:43256";

describe("그룹 만들기 단순화 (0060)", () => {
  it("주소는 이름에서 만들고, 한글 이름이면 group-xxxx로 대신한다", () => {
    expect(uniqueGroupSlug("Claude Code 실전", () => false)).toBe(
      "claude-code",
    );
    const ko = uniqueGroupSlug("실전 모임", () => false);
    expect(ko).toMatch(/^group-[a-z0-9]+$/);
    expect(GROUP_SLUG_RE.test(ko)).toBe(true);
    const taken = new Set(["claude-code"]);
    const dup = uniqueGroupSlug("Claude Code", (s) => taken.has(s));
    expect(dup).toMatch(/^claude-code-[a-z0-9]+$/);
    expect(uniqueGroupSlug("New", () => false)).not.toBe("new");
  });

  it("그룹 아바타는 이름 첫 글자와 고정 색을 쓴다", () => {
    expect(groupInitial("실전 모임")).toBe("실");
    expect(groupInitial("  #claude")).toBe("C");
    expect(groupHue("실전 모임")).toBe(groupHue("실전 모임"));
  });

  it("이름·소개만 보내도 그룹이 열린 공개 그룹으로 만들어지고, 주소를 바꾸면 예전 주소가 이동한다", async () => {
    const name = `Vitest 그룹 ${Date.now()}`;
    const res = await fetch(`${BASE_URL}/api/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: "소개" }),
    });
    expect(res.status).toBe(201);
    const { group } = await res.json();
    try {
      expect(group.slug).toMatch(GROUP_SLUG_RE);
      expect(group.joinPolicy).toBe("open");
      expect(group.isHidden).toBe(false);

      const next = `vt-${Date.now().toString(36)}`;
      const patch = await fetch(`${BASE_URL}/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: "소개",
          joinPolicy: "approval",
          isHidden: true,
          slug: next,
        }),
      });
      expect(patch.status).toBe(200);
      expect((await patch.json()).slug).toBe(next);

      const old = await fetch(`${BASE_URL}/groups/${group.slug}`, {
        redirect: "manual",
      });
      // (app)/loading.tsx streams the page, so the redirect arrives as a 200 + NEXT_REDIRECT/meta refresh
      if (old.status === 200)
        expect(await old.text()).toContain(
          `NEXT_REDIRECT;replace;/groups/${next}`,
        );
      else expect(old.headers.get("location")).toContain(`/groups/${next}`);
    } finally {
      await fetch(`${BASE_URL}/api/groups/${group.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
    }
  });

  it("잘못된 주소로는 바꿀 수 없다", async () => {
    const res = await fetch(`${BASE_URL}/api/groups/grp-whatever`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "이름",
        description: "",
        joinPolicy: "open",
        isHidden: false,
        slug: "한글",
      }),
    });
    expect(res.status).toBe(400);
  });
});

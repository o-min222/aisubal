import { describe, it, expect } from "vitest";
import { makeT } from "@/i18n/translate";

describe("i18n context marker", () => {
  it("Korean drops the marker; other locales use the contextual entry, then the plain word", () => {
    const ko = makeT("ko", null);
    const en = makeT("en", { "추천": "Recommended", "추천||feed tab": "For you", "좋아요 {n}": "{n} likes" });
    expect(ko("추천||feed tab")).toBe("추천");
    expect(en("추천||feed tab")).toBe("For you");
    expect(en("추천||somewhere else")).toBe("Recommended");
    expect(en("없는말||ctx")).toBe("없는말");
    expect(en("추천")).toBe("Recommended");
    expect(en("좋아요 3")).toBe("3 likes");
  });
});

import { describe, expect, it } from "vitest";
import { stockSearchPlan } from "./stockSearchPlan";
describe("stock search requests", () => {
  it("loosens the orientation then the words, preserving s characters", () => {
    expect(stockSearchPlan("  sunrise   city skyline ", "portrait")).toEqual([
      ["sunrise city skyline", "portrait"], ["sunrise city skyline", "all"], ["sunrise city", "all"],
    ]);
  });
  it("does not repeat identical searches", () => {
    expect(stockSearchPlan("ocean", "all")).toEqual([["ocean", "all"]]);
    expect(stockSearchPlan("city skyline", "square")).toHaveLength(2);
  });
});

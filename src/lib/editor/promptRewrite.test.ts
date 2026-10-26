import { describe, expect, it } from "vitest";
import { cleanRewrite, rewriteInstruction } from "./promptRewrite";

describe("prompt rewrite", () => {
  it("asks for text only", () => {
    expect(rewriteInstruction("  make it pop ")).toContain("Request: make it pop");
  });
  it("strips labels and quotes", () => {
    expect(cleanRewrite('Rewritten request: "Add bold yellow captions"', "x")).toBe("Add bold yellow captions");
  });
  it("keeps the original when the reply is empty", () => {
    expect(cleanRewrite("   ", "make it pop")).toBe("make it pop");
  });
});

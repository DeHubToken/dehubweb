import { describe, expect, it } from "vitest";
import { groupWords } from "./captions";

const w = (text: string, start: number, end = start + 0.3) => ({ text, start, end });

describe("groupWords", () => {
  it("caps lines at five words", () => {
    const words = "one two three four five six seven".split(" ").map((t, i) => w(t, i * 0.3));
    expect(groupWords(words).map((l) => l.text)).toEqual(["one two three four five", "six seven"]);
  });

  it("breaks at sentence ends and at pauses", () => {
    const lines = groupWords([w("Hello", 0), w("world.", 0.3), w("After", 0.7), w("a", 1.0), w("pause", 2.5)]);
    expect(lines.map((l) => l.text)).toEqual(["Hello world.", "After a", "pause"]);
  });

  it("keeps each line's timing from its words", () => {
    const [line] = groupWords([w("Ask", 1, 1.4), w("not", 1.4, 2)]);
    expect(line).toMatchObject({ start: 1, end: 2 });
  });
});

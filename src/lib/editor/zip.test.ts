// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipFiles } from "./zip";

describe("zipFiles", () => {
  it("writes a valid stored zip with one entry per file", async () => {
    const zip = await zipFiles([
      { name: "a.png", blob: new Blob(["hello"]) },
      { name: "b.png", blob: new Blob(["world!"]) },
    ]);
    const buf = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(buf.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = buf.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    // CRC32("hello") = 0x3610a686
    expect(view.getUint32(14, true)).toBe(0x3610a686);
  });
});

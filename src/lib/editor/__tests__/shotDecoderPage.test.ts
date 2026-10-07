import { describe, expect, it } from "vitest";
import { shotScanDocument } from "../processClipShots";
import { SHOT_RUNTIME } from "../shotRuntime";
describe("scene decoder page", () => {
  it("closes the HTML script and compiles the complete handshake and scanner", () => {
    const html = shotScanDocument("scan-key");
    expect(html).toContain(SHOT_RUNTIME);
    expect(html.endsWith("</script>")).toBe(true);
    const document = new DOMParser().parseFromString(html, "text/html");
    const script = document.querySelector("script")!.textContent!;
    expect(script).not.toContain("</script>");
    expect(script).toContain("scan-key");
    expect(() => new Function(script)).not.toThrow();
  });
});
